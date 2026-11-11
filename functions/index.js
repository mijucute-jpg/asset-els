/* (선택) 기초자산 시세 조회. Blaze(종량제) 요금제가 필요합니다. 배포 후 나온 주소를 public/firebase-config.js 의 PRICE_API_URL 에 넣으세요. */
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
admin.initializeApp();

const ALLOWED_EMAIL = "mijucute@gmail.com";
// 종목명 → 6자리 종목코드. 새 기초자산이 생기면 한 줄 추가
const STOCK_TICKERS = { "하이닉스": "000660", "SK하이닉스": "000660", "삼성전자": "005930", "현대차": "005380" };
const num = (s) => { if (s === null || s === undefined || s === "") return null; const n = Number(String(s).replace(/,/g, "")); return isNaN(n) ? null : n; };

exports.stockPrices = onRequest({ region: "asia-northeast3", cors: true }, async (req, res) => {
  try {
    const token = (req.get("Authorization") || "").replace(/^Bearer /, "");
    const u = await admin.auth().verifyIdToken(token);
    if ((u.email || "").toLowerCase() !== ALLOWED_EMAIL.toLowerCase()) return res.status(403).send("forbidden");
    const names = String(req.query.names || "").split(",").filter(Boolean);
    const map = {}; names.forEach((n) => { if (STOCK_TICKERS[n]) map[n] = STOCK_TICKERS[n]; });
    const codes = [...new Set(Object.values(map))];
    if (!codes.length) return res.json({});
    const r = await fetch("https://polling.finance.naver.com/api/realtime/domestic/stock/" + codes.join(","),
      { headers: { "User-Agent": "Mozilla/5.0" } });
    const data = await r.json();
    const byCode = {};
    (data.datas || []).forEach((d) => {
      const cur = num(d.closePrice), cmp = num(d.compareToPreviousClosePrice);
      byCode[d.itemCode || d.code] = { price: cur, currency: "KRW", asOf: d.localTradedAt || "",
        prevClose: d.marketStatus === "OPEN" ? (cur != null && cmp != null ? cur - cmp : null) : cur };
    });
    const out = {}; Object.keys(map).forEach((n) => { if (byCode[map[n]]) out[n] = byCode[map[n]]; });
    res.json(out);
  } catch (e) { res.status(401).send("unauthorized"); }
});
