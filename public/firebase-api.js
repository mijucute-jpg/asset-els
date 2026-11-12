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

  /* Apps Script 웹앱 호출(JSONP). 시세/부동산 실거래 조회에 사용 */
  const jsonp = (params, timeoutMs) => new Promise((resolve, reject) => {
    const base = window.PRICE_API_URL;
    if (!base) return reject(new Error("firebase-config.js 의 PRICE_API_URL(Apps Script 웹앱 주소)이 비어 있습니다"));
    const cb = "__jp" + Date.now() + Math.floor(Math.random() * 1000);
    const sc = document.createElement("script");
    const done = () => { delete window[cb]; sc.remove(); };
    const timer = setTimeout(() => { done(); reject(new Error("조회 시간 초과")); }, timeoutMs || 60000);
    window[cb] = (data) => { clearTimeout(timer); done(); resolve(data || {}); };
    sc.onerror = () => { clearTimeout(timer); console.error("JSONP 실패 주소(새 탭에 붙여 넣어 응답을 확인하세요):", sc.src); try { window.prompt("[진단] 아래 주소를 전체 복사(Ctrl+C)해서 새 탭에 열어보세요", sc.src); } catch (e) {} done(); reject(new Error("Apps Script 주소를 불러오지 못했습니다 (배포 권한/주소 확인). 개발자도구(F12) 콘솔의 주소를 새 탭에서 열어보세요")); };
    const q = Object.keys(params).map((k) => k + "=" + encodeURIComponent(params[k])).join("&");
    sc.src = base + (base.indexOf("?") < 0 ? "?" : "&") + q + "&callback=" + cb;
    document.head.appendChild(sc);
  });
  const readAll = async (col) => (await getDocs(collection(db, col))).docs.map((d) => ({ ...d.data(), __id: d.id }));
  const watchSlim = (list) => JSON.stringify(list.map((w) => ({
    ID: w["ID"], "단지명": w["단지명"], "법정동코드": String(w["법정동코드"] || "").slice(0, 5), "전용면적": w["전용면적"],
  })));
  const WATCH = "realestate_watch", LOANS = "loans";

  const importInto = async (col, idKey, prefix, list) => {
    let n = 0;
    for (let i = 0; i < list.length; i += 400) {
      const batch = writeBatch(db);
      list.slice(i, i + 400).forEach((e) => {
        const id = e[idKey] || (prefix + Math.random().toString(36).slice(2, 10));
        batch.set(doc(db, col, id), clean({ ...e, [idKey]: id }));
        n++;
      });
      await batch.commit();
    }
    return { status: "ok", count: n };
  };

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
      return await jsonp({ action: "prices", names: (names || []).join(",") }, 15000);
    },

    /* ---- 대출 (컬렉션 loans, 문서 ID = 대출ID, 필드는 시트 헤더와 같은 한글 이름) ---- */
    async getLoanEntries() { return (await readAll(LOANS)).map(({ __id, ...r }) => ({ ...r, "대출ID": r["대출ID"] || __id })); },
    async saveLoan(d) {
      const id = d["대출ID"] || ("LN-" + Math.random().toString(36).slice(2, 10));
      await setDoc(doc(db, LOANS, id), clean({ ...d, "대출ID": id }));
      return { status: "ok", id };
    },
    async deleteLoan(id) { await deleteDoc(doc(db, LOANS, id)); return { status: "ok" }; },
    async importLoans(list) { return importInto(LOANS, "대출ID", "LN-", list); },

    /* ---- 부동산 관심단지 (컬렉션 realestate_watch) ---- */
    async getRealEstateWatchlist() {
      return (await readAll(WATCH)).map(({ __id, ...r }) => ({ ...r, ID: r.ID || __id }))
        .sort((a, b) => String(a.ID).localeCompare(String(b.ID)));
    },
    async saveWatch(d) {
      const id = d.ID || ("RE-" + Math.random().toString(36).slice(2, 10));
      await setDoc(doc(db, WATCH, id), clean({ ...d, ID: id }));
      return { status: "ok", id };
    },
    async deleteWatch(id) { await deleteDoc(doc(db, WATCH, id)); return { status: "ok" }; },
    async importWatch(list) { return importInto(WATCH, "ID", "RE-", list); },
    /* 실거래 조회는 Apps Script(국토부 API 키 보유)에 관심단지 목록을 넘겨 받아온다 */
    async getRealEstateDashboard() {
      const watchlist = await window.FBAPI.getRealEstateWatchlist();
      if (!watchlist.length) return { watchlist, trades: [] };
      const r = await jsonp({ action: "reTrades", wl: watchSlim(watchlist) }, 120000);
      if (r.error) throw new Error(r.error);
      const trades = r.trades || [];
      // 평가액이 비어 있는 단지는 최근 실거래가로 한 번만 채워 넣는다 (시트 버전과 같은 동작)
      const latest = {};
      trades.forEach((t) => { if (!(t.watchId in latest)) latest[t.watchId] = t; });
      for (const w of watchlist) {
        const empty = w["평가액"] === "" || w["평가액"] === null || w["평가액"] === undefined;
        if (empty && latest[w.ID]) {
          w["평가액"] = latest[w.ID].amount;
          await setDoc(doc(db, WATCH, w.ID), { "평가액": latest[w.ID].amount }, { merge: true });
        }
      }
      return { watchlist, trades };
    },
    async getRealEstateCachedDashboard() { return window.FBAPI.getRealEstateDashboard(); },
    async forceRefreshRealEstateCache(monthsBack) {
      const watchlist = await window.FBAPI.getRealEstateWatchlist();
      if (!watchlist.length) return { cachedMonths: [] };
      const r = await jsonp({ action: "reForce", months: monthsBack === 6 ? 6 : 3, wl: watchSlim(watchlist) }, 280000);
      if (r.error) throw new Error(r.error);
      return r;
    },
    /* 종합 탭용(현재 사본에는 없음) */
    async getCashAssets() { return []; },
  };
  window.__fbOk();
} catch (e) {
  window.__fbFail(e);
}
