/* Firebase(Firestore + Google 로그인) 연결. index.html 의 gsCall() 이 이 FBAPI 를 호출합니다. */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, getDocs, getDoc, doc, setDoc, deleteDoc, writeBatch }
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
    sc.onerror = () => { clearTimeout(timer); console.error("JSONP 실패:", sc.src); done(); reject(new Error("Apps Script 주소를 불러오지 못했습니다 (배포 권한/주소 확인, 또는 응답 시간 초과)")); };
    const q = Object.keys(params).map((k) => k + "=" + encodeURIComponent(params[k])).join("&");
    sc.src = base + (base.indexOf("?") < 0 ? "?" : "&") + q + "&callback=" + cb;
    document.head.appendChild(sc);
  });
  const readAll = async (col) => (await getDocs(collection(db, col))).docs.map((d) => ({ ...d.data(), __id: d.id }));
  const watchSlim = (list) => JSON.stringify(list.map((w) => ({
    ID: w["ID"], "단지명": w["단지명"], "법정동코드": String(w["법정동코드"] || "").slice(0, 5), "전용면적": w["전용면적"],
  })));
  const WATCH = "realestate_watch", LOANS = "loans", CASH = "cash_assets";
  /* 단지별로 나눠 하나씩 요청(한 번에 여러 단지를 보내면 Apps Script 응답이 늦어 실패함) */
  const perItem = async (action, extra, watchlist, timeoutMs, onPartial) => {
    const out = { trades: [], cachedMonths: [] }; let ok = 0, lastErr = null;
    const byWatch = {};
    // 같은 지역(법정동코드 앞 5자리)은 차례로, 다른 지역은 동시에 요청 → 전체 시간이 크게 줄어듦
    const groups = {};
    watchlist.forEach((w) => { const k = String(w["법정동코드"] || "").slice(0, 5); (groups[k] = groups[k] || []).push(w); });
    await Promise.all(Object.values(groups).map(async (list) => {
      for (const w of list) {
        try {
          const r = await jsonp({ action, ...extra, wl: watchSlim([w]) }, timeoutMs);
          if (r.error) throw new Error(r.error);
          byWatch[w.ID] = r.trades || [];
          (r.cachedMonths || []).forEach((m) => { if (out.cachedMonths.indexOf(m) < 0) out.cachedMonths.push(m); });
          ok++;
          if (onPartial) try { onPartial(w.ID, byWatch[w.ID]); } catch (e) {}
        } catch (e) { lastErr = e; console.error("조회 실패:", w["단지명"], e); }
      }
    }));
    if (!ok && lastErr) throw lastErr;
    watchlist.forEach((w) => out.trades.push(...(byWatch[w.ID] || [])));
    out.trades.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return out;
  };


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


  /* ---- 연금 (문서 pension/state 하나에 화면 상태를 JSON 글자로 저장) ---- */
  const PEN_NUM = (v) => { const n = Number(String(v == null ? "" : v).replace(/[,\s]|만원|세|%/g, "")); return isFinite(n) ? n : 0; };
  const PEN_BOOL = (v) => v === true || String(v).toLowerCase() === "true";
  const PEN_SET = [["infl","n"],["inflOn","b"],["realOn","b"],["taxLow","s"],["taxHigh","s"],["npBase","s"],["mode","s"],["unit","s"],["nextId","n"]];
  const PEN_PLAN = (text) => {
    const plan = [];
    String(text || "").split(/[\/;|\n]/).forEach((part) => {
      const m = part.match(/(\d+)\s*세?\s*[~\-–]\s*(\d+)\s*세?\s*[:：]?\s*([\d.,]+)/);
      if (m) plan.push({ from: Number(m[1]), to: Number(m[2]), amt: Number(m[3].replace(/,/g, "")) });
    });
    return plan;
  };
  /* 시트 "연금설정"/"연금계좌" 를 CSV로 내려받아 읽은 줄(첫 줄=제목 포함)을 화면 상태로 바꿈 (Code.gs readPensionData_ 와 같은 규칙) */
  const pensionFromRows = (setRows, acRows) => {
    const kv = {};
    setRows.slice(1).forEach((r) => { if (r[0] !== "" && r[1] !== "" && r[1] != null) kv[String(r[0]).trim()] = r[1]; });
    const S = {};
    PEN_SET.forEach(([k, t]) => {
      if (kv[k] === undefined || k === "nextId") return;
      S[k] = t === "n" ? Number(PEN_NUM(kv[k])) : t === "b" ? PEN_BOOL(kv[k]) : String(kv[k]);
    });
    S.people = [0, 1, 2].map((i) => {
      const g = (key) => kv["p" + i + "_" + key];
      const p = { np: {} };
      if (g("name") !== undefined) p.name = String(g("name"));
      if (g("curAge") !== undefined) p.curAge = PEN_NUM(g("curAge"));
      if (g("endAge") !== undefined) p.endAge = PEN_NUM(g("endAge"));
      if (g("npOn") !== undefined) p.npOn = PEN_BOOL(g("npOn"));
      if (g("npMonthly") !== undefined) p.np.monthly = PEN_NUM(g("npMonthly"));
      if (g("npStartAge") !== undefined) p.np.startAge = PEN_NUM(g("npStartAge"));
      if (g("npTaxPct") !== undefined) p.np.taxPct = PEN_NUM(g("npTaxPct"));
      if (g("hi") !== undefined) p.hi = String(g("hi"));
      return p;
    });
    const pnames = S.people.map((p) => (p.name === undefined ? "" : String(p.name).trim()));
    const accts = [], warnings = [];
    (acRows || []).slice(1).forEach((r, idx) => {
      if ((r[0] === "" || r[0] == null) && (r[3] === "" || r[3] == null)) return;
      const row = idx + 2;
      const modeTxt = String(r[8] == null ? "" : r[8]).trim(), baseTxt = String(r[9] == null ? "" : r[9]).trim();
      const pct = /비율|%|pct/i.test(modeTxt);
      if (modeTxt !== "금액" && modeTxt !== "비율") warnings.push(row + "행 인출방식이 금액/비율이 아니라 " + (pct ? "비율" : "금액") + "으로 읽었어요");
      let owner = pnames.indexOf(String(r[2] == null ? "" : r[2]).trim());
      const num = (r[1] === "" || r[1] == null) ? NaN : Number(r[1]);
      if (owner < 0) owner = (num === 0 || num === 1 || num === 2) ? num : (String(r[11] == null ? "" : r[11]).trim() === "1인" ? 2 : 0);
      const plan = PEN_PLAN(r[10]);
      if (String(r[10] == null ? "" : r[10]).trim() !== "" && !plan.length) warnings.push(row + "행 인출계획을 읽지 못했어요");
      accts.push({ id: Number(r[0]) || (accts.length + 1), owner, name: String(r[3] || "계좌"), value: PEN_NUM(r[4]), nonCredit: PEN_NUM(r[5]),
        startAge: PEN_NUM(r[6]), rate: PEN_NUM(r[7]), planMode: pct ? "pct" : "amt", pctBase: /잔액/.test(baseTxt) ? "bal" : "value", plan });
    });
    const out = { S, accts, warnings };
    if (kv.nextId !== undefined) out.nextId = Number(PEN_NUM(kv.nextId));
    return out;
  };
  const penSave = async (state) => {
    if (!state || !state.S || !Array.isArray(state.S.people) || !Array.isArray(state.accts)) throw new Error("저장할 데이터가 올바르지 않습니다.");
    if (state.accts.length > 200) throw new Error("계좌가 너무 많습니다.");
    await setDoc(doc(db, "pension", "state"), { json: JSON.stringify(state), updated: Date.now() });
    return { ok: true, accounts: state.accts.length };
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
    async getRealEstateDashboard(onPartial) {
      const watchlist = await window.FBAPI.getRealEstateWatchlist();
      if (!watchlist.length) return { watchlist, trades: [] };
      const r = await perItem("reTrades", {}, watchlist, 90000, onPartial);
      const trades = r.trades;
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
    async getRealEstateCachedDashboard(onPartial) { return window.FBAPI.getRealEstateDashboard(onPartial); },
    async forceRefreshRealEstateCache(monthsBack) {
      const watchlist = await window.FBAPI.getRealEstateWatchlist();
      if (!watchlist.length) return { cachedMonths: [] };
      return await perItem("reForce", { months: monthsBack === 6 ? 6 : 3 }, watchlist, 280000);
    },
    /* ---- 연금 ---- */
    async getPensionPage() {
      const res = await fetch("pension.html", { cache: "no-cache" });
      if (!res.ok) throw new Error("연금 화면 파일(pension.html)을 불러오지 못했습니다");
      const html = await res.text();
      let data = null;
      const snap = await getDoc(doc(db, "pension", "state"));
      if (snap.exists() && snap.data().json) { try { data = JSON.parse(snap.data().json); } catch (e) { data = null; } }
      if (data) data.readAt = new Date().toTimeString().slice(0, 8);
      return { html, data, diag: { ss: "Firebase", settings: data ? 2 : 0, accounts: data ? data.accts.length + 1 : 0 } };
    },
    async savePensionData(state) { return penSave(state); },
    async importPensionCsv(setRows, acRows) {
      const st = pensionFromRows(setRows, acRows);
      if (!st.S.people.some((p) => p.name)) throw new Error("연금설정 CSV에서 사람 이름(p0_name 등)을 찾지 못했습니다. 파일이 맞는지 확인해주세요");
      await penSave(st);
      return { ok: true, accounts: st.accts.length, warnings: st.warnings };
    },
    /* ---- 종합 탭: 현금성 자산 (컬렉션 cash_assets, 필드는 시트 "현금성자산" 헤더: ID, 항목명, 금액, 메모, 명의) ---- */
    async getCashAssets() { return (await readAll(CASH)).map(({ __id, ...r }) => ({ ...r, ID: r.ID || __id })); },
    async saveCash(d) {
      const id = d.ID || ("CASH-" + Math.random().toString(36).slice(2, 10));
      await setDoc(doc(db, CASH, id), clean({ ...d, ID: id }));
      return { status: "ok", id };
    },
    async deleteCash(id) { await deleteDoc(doc(db, CASH, id)); return { status: "ok" }; },
    async importCash(list) { return importInto(CASH, "ID", "CASH-", list); },
  };
  window.__fbOk();
} catch (e) {
  window.__fbFail(e);
}
