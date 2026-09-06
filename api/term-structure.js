/*
 * Term structure + basis + funding gộp 4 sàn — HÀM SERVER (Vercel).
 *
 * VÌ SAO Ở SERVER
 * ---------------
 * Một lần làm mới cần: 2 lần gọi exchangeInfo/basis của Binance cho mỗi cặp,
 * 1 lần funding-history, cộng 8 lần gọi tới 4 sàn cho funding + OI. Với 2 cặp
 * là ~20 request. Để trình duyệt tự gọi thì mỗi người mở trang lại bắn 20
 * request từ IP của họ tới 4 sàn — đúng vấn đề mà api/oi-scan.js đã phải sinh
 * ra để tránh. Một máy gọi, CDN phục vụ tất cả.
 *
 * KHÔNG CÓ KHOÁ BÍ MẬT NÀO Ở ĐÂY. Toàn bộ là dữ liệu công khai.
 *
 * HAI CON SỐ KHÁC NHAU, KHÔNG ĐƯỢC TRỘN
 * -------------------------------------
 * 1. `annualizedPct` — basis quý so với PERP, theo đúng công thức được yêu cầu:
 *        (giá quý − giá perp) / giá perp × 365/(số ngày còn lại) × 100
 *    Chuỗi lịch sử dựng bằng cách ghép hai chuỗi /futures/data/basis
 *    (PERPETUAL và CURRENT_QUARTER) theo mốc thời gian — cả hai đều là số
 *    Binance công bố, ta chỉ trừ và chia.
 *
 * 2. `annualizedBasisRate` mà Binance trả sẵn là quý so với INDEX, không phải
 *    so với perp. Gần nhau nhưng KHÔNG bằng nhau. Ta không dùng nó cho con số
 *    chính, chỉ trả kèm để đối chiếu.
 *
 * Percentile của funding tính trên chuỗi funding CỦA BINANCE (nguồn duy nhất
 * có sẵn 30+ ngày lịch sử), còn con số "chi phí giữ vị thế" hiện tại là bản
 * gộp 4 sàn. Hai thứ này được gắn nhãn riêng ở giao diện — gộp lịch sử của một
 * sàn với hiện tại của bốn sàn rồi gọi chung một tên là tự bịa ra một chuỗi
 * chưa từng tồn tại.
 */

const envelope = require('./_envelope');

const BINANCE = process.env.BINANCE_FAPI_BASE || 'https://fapi.binance.com';
const TIMEOUT_MS = 8000;
const REFRESH_MS = 5 * 60 * 1000;

const PAIRS = (process.env.TERM_PAIRS || 'BTCUSDT,ETHUSDT')
  .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

/* ------------------------------ tiện ích ------------------------------- */

function num(x) {
  if (x == null || x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

async function getJSON(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

/* --------------------------- phần thuần tính --------------------------- */

/*
 * Basis quy về năm.
 *
 * Sát ngày đáo hạn, số ngày còn lại tiến về 0 và 365/days nổ tung: một chênh
 * lệch 0.1% ở nửa ngày cuối quy ra 73%/năm. Con số đó đúng về mặt số học nhưng
 * vô nghĩa về mặt thị trường. Nên sàn ở 0.5 ngày VÀ trả kèm cờ nearExpiry để
 * giao diện nói rõ thay vì vẽ một cái gai.
 */
const MIN_DAYS = 0.5;
const NEAR_EXPIRY_DAYS = 3;

function annualizedBasisPct(quarterPrice, perpPrice, daysToDelivery) {
  const fq = num(quarterPrice), fp = num(perpPrice), d = num(daysToDelivery);
  if (fq == null || fp == null || d == null || fp <= 0) return null;
  return ((fq - fp) / fp) * (365 / Math.max(MIN_DAYS, d)) * 100;
}

function daysToDelivery(deliveryDate, atMs) {
  const dd = num(deliveryDate), t = num(atMs);
  if (dd == null || t == null) return null;
  return (dd - t) / 86400000;
}

/*
 * Percentile nội suy tuyến tính. Không dùng "phần tử thứ p%" thô: với chuỗi 30
 * điểm thì p90 và p93 ra cùng một giá trị, và ngưỡng cảnh báo nhảy bậc.
 */
function percentile(values, p) {
  const a = (values || []).filter((v) => Number.isFinite(v)).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  if (a.length === 1) return a[0];
  const idx = (a.length - 1) * (p / 100);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return a[lo];
  return a[lo] + (a[hi] - a[lo]) * (idx - lo);
}

/*
 * Funding quy về %/năm để so được giữa các sàn.
 *
 * Đây là chỗ dễ sai nhất của cả module: các sàn trả funding theo CHU KỲ RIÊNG
 * (Binance thường 8h nhưng một số cặp 4h; Bitget trả thẳng fundingRateInterval;
 * OKX suy ra được từ nextFundingTime − fundingTime). Cộng thẳng rate của một
 * sàn 4h với rate của một sàn 8h là cộng hai đại lượng khác đơn vị.
 */
function fundingAprPct(rate, intervalHours) {
  const r = num(rate), h = num(intervalHours);
  if (r == null || h == null || h <= 0) return null;
  return r * (8760 / h) * 100;
}

/*
 * Chi phí giữ vị thế toàn thị trường = trung bình có trọng số theo OI (USD).
 *
 * Sàn thiếu rate HOẶC thiếu OI thì bị LOẠI và trọng số các sàn còn lại được
 * chuẩn hoá lại — thiếu dữ liệu làm giảm ĐỘ PHỦ, không làm lệch con số (đúng
 * quy tắc 1 của ARCHITECTURE.md). `coverage` đi kèm ra tới giao diện.
 */
function weightedFunding(venues) {
  let num_ = 0, den = 0, seenOi = 0;
  const used = [], missing = [];
  for (const v of venues || []) {
    if (v.oiUsd != null && v.oiUsd > 0) seenOi += v.oiUsd;
    if (v.aprPct == null || v.oiUsd == null || !(v.oiUsd > 0)) {
      missing.push({ id: v.id, why: v.why || (v.aprPct == null ? 'thiếu funding' : 'thiếu OI') });
      continue;
    }
    num_ += v.aprPct * v.oiUsd;
    den += v.oiUsd;
    used.push(v.id);
  }
  if (!den) return { aprPct: null, coverage: 0, used, missing };
  return {
    aprPct: num_ / den,
    // Độ phủ tính theo TIỀN, không theo số sàn: một sàn nhỏ vắng mặt khác hẳn
    // với sàn lớn nhất vắng mặt.
    coverage: seenOi > 0 ? den / seenOi : 0,
    used, missing,
  };
}

/*
 * Cảnh báo funding cực đoan: ở mức percentile P liên tục N ngày.
 *
 * `series` là lịch sử funding của Binance (mỗi 8h một điểm). Ba ngày = 9 kỳ.
 * Chỉ báo động khi TẤT CẢ các kỳ trong cửa sổ đều ≥ ngưỡng — "trung bình 3 ngày
 * vượt ngưỡng" là một phát biểu khác hẳn và yếu hơn nhiều.
 */
function extremeFunding(series, opts) {
  const p = (opts && opts.percentile) || 95;
  const days = (opts && opts.days) || 3;
  const vals = (series || []).map((r) => r.aprPct).filter((v) => Number.isFinite(v));
  if (vals.length < 30) return { enough: false, have: vals.length, need: 30 };

  const thr = percentile(vals, p);
  const perDay = 24 / ((opts && opts.intervalHours) || 8);
  const window = Math.round(days * perDay);
  if (vals.length < window) return { enough: false, have: vals.length, need: window };

  const tail = vals.slice(-window);
  const allAbove = tail.every((v) => v >= thr);
  // Đếm ngược từ cuối xem đã bao nhiêu kỳ liên tiếp ở trên ngưỡng
  let streak = 0;
  for (let i = vals.length - 1; i >= 0 && vals[i] >= thr; i--) streak++;

  return {
    enough: true,
    percentile: p,
    threshold: thr,
    windowPeriods: window,
    streakPeriods: streak,
    streakDays: streak / perDay,
    extreme: allAbove,
    current: vals[vals.length - 1],
  };
}

/* ------------------------- lấy dữ liệu từng sàn ------------------------ */

// Binance: hợp đồng quý của một cặp + ngày đáo hạn.
async function binanceQuarters(pair) {
  const info = await getJSON(BINANCE + '/fapi/v1/exchangeInfo');
  const rows = (info && info.symbols) || [];
  return rows
    .filter((s) => s.pair === pair
      && (s.contractType === 'CURRENT_QUARTER' || s.contractType === 'NEXT_QUARTER')
      && s.status === 'TRADING')
    .map((s) => ({
      symbol: s.symbol,
      contractType: s.contractType,
      deliveryDate: num(s.deliveryDate),
    }));
}

async function markPrices(symbols) {
  const all = await getJSON(BINANCE + '/fapi/v1/premiumIndex');
  const want = new Set(symbols);
  const out = {};
  for (const r of Array.isArray(all) ? all : []) {
    if (!want.has(r.symbol)) continue;
    out[r.symbol] = {
      mark: num(r.markPrice),
      index: num(r.indexPrice),
      lastFundingRate: num(r.lastFundingRate),
      nextFundingTime: num(r.nextFundingTime),
      time: num(r.time),
    };
  }
  return out;
}

/*
 * Chuỗi basis: hai lần gọi cùng `period`, ghép theo mốc thời gian.
 * Mốc nào chỉ có một trong hai thì BỎ — nội suy để lấp là tự chế ra số.
 */
async function basisSeries(pair, quarterType, period, limit) {
  const url = (ct) => `${BINANCE}/futures/data/basis?pair=${pair}`
    + `&contractType=${ct}&period=${period}&limit=${limit}`;
  const [perp, quarter] = await Promise.all([
    getJSON(url('PERPETUAL')).catch(() => null),
    getJSON(url(quarterType)).catch(() => null),
  ]);
  if (!Array.isArray(perp) || !Array.isArray(quarter)) return null;

  const byT = new Map();
  for (const r of perp) {
    const t = num(r.timestamp), f = num(r.futuresPrice);
    if (t != null && f != null) byT.set(t, { t, perp: f, index: num(r.indexPrice) });
  }
  const out = [];
  for (const r of quarter) {
    const t = num(r.timestamp), f = num(r.futuresPrice);
    if (t == null || f == null) continue;
    const m = byT.get(t);
    if (!m) continue;
    out.push({
      t, perp: m.perp, quarter: f, index: m.index,
      // annualizedBasisRate của Binance là quý-so-INDEX; giữ lại để đối chiếu,
      // KHÔNG dùng làm con số chính.
      binanceAnnualizedVsIndex: num(r.annualizedBasisRate),
    });
  }
  out.sort((a, b) => a.t - b.t);
  return out.length ? out : null;
}

// Lịch sử funding của Binance (mỗi kỳ một điểm), để tính percentile.
async function binanceFundingHistory(symbol, limit) {
  const j = await getJSON(`${BINANCE}/fapi/v1/fundingRate?symbol=${symbol}&limit=${limit || 200}`);
  if (!Array.isArray(j)) return null;
  const rows = j.map((r) => ({ t: num(r.fundingTime), rate: num(r.fundingRate) }))
    .filter((r) => r.t != null && r.rate != null)
    .sort((a, b) => a.t - b.t);
  return rows.length ? rows : null;
}

/*
 * Chu kỳ funding của Binance. Mặc định 8 h; /fapi/v1/fundingInfo CHỈ liệt kê
 * những symbol có chu kỳ khác mặc định, nên vắng mặt trong danh sách nghĩa là
 * 8 h chứ không phải thiếu dữ liệu.
 */
async function binanceFundingIntervals() {
  try {
    const j = await getJSON(BINANCE + '/fapi/v1/fundingInfo');
    const out = {};
    for (const r of Array.isArray(j) ? j : []) {
      const h = num(r.fundingIntervalHours);
      if (r.symbol && h) out[r.symbol] = h;
    }
    return out;
  } catch (e) { return {}; }
}

/* ---- funding + OI của bốn sàn, mỗi sàn một hàm, hỏng thì trả why ---- */

async function venueBinance(symbol, intervals, marks) {
  const m = marks[symbol];
  if (!m || m.lastFundingRate == null) return { id: 'binance', why: 'không có funding' };
  const h = intervals[symbol] || 8;
  let oiUsd = null;
  try {
    const oi = await getJSON(`${BINANCE}/fapi/v1/openInterest?symbol=${symbol}`);
    const q = num(oi && oi.openInterest);
    if (q != null && m.mark != null) oiUsd = q * m.mark;
  } catch (e) { /* OI thiếu -> bị loại khỏi trọng số, có ghi lý do */ }
  return {
    id: 'binance', ratePct: m.lastFundingRate * 100, intervalHours: h,
    aprPct: fundingAprPct(m.lastFundingRate, h), oiUsd,
    why: oiUsd == null ? 'không lấy được OI' : null,
  };
}

async function venueBybit(symbol) {
  try {
    const j = await getJSON('https://api.bybit.com/v5/market/tickers?category=linear&symbol=' + symbol);
    const t = j && j.result && j.result.list && j.result.list[0];
    if (!t) return { id: 'bybit', why: 'không có dữ liệu' };
    const rate = num(t.fundingRate);
    // Bybit mặc định 8h; instruments-info có fundingInterval (phút) nhưng phải
    // gọi thêm một lượt. Giữ 8h và ghi rõ là GIẢ ĐỊNH, không im lặng.
    const h = 8;
    return {
      id: 'bybit', ratePct: rate == null ? null : rate * 100, intervalHours: h,
      intervalAssumed: true,
      aprPct: fundingAprPct(rate, h), oiUsd: num(t.openInterestValue),
      why: rate == null ? 'không có funding' : null,
    };
  } catch (e) { return { id: 'bybit', why: 'lỗi mạng' }; }
}

async function venueOkx(base) {
  const instId = base + '-USDT-SWAP';
  try {
    const [fr, oi] = await Promise.all([
      getJSON('https://www.okx.com/api/v5/public/funding-rate?instId=' + instId),
      getJSON('https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=' + instId)
        .catch(() => null),
    ]);
    const f = fr && fr.data && fr.data[0];
    if (!f) return { id: 'okx', why: 'không có dữ liệu' };
    const rate = num(f.fundingRate);
    // Chu kỳ SUY RA từ chính phản hồi, không gõ sẵn.
    const a = num(f.fundingTime), b = num(f.nextFundingTime);
    const h = (a != null && b != null && b > a) ? (b - a) / 3600000 : 8;
    const o = oi && oi.data && oi.data[0];
    return {
      id: 'okx', ratePct: rate == null ? null : rate * 100, intervalHours: h,
      aprPct: fundingAprPct(rate, h), oiUsd: o ? num(o.oiUsd) : null,
      why: rate == null ? 'không có funding' : (o ? null : 'không lấy được OI'),
    };
  } catch (e) { return { id: 'okx', why: 'lỗi mạng' }; }
}

async function venueBitget(symbol) {
  try {
    const [fr, oi] = await Promise.all([
      getJSON('https://api.bitget.com/api/v2/mix/market/current-fund-rate?symbol='
        + symbol + '&productType=USDT-FUTURES'),
      getJSON('https://api.bitget.com/api/v2/mix/market/open-interest?symbol='
        + symbol + '&productType=USDT-FUTURES').catch(() => null),
    ]);
    const f = fr && fr.data && fr.data[0];
    if (!f) return { id: 'bitget', why: 'không có dữ liệu' };
    const rate = num(f.fundingRate);
    // Bitget trả thẳng chu kỳ theo GIỜ.
    const h = num(f.fundingRateInterval) || 8;
    const list = oi && oi.data && oi.data.openInterestList;
    const o = Array.isArray(list) ? list[0] : null;
    const amount = o ? num(o.size) : null;
    return {
      id: 'bitget', ratePct: rate == null ? null : rate * 100, intervalHours: h,
      aprPct: fundingAprPct(rate, h),
      // Bitget trả OI theo SỐ HỢP ĐỒNG, phải nhân giá để ra USD. Thiếu giá thì
      // bỏ qua chứ không coi số hợp đồng là USD.
      oiUsd: null, oiAmount: amount,
      why: rate == null ? 'không có funding' : 'OI theo số hợp đồng, chưa quy ra USD',
    };
  } catch (e) { return { id: 'bitget', why: 'lỗi mạng' }; }
}

/* ------------------------------ tổng hợp ------------------------------- */

async function buildPair(pair, intervals) {
  const base = pair.replace(/USDT$/, '');
  const errors = [];

  let quarters = [];
  try { quarters = await binanceQuarters(pair); }
  catch (e) { errors.push('exchangeInfo: ' + e.message); }

  const symbols = [pair].concat(quarters.map((q) => q.symbol));
  let marks = {};
  try { marks = await markPrices(symbols); }
  catch (e) { errors.push('premiumIndex: ' + e.message); }

  const perpPrice = marks[pair] ? marks[pair].mark : null;
  const now = Date.now();

  const contracts = quarters.map((q) => {
    const px = marks[q.symbol] ? marks[q.symbol].mark : null;
    const d = daysToDelivery(q.deliveryDate, now);
    return {
      symbol: q.symbol, contractType: q.contractType, deliveryDate: q.deliveryDate,
      price: px, daysToDelivery: d,
      annualizedPct: annualizedBasisPct(px, perpPrice, d),
      nearExpiry: d != null && d < NEAR_EXPIRY_DAYS,
    };
  }).sort((a, b) => (a.deliveryDate || 0) - (b.deliveryDate || 0));

  // Chuỗi lịch sử lấy theo hợp đồng quý GẦN NHẤT (CURRENT_QUARTER).
  const cur = contracts.find((c) => c.contractType === 'CURRENT_QUARTER') || contracts[0] || null;
  let series = null;
  if (cur) {
    try {
      const raw = await basisSeries(pair, cur.contractType, '1d', 30);
      if (raw) {
        series = raw.map((r) => ({
          t: r.t,
          annualizedPct: annualizedBasisPct(r.quarter, r.perp, daysToDelivery(cur.deliveryDate, r.t)),
          binanceAnnualizedVsIndex: r.binanceAnnualizedVsIndex,
        })).filter((r) => r.annualizedPct != null);
      }
    } catch (e) { errors.push('basis: ' + e.message); }
  }

  const vals = (series || []).map((r) => r.annualizedPct);
  const basisPct = {
    p20: percentile(vals, 20), p80: percentile(vals, 80), p90: percentile(vals, 90),
    current: cur ? cur.annualizedPct : null,
    samples: vals.length,
  };
  basisPct.level = (() => {
    if (basisPct.current == null || basisPct.p90 == null || vals.length < 10) return 'unknown';
    if (basisPct.current >= basisPct.p90) return 'hot';
    if (basisPct.current >= basisPct.p80) return 'high';
    if (basisPct.current <= basisPct.p20) return 'low';
    return 'normal';
  })();

  // funding 4 sàn
  const venues = await Promise.all([
    venueBinance(pair, intervals, marks).catch(() => ({ id: 'binance', why: 'lỗi' })),
    venueBybit(pair),
    venueOkx(base),
    venueBitget(pair),
  ]);
  const weighted = weightedFunding(venues);

  // percentile funding trên chuỗi CỦA BINANCE
  let fundingHist = null, extreme = { enough: false };
  try {
    const raw = await binanceFundingHistory(pair, 200);
    if (raw) {
      const h = intervals[pair] || 8;
      fundingHist = raw.map((r) => ({ t: r.t, aprPct: fundingAprPct(r.rate, h) }))
        .filter((r) => r.aprPct != null);
      extreme = extremeFunding(fundingHist, { percentile: 95, days: 3, intervalHours: h });
    }
  } catch (e) { errors.push('fundingRate: ' + e.message); }

  return {
    pair, base, perpPrice,
    contracts, series, basisPct,
    funding: {
      venues, weightedAprPct: weighted.aprPct, coverage: weighted.coverage,
      used: weighted.used, missing: weighted.missing,
      history: fundingHist ? fundingHist.slice(-90) : null,
      extreme,
    },
    errors,
  };
}

/* --------------------------- đệm của instance -------------------------- */

let cache = null, running = null;

async function build() {
  const intervals = await binanceFundingIntervals();
  const pairs = {};
  for (const p of PAIRS) {
    try { pairs[p] = await buildPair(p, intervals); }
    catch (e) { pairs[p] = { pair: p, errors: [String(e && e.message || e)] }; }
  }
  return { ok: true, pairs, generatedAt: new Date().toISOString() };
}

async function get() {
  if (cache && Date.now() - cache.at < REFRESH_MS) return { payload: cache.payload, cached: true };
  if (!running) {
    running = build()
      .then((p) => { cache = { at: Date.now(), payload: p }; return p; })
      // Lượt dựng hỏng thì GIỮ bản cũ: số của 10 phút trước vẫn đọc được, xoá
      // đi thì cả trang trống vì một lần mạng chập.
      .catch(() => (cache ? cache.payload : { ok: false, pairs: {}, errors: ['build failed'] }))
      .then((p) => { running = null; return p; });
  }
  if (cache) return { payload: cache.payload, cached: true, revalidating: true };
  return { payload: await running, cached: false };
}

module.exports = async function handler(req, res) {
  try {
    const { payload, cached, revalidating } = await get();
    envelope.send(res, { ...payload, cached: !!cached, revalidating: !!revalidating },
      { sMaxAge: 300, maxAgeSeconds: 900 });
  } catch (e) {
    envelope.fail(res, e);
  }
};

// để test — không phải API công khai
module.exports._pure = {
  annualizedBasisPct, daysToDelivery, percentile,
  fundingAprPct, weightedFunding, extremeFunding,
  MIN_DAYS, NEAR_EXPIRY_DAYS,
};
module.exports._reset = function () { cache = null; running = null; };
