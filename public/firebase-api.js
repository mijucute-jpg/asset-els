/* Firebase(Firestore + Google 로그인) 연결. index.html 의 gsCall() 이 이 FBAPI 를 호출합니다. */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc, writeBatch }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

try {
  const cfg = window.FIREBASE_CONFIG;
  if (!cfg || !cfg.projectId || /여기에/.test(cfg.projectId)) throw new Error("firebase-config.js 에 Firebase 설정값을 넣어주세요");
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const COL = "els_entries";
  const allowed = String(window.ALLOWED_EMAIL || "").toLowerCase();

  const clean = (o) => {
    const out = {};
    Object.keys(o).forEach((k) => { if (o[k] !== undefined) out[k] = o[k]; });
    return out;
  };
  const randId = () => "ELS-" + Math.random().toString(36).slice(2, 10);
  let cache = [];

  window.FBAPI = {
    signIn: () => signInWithPopup(auth, new GoogleAuthProvider()),
    signOut: () => signOut(auth),
    onUser: (cb) => onAuthStateChanged(auth, (u) => {
      if (!u) return cb({ ok: false });
      if (allowed && (u.email || "").toLowerCase() !== allowed) {
        signOut(auth);
        return cb({ ok: false, message: "허용되지 않은 계정입니다: " + u.email });
      }
      cb({ ok: true, user: u });
    }),
    async getEntries() {
      const snap = await getDocs(collection(db, COL));
      cache = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      return cache;
    },
    async addEntry(d) {
      const no = cache.reduce((m, e) => Math.max(m, Number(e.no) || 0), 0) + 1;
      const id = randId();
      await setDoc(doc(db, COL, id), clean({ ...d, id, no }));
      return { status: "ok", id };
    },
    async updateEntry(d) {
      if (!d.id) throw new Error("ID가 없습니다.");
      await setDoc(doc(db, COL, d.id), clean(d), { merge: true });
      return { status: "ok" };
    },
    async deleteEntry(id) {
      await deleteDoc(doc(db, COL, id));
      return { status: "ok" };
    },
    /* 시트 CSV 에서 변환한 항목들을 한꺼번에 저장 (같은 ID 가 있으면 덮어씀) */
    async importEntries(list) {
      let n = 0;
      for (let i = 0; i < list.length; i += 400) {
        const batch = writeBatch(db);
        list.slice(i, i + 400).forEach((e) => {
          const id = e.id || randId();
          batch.set(doc(db, COL, id), clean({ ...e, id }));
          n++;
        });
        await batch.commit();
      }
      return { status: "ok", count: n };
    },
    async getStockPrices(names) {
      const url = window.PRICE_API_URL;
      if (!url) return {};
      const q = (names || []).join(",");
      if (/script\.google\.com/.test(url)) {
        // Apps Script 웹앱: CORS 제한을 피하려고 JSONP(스크립트 태그)로 호출
        return await new Promise((resolve, reject) => {
          const cb = "__px" + Date.now();
          const sc = document.createElement("script");
          const done = () => { delete window[cb]; sc.remove(); };
          const timer = setTimeout(() => { done(); reject(new Error("시세 조회 시간 초과")); }, 15000);
          window[cb] = (data) => { clearTimeout(timer); done(); resolve(data || {}); };
          sc.onerror = () => { clearTimeout(timer); done(); reject(new Error("시세 주소를 불러오지 못했습니다 (배포 권한/주소 확인)")); };
          sc.src = url + (url.indexOf("?") < 0 ? "?" : "&") + "action=prices&callback=" + cb + "&names=" + encodeURIComponent(q);
          document.head.appendChild(sc);
        });
      }
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(url + "?names=" + encodeURIComponent(q), { headers: { Authorization: "Bearer " + token } });
      if (!res.ok) throw new Error("시세 조회 실패 " + res.status);
      return await res.json();
    },
    /* ELS 탭만 있는 복사본이라 아래는 빈 값 */
    async getLoanEntries() { return []; },
    async getRealEstateWatchlist() { return []; },
    async getCashAssets() { return []; },
  };
  window.__fbOk();
} catch (e) {
  window.__fbFail(e);
}
