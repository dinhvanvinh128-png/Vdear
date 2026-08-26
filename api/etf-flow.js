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
  const [btc, eth] = await Promise.all([
    fetchAsset('us-btc-spot', key),
    fetchAsset('us-eth-spot', key),
  ]);
  const anyOk = btc.ok || eth.ok;
  return json(res, 200, {
    configured: true,
    available: anyOk,
    source: 'sosovalue',
    generatedAt: new Date().toISOString(),
    btc: btc.ok ? btc.data : null,
    eth: eth.ok ? eth.data : null,
    errors: [btc.ok ? null : `BTC: ${btc.message}`, eth.ok ? null : `ETH: ${eth.message}`].filter(Boolean),
  });
};
