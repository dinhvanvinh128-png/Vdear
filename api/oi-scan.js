/*
 * Quét Open Interest + Long/Short cho cả bảng — HÀM SERVER (Vercel).
 *
 * VÌ SAO PHẢI LÀ HÀM SERVER, KHÔNG PHẢI GỌI TỪ TRÌNH DUYỆT
 * --------------------------------------------------------
 * Bảng "Biến động 24h" có tới ~600 coin. Mỗi coin cần 2 request (một cho chuỗi
 * OI, một cho tỉ lệ long/short), tức 1200 request cho một lượt quét. Binance
 * chặn 1000 request/5 phút THEO IP cho nhóm /futures/data/*. Nếu để trình duyệt
 * tự quét thì:
 *   - mỗi người vào trang lại bắn một lượt 1200 request từ IP của họ,
 *   - vượt hạn mức là Binance trả 418 rồi cấm IP đó một lúc — mất luôn cả biểu
 *     đồ và bảng giá chứ không riêng hai cột này.
 *
 * Nên một máy chủ quét, mọi người đọc chung kết quả. Thêm hai lớp nữa:
 *   - `s-maxage` để CDN của Vercel phục vụ hầu hết lượt truy cập mà không đánh
 *     thức hàm này. Đây mới là thứ thật sự giữ cho hạn mức không cháy.
 *   - bộ đệm trong bộ nhớ của chính instance, cho những lần CDN gọi tới.
 *
 * VÌ SAO CHỈ QUÉT TOP COIN
 * ------------------------
 * Quét đủ 600 coin là 1200 request mỗi lượt — vừa đúng bằng hạn mức, không còn
 * biên an toàn nào. Nên chỉ quét TOP theo khối lượng (mặc định 300 -> 600
 * request/lượt, làm mới mỗi 10 phút, tức ~300 request/5 phút, còn dư gấp ba).
 * Coin ngoài top trả về "không có dữ liệu" và bảng hiện "—" — nói thật là chưa
 * quét tới, hơn là bịa ra số hoặc để bảng vỡ.
 *
 * KHÔNG CÓ KHOÁ BÍ MẬT NÀO Ở ĐÂY. Mọi endpoint dùng trong tệp này đều là dữ
 * liệu thị trường công khai của Binance; hàm này tồn tại vì HẠN MỨC, không phải
 * vì bảo mật.
 */

const HOST = process.env.BINANCE_FAPI_BASE || 'https://fapi.binance.com';

const TOP_N = clampInt(process.env.OI_SCAN_TOP, 300, 20, 600);
const REFRESH_MS = clampInt(process.env.OI_SCAN_REFRESH_MS, 10 * 60 * 1000, 60 * 1000, 60 * 60 * 1000);
const CONCURRENCY = clampInt(process.env.OI_SCAN_CONCURRENCY, 6, 1, 20);
const TIMEOUT_MS = 8000;

// Khung 1h × 25 điểm = đúng 24 giờ trước so với bây giờ. Dùng period=1d limit=2
// thì ra "hôm qua so với hôm nay" theo mốc UTC, KHÔNG phải 24 giờ trượt — hai
// thứ đó khác nhau và cột đang ghi là "24h".
const OI_PERIOD = '1h';
const OI_LIMIT = 25;
const LS_PERIOD = '1h';

function clampInt(v, dflt, lo, hi) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}

function num(x) {
  const n = parseFloat(x);
  return Number.isFinite(n) ? n : null;
}

async function getJSON(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

/* Chạy theo lô, giữ số request đồng thời ở mức thấp. Bắn 600 request cùng lúc
 * là cách nhanh nhất để bị chặn, kể cả khi tổng số vẫn dưới hạn mức. */
async function pool(items, worker, size) {
  const out = new Array(items.length);
  let i = 0;
  const runners = new Array(Math.min(size, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await worker(items[idx]); } catch (e) { out[idx] = null; }
    }
  });
  await Promise.all(runners);
  return out;
}

/* --------------------------- một lượt quét ---------------------------- */

async function scanOnce() {
  const errors = [];

  // 1) Danh sách symbol + khối lượng, để chọn top. Một request cho cả sàn.
  let tickers = [];
  try {
    tickers = await getJSON(HOST + '/fapi/v1/ticker/24hr');
  } catch (e) {
    errors.push('ticker24h: ' + (e && e.message));
    return { ok: false, errors, coins: {} };
  }

  const symbols = (Array.isArray(tickers) ? tickers : [])
    .filter((t) => typeof t.symbol === 'string'
      && t.symbol.endsWith('USDT')
      && !t.symbol.includes('_')            // bỏ hợp đồng có kỳ hạn
      && num(t.quoteVolume) != null)
    .sort((a, b) => num(b.quoteVolume) - num(a.quoteVolume))
    .slice(0, TOP_N)
    .map((t) => t.symbol);

  // 2) Với mỗi symbol: chuỗi OI 24 giờ + tỉ lệ long/short mới nhất.
  const rows = await pool(symbols, async (sym) => {
    const [oi, ls] = await Promise.all([
      getJSON(`${HOST}/futures/data/openInterestHist?symbol=${sym}&period=${OI_PERIOD}&limit=${OI_LIMIT}`)
        .catch(() => null),
      getJSON(`${HOST}/futures/data/globalLongShortAccountRatio?symbol=${sym}&period=${LS_PERIOD}&limit=1`)
        .catch(() => null),
    ]);

    const out = { symbol: sym, oiPct: null, oi: null, longPct: null, shortPct: null };

    if (Array.isArray(oi) && oi.length >= 2) {
      const pts = oi
        .map((r) => ({ t: Number(r.timestamp), v: num(r.sumOpenInterest) }))
        .filter((r) => Number.isFinite(r.t) && r.v != null)
        .sort((a, b) => a.t - b.t);
      if (pts.length >= 2) {
        const first = pts[0].v, last = pts[pts.length - 1].v;
        out.oi = last;
        // Mốc đầu bằng 0 thì phần trăm là vô nghĩa (chia cho 0), để null.
        if (first > 0) out.oiPct = ((last - first) / first) * 100;
      }
    }

    if (Array.isArray(ls) && ls.length) {
      const r = ls[ls.length - 1];
      const lo = num(r.longAccount), sh = num(r.shortAccount);
      if (lo != null && sh != null && lo + sh > 0) {
        out.longPct = (lo / (lo + sh)) * 100;
        out.shortPct = (sh / (lo + sh)) * 100;
      }
    }
    return out;
  }, CONCURRENCY);

  const coins = {};
  let withOi = 0, withLs = 0;
  for (const r of rows) {
    if (!r) continue;
    // Khoá theo BASE để trang khỏi phải biết cách đặt tên symbol của Binance.
    const base = r.symbol.replace(/USDT$/, '');
    coins[base] = { oiPct: r.oiPct, oi: r.oi, longPct: r.longPct, shortPct: r.shortPct };
    if (r.oiPct != null) withOi++;
    if (r.longPct != null) withLs++;
  }

  return {
    ok: true,
    errors,
    scanned: symbols.length,
    withOi,
    withLs,
    coins,
  };
}

/* ------------------------- bộ đệm của instance ------------------------ */

let cache = null;      // { at, payload }
let running = null;    // lượt quét đang chạy, để không quét hai lượt song song

async function getScan() {
  const fresh = cache && (Date.now() - cache.at) < REFRESH_MS;
  if (fresh) return { payload: cache.payload, cached: true };

  if (!running) {
    running = scanOnce()
      .then((p) => {
        // Lượt quét hỏng thì GIỮ LẠI bản cũ nếu có: dữ liệu 15 phút trước vẫn
        // đọc được, còn xoá đi thì cả bảng mất hai cột vì một lần mạng chập.
        if (p.ok || !cache) cache = { at: Date.now(), payload: p };
        return cache.payload;
      })
      .catch(() => (cache ? cache.payload : { ok: false, errors: ['scan failed'], coins: {} }))
      .then((p) => { running = null; return p; });
  }

  // Có bản cũ thì trả ngay bản cũ và để lượt quét chạy nền
  // (stale-while-revalidate ở phía server, không bắt người dùng chờ 600 request).
  if (cache) return { payload: cache.payload, cached: true, revalidating: true };
  return { payload: await running, cached: false };
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // CDN giữ 5 phút và còn phục vụ bản cũ thêm 15 phút trong lúc làm mới. Đây
  // mới là lớp thật sự giữ cho hạn mức Binance không cháy khi đông người vào.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=900');

  try {
    const { payload, cached, revalidating } = await getScan();
    res.statusCode = 200;
    res.end(JSON.stringify({
      ...payload,
      top: TOP_N,
      refreshMs: REFRESH_MS,
      cached: !!cached,
      revalidating: !!revalidating,
      generatedAt: new Date(cache ? cache.at : Date.now()).toISOString(),
    }));
  } catch (e) {
    // Hàm này hỏng thì hai cột hiện "—". Không được để nó làm vỡ cả trang, nên
    // vẫn trả 200 với một payload hợp lệ mà rỗng.
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: false, coins: {}, errors: [String((e && e.message) || e)] }));
  }
};

module.exports._scanOnce = scanOnce;
module.exports._reset = function () { cache = null; running = null; };
