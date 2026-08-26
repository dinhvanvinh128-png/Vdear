/*
 * Dòng tiền ETF giao ngay — HÀM SERVER (Vercel Serverless Function).
 *
 * Vì sao phải có file này: dòng tiền ròng của ETF chỉ nhà cung cấp có API mới
 * công bố (SoSoValue, CoinGlass), và họ đòi API key. Key TUYỆT ĐỐI không được
 * xuống trình duyệt. Trang tĩnh không thể tự gọi — nên nó gọi vào đây, còn key
 * chỉ tồn tại trong biến môi trường của server.
 *
 * Trang web m.sosovalue.com là GIAO DIỆN, không phải API. Đọc dữ liệu từ đó là
 * scrape: vi phạm điều khoản của họ, và trình duyệt cũng bị CORS chặn. File này
 * chỉ gọi API chính thức.
 *
 * Không có key -> trả configured:false. Gọi hỏng -> trả available:false kèm lý
 * do. Không đường nào ở đây sinh ra con số.
 *
 * Cấu hình (Vercel → Settings → Environment Variables):
 *   SOSOVALUE_API_KEY   bắt buộc, lấy ở openapi của SoSoValue
 *   SOSOVALUE_API_BASE  tuỳ chọn, mặc định https://openapi.sosovalue.com
 *   SOSOVALUE_ETF_PATH  tuỳ chọn, đường dẫn endpoint dòng tiền
 *
 * BASE và PATH để chỉnh được bằng env là có chủ đích: tôi không xác minh được
 * đường dẫn chính xác từ môi trường phát triển (mọi host bên ngoài đều bị chặn),
 * nên nếu SoSoValue dùng đường dẫn khác thì sửa bằng biến môi trường, không phải
 * sửa code. Sai đường dẫn thì hàm báo lỗi rõ ràng chứ không đoán dữ liệu.
 */

const BASE = process.env.SOSOVALUE_API_BASE || 'https://openapi.sosovalue.com';
const PATH = process.env.SOSOVALUE_ETF_PATH || '/openapi/v2/etf/currentEtfDataMetrics';
const TIMEOUT_MS = 9000;

// Các tài sản có ETF giao ngay tại Mỹ. `type` theo mẫu us-<symbol>-spot; nếu nhà
// cung cấp đặt tên khác thì đổi bằng SOSOVALUE_ETF_TYPES (danh sách
// "SYMBOL=type" ngăn bởi dấu phẩy) chứ không phải sửa code. Mã sai -> tài sản đó
// báo lỗi rõ ràng, không ảnh hưởng các tài sản khác và không sinh ra số nào.
const DEFAULT_ASSETS = [
  'BTC', 'ETH', 'XRP', 'SOL', 'DOGE', 'LINK', 'AVAX', 'HBAR', 'LTC', 'DOT', 'HYPE', 'BNB',
];

function assetTypes() {
  const override = (process.env.SOSOVALUE_ETF_TYPES || '').trim();
  if (override) {
    return override.split(',').map((pair) => {
      const [sym, type] = pair.split('=').map((x) => (x || '').trim());
      return sym && type ? { symbol: sym.toUpperCase(), type } : null;
    }).filter(Boolean);
  }
  return DEFAULT_ASSETS.map((sym) => ({ symbol: sym, type: `us-${sym.toLowerCase()}-spot` }));
}

// Gọi theo lô để không bắn 12 request cùng lúc vào nhà cung cấp.
async function pool(items, worker, size) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(new Array(Math.min(size, items.length)).fill(0).map(async () => {
    while (i < items.length) { const idx = i++; out[idx] = await worker(items[idx]); }
  }));
  return out;
}

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // Dữ liệu thị trường công khai, đã tổng hợp -> cho cache ngắn ở CDN.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
  res.status(status).send(JSON.stringify(body));
}

function num(x) {
  const n = typeof x === 'string' ? parseFloat(x.replace(/,/g, '')) : x;
  return Number.isFinite(n) ? n : null;
}

/*
 * Chỉ nhận những trường ĐỌC ĐƯỢC CHẮC CHẮN. Không có thì trả null.
 * Tuyệt đối không suy dòng tiền từ giá hay khối lượng khớp lệnh: khối lượng là
 * nhà đầu tư sang tay nhau, tiền không hề chạm tới quỹ.
 */
function mapMetrics(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw.data || raw;
  const pick = (...keys) => {
    for (const k of keys) if (d[k] != null) { const v = num(d[k]); if (v != null) return v; }
    return null;
  };
  const out = {
    netInflow: pick('dailyNetInflow', 'netInflow', 'lastDailyNetInflow'),
    cumNetInflow: pick('cumNetInflow', 'totalNetInflow', 'cumulativeNetInflow'),
    totalNetAssets: pick('totalNetAssets', 'netAssets'),
    date: d.lastUpdateDate || d.date || d.day || null,
  };
  // Không đọc được trường nào có nghĩa -> coi như không có dữ liệu.
  return out.netInflow == null && out.cumNetInflow == null && out.totalNetAssets == null ? null : out;
}

async function fetchAsset(type, key) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(BASE + PATH, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-soso-api-key': key },
      body: JSON.stringify({ type }),
    });
    if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
    const body = await res.json();
    const mapped = mapMetrics(body);
    if (!mapped) return { ok: false, message: 'Cấu trúc dữ liệu không khớp — kiểm tra SOSOVALUE_ETF_PATH' };
    return { ok: true, data: mapped };
  } catch (e) {
    return { ok: false, message: e.name === 'AbortError' ? 'Quá thời gian chờ' : String(e.message || e) };
  } finally { clearTimeout(timer); }
}

module.exports = async function handler(req, res) {
  const key = (process.env.SOSOVALUE_API_KEY || '').trim();
  if (!key) {
    return json(res, 200, {
      configured: false,
      source: 'sosovalue',
      message: 'Chưa cấu hình SOSOVALUE_API_KEY. Dòng tiền ETF cần nhà cung cấp có API key.',
    });
  }
  const assets = assetTypes();
  const results = await pool(assets, async (a) => ({ ...a, res: await fetchAsset(a.type, key) }), 4);

  const data = {};
  const errors = [];
  for (const r of results) {
    if (r.res.ok) data[r.symbol] = r.res.data;
    else errors.push(`${r.symbol}: ${r.res.message}`);
  }
  return json(res, 200, {
    configured: true,
    available: Object.keys(data).length > 0,
    source: 'sosovalue',
    generatedAt: new Date().toISOString(),
    assets: data,     // { BTC: {...}, ETH: {...}, ... } — chỉ tài sản đọc được
    errors,           // tài sản nào hỏng, hỏng vì sao
  });
};
