/*
 * Dòng tiền ETF giao ngay — HÀM SERVER (Vercel Serverless Function).
 *
 * Nguồn: CoinGlass API v4. Đường dẫn và cấu trúc dữ liệu lấy từ TÀI LIỆU CHÍNH
 * THỨC (coinglass-api-docs), không phải suy đoán:
 *
 *   GET /api/etf/bitcoin/flow-history     (mọi gói, kể cả Hobbyist)
 *   GET /api/etf/ethereum/flow-history    (mọi gói)
 *   GET /api/etf/solana/flow-history      (mọi gói)
 *   GET /api/etf/xrp/flow-history         (mọi gói)
 *
 * Xác thực bằng header CG-API-KEY, đọc từ biến môi trường của server. Key
 * TUYỆT ĐỐI không xuống trình duyệt — đó là lý do phải có hàm này thay vì để
 * trang tĩnh tự gọi.
 *
 * CoinGlass CHỈ có 4 tài sản trên. DOGE, LINK, AVAX, HBAR, LTC, DOT, HYPE, BNB
 * không nằm trong tài liệu, nên giao diện ghi rõ là nguồn không cung cấp chứ
 * không để trống mập mờ như thể đang chờ dữ liệu.
 *
 * Không có key -> configured:false. Gọi hỏng -> available:false kèm lý do.
 * Không đường nào trong file này sinh ra số liệu.
 *
 * Cấu hình (Vercel → Settings → Environment Variables):
 *   COINGLASS_API_KEY    bắt buộc
 *   COINGLASS_API_BASE   tuỳ chọn, mặc định https://open-api-v4.coinglass.com
 */

const BASE = process.env.COINGLASS_API_BASE || 'https://open-api-v4.coinglass.com';
const TIMEOUT_MS = 9000;

// symbol -> đoạn đường dẫn trong tài liệu CoinGlass.
const ASSETS = [
  { symbol: 'BTC', path: 'bitcoin' },
  { symbol: 'ETH', path: 'ethereum' },
  { symbol: 'SOL', path: 'solana' },
  { symbol: 'XRP', path: 'xrp' },
];

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // Dữ liệu công bố theo ngày -> cache ở CDN 5 phút là quá đủ.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=900');
  res.status(status).send(JSON.stringify(body));
}

function num(x) {
  const n = typeof x === 'string' ? parseFloat(x) : x;
  return Number.isFinite(n) ? n : null;
}

/*
 * Tài liệu mô tả data là MẢNG theo ngày:
 *   { timestamp, flow_usd, price_usd, etf_flows: [{ etf_ticker, flow_usd }] }
 * Không tin thứ tự mảng — lấy phần tử có timestamp lớn nhất.
 */
function latest(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  let best = null;
  for (const r of rows) {
    const t = num(r && r.timestamp);
    if (t == null) continue;
    if (!best || t > best.t) best = { t, row: r };
  }
  if (!best) return null;
  const r = best.row;
  const flow = num(r.flow_usd);
  if (flow == null) return null;                 // không đọc được số -> coi như không có
  const funds = Array.isArray(r.etf_flows)
    ? r.etf_flows
        .map((f) => ({ ticker: String(f && f.etf_ticker || '').toUpperCase(), flow: num(f && f.flow_usd) }))
        .filter((f) => f.ticker && f.flow != null)
        .sort((a, b) => Math.abs(b.flow) - Math.abs(a.flow))
    : [];
  return {
    netInflow: flow,
    price: num(r.price_usd),
    date: new Date(best.t).toISOString().slice(0, 10),
    funds,
  };
}

async function fetchAsset(asset, key) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/api/etf/${asset.path}/flow-history`, {
      signal: ctrl.signal,
      headers: { 'CG-API-KEY': key, accept: 'application/json' },
    });
    if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
    const body = await res.json();
    // CoinGlass bọc trong {code,msg,data}; code "0" là thành công.
    if (body && body.code != null && String(body.code) !== '0') {
      return { ok: false, message: body.msg || `code ${body.code}` };
    }
    const data = latest(body && body.data);
    if (!data) return { ok: false, message: 'Không có bản ghi đọc được' };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, message: e.name === 'AbortError' ? 'Quá thời gian chờ' : String(e.message || e) };
  } finally { clearTimeout(timer); }
}

async function pool(items, worker, size) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(new Array(Math.min(size, items.length)).fill(0).map(async () => {
    while (i < items.length) { const idx = i++; out[idx] = await worker(items[idx]); }
  }));
  return out;
}

module.exports = async function handler(req, res) {
  const key = (process.env.COINGLASS_API_KEY || '').trim();
  if (!key) {
    return json(res, 200, {
      configured: false,
      source: 'coinglass',
      supported: ASSETS.map((a) => a.symbol),
      message: 'Chưa cấu hình COINGLASS_API_KEY. Dòng tiền ETF cần nhà cung cấp có API key.',
    });
  }
  const results = await pool(ASSETS, async (a) => ({ ...a, res: await fetchAsset(a, key) }), 4);

  const data = {};
  const errors = [];
  for (const r of results) {
    if (r.res.ok) data[r.symbol] = r.res.data;
    else errors.push(`${r.symbol}: ${r.res.message}`);
  }
  return json(res, 200, {
    configured: true,
    available: Object.keys(data).length > 0,
    source: 'coinglass',
    supported: ASSETS.map((a) => a.symbol),   // tài sản nguồn này có; còn lại không phải "đang chờ"
    generatedAt: new Date().toISOString(),
    assets: data,
    errors,
  });
};
