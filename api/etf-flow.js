/*
 * Dòng tiền ETF giao ngay — HÀM SERVER (Vercel Serverless Function).
 *
 * Vì sao phải có file này: dòng tiền ròng của ETF chỉ nhà cung cấp có API key
 * mới công bố, mà API key TUYỆT ĐỐI không được xuống trình duyệt. Trang tĩnh
 * gọi hàm này, hàm này giữ key lại và gọi nhà cung cấp.
 *
 * NGUỒN DUY NHẤT: SoSoValue. Một nguồn thì cả bảng cùng một ngày, cùng một
 * cách tính — không phải giải thích vì sao dòng này lệch dòng kia.
 *
 * Đường dẫn ĐÃ XÁC NHẬN chạy được (API trả HTTP 200 kèm dữ liệu thật, với các
 * trường totalNetAssets, totalNetAssetsPercentage, dailyNetInflow,
 * cumNetInflow, dailyTotalValueTraded, totalTokenHoldings, list). Nhưng vẫn để
 * ghi đè được bằng biến môi trường: môi trường phát triển chặn mọi host bên
 * ngoài nên không tự kiểm chứng lại được, sai thì sửa bằng env chứ không phải
 * sửa code rồi deploy lại.
 *
 * Đọc không ra thì BÁO LỖI kèm chẩn đoán. Không đường nào trong file này sinh
 * ra số liệu.
 *
 * Cấu hình (Vercel → Settings → Environment Variables):
 *   SOSOVALUE_API_KEY     bắt buộc
 *   SOSOVALUE_API_BASE    mặc định https://api.sosovalue.xyz
 *   SOSOVALUE_ETF_PATH    mặc định /openapi/v2/etf/currentEtfDataMetrics
 *   SOSOVALUE_ETF_METHOD  mặc định POST
 *   SOSOVALUE_KEY_HEADER  mặc định x-soso-api-key
 *   SOSOVALUE_TYPE_MAP    JSON {"SYMBOL":"loại"} để sửa mã tài sản
 *
 * ĐẶT KEY Ở ENV, KHÔNG BAO GIỜ Ở TRONG FILE NÀY.
 */

const TIMEOUT_MS = 9000;

const BASE = process.env.SOSOVALUE_API_BASE || 'https://api.sosovalue.xyz';
const PATH = process.env.SOSOVALUE_ETF_PATH || '/openapi/v2/etf/currentEtfDataMetrics';
const METHOD = (process.env.SOSOVALUE_ETF_METHOD || 'POST').toUpperCase();
const KEY_HEADER = process.env.SOSOVALUE_KEY_HEADER || 'x-soso-api-key';

/*
 * Tên trường dòng tiền ròng. dailyNetInflow là tên SoSoValue thực sự dùng —
 * xác nhận từ phản hồi thật của API chứ không phải phỏng đoán; các tên còn lại
 * giữ lại để chịu được thay đổi nhỏ.
 */
const NET_KEYS = ['dailyNetInflow', 'netInflow', 'daily_net_inflow', 'flow_usd', 'netFlow', 'value'];

// 12 tài sản. Mã loại theo khuôn us-<symbol>-spot; sai thì sửa bằng
// SOSOVALUE_TYPE_MAP chứ không phải sửa code.
const ASSETS = ['BTC', 'ETH', 'XRP', 'SOL', 'DOGE', 'LINK', 'AVAX', 'HBAR', 'LTC', 'DOT', 'HYPE', 'BNB']
  .map((symbol) => ({ symbol, type: `us-${symbol.toLowerCase()}-spot` }));

function typeMap() {
  const raw = (process.env.SOSOVALUE_TYPE_MAP || '').trim();
  if (!raw) return {};
  try { const o = JSON.parse(raw); return o && typeof o === 'object' ? o : {}; }
  catch (e) { return {}; }
}

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
 * SoSoValue KHÔNG trả số trần: dailyNetInflow & co. là object bọc quanh giá
 * trị. Nên đọc cả hai kiểu — số/chuỗi số thì lấy thẳng, object thì lần vào
 * trường giá trị bên trong. Vẫn không tìm thấy -> null, KHÔNG suy ra số.
 */
function deepNum(v) {
  if (v == null) return null;
  const direct = num(v);
  if (direct != null) return direct;
  if (typeof v === 'object' && !Array.isArray(v)) {
    for (const k of ['value', 'val', 'amount', 'num', 'total', 'usd', 'usdValue', 'data']) {
      const n = num(v[k]);
      if (n != null) return n;
    }
  }
  return null;
}

/* Lấy trường đầu tiên đọc được trong danh sách tên có thể có. */
function pick(obj, names) {
  for (const k of names) {
    if (obj && obj[k] != null) { const v = deepNum(obj[k]); if (v != null) return v; }
  }
  return null;
}

/*
 * Khi vẫn không đọc được: mô tả TỪNG trường ứng viên đã thấy — null, mảng, hay
 * object với những khoá nào. Chỉ tên khoá và kiểu, không kèm giá trị. Đủ để
 * sửa dứt điểm ở lần sau thay vì đoán thêm một vòng nữa.
 */
function fieldNote(d, names) {
  const out = [];
  for (const k of names) {
    if (!d || !(k in d)) continue;
    const v = d[k];
    if (v === null) out.push(`${k}=null`);
    else if (Array.isArray(v)) out.push(`${k}=mảng[${v.length}]${v[0] && typeof v[0] === 'object' ? '{' + Object.keys(v[0]).slice(0, 8).join(',') + '}' : ''}`);
    else if (typeof v === 'object') out.push(`${k}={${Object.keys(v).slice(0, 8).join(',')}}`);
    else out.push(`${k}=${typeof v}`);
  }
  if (!out.length) return d ? 'không có trường nào khớp; khoá thấy được: ' + Object.keys(d).slice(0, 12).join(', ') : '';
  return out.join(' · ');
}

/* Ngày: chấp nhận chuỗi ISO/yyyy-mm-dd hoặc epoch ms/giây, trần hoặc lồng. */
function pickDate(obj, names) {
  for (const k of names) {
    let v = obj && obj[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      // Object bọc: ngày thường nằm cạnh giá trị bên trong.
      v = v.date != null ? v.date : v.lastUpdateDate != null ? v.lastUpdateDate : v.time;
    }
    if (v == null) continue;
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    const n = num(v);
    if (n != null && n > 1e9) {
      const ms = n > 1e12 ? n : n * 1000;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  return null;
}

/*
 * Key không bao giờ nằm trong URL hay body ở đây, nhưng lỡ nhà cung cấp dội
 * ngược nó vào thông báo lỗi thì cũng không được để lọt ra ngoài.
 */
function scrub(msg, key) {
  let s = String(msg == null ? '' : msg);
  if (key && key.length >= 8) s = s.split(key).join('[key bị ẩn]');
  return s.slice(0, 200);
}

/*
 * `list` là mảng theo từng quỹ. Đọc được mã + dòng tiền thì dựng cột "quỹ đóng
 * góp nhiều nhất"; không đọc được thì trả mảng rỗng và cột đó để trống, chứ
 * không bịa mã chứng khoán.
 */
function readFunds(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((f) => {
      if (!f || typeof f !== 'object') return null;
      let ticker = '';
      for (const k of ['ticker', 'etf_ticker', 'etfTicker', 'symbol', 'code', 'tickerName']) {
        if (typeof f[k] === 'string' && f[k].trim()) { ticker = f[k].trim().toUpperCase(); break; }
      }
      const flow = pick(f, NET_KEYS);
      return ticker && flow != null ? { ticker, flow } : null;
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.flow) - Math.abs(a.flow));
}

function read(payload) {
  let d = payload;
  for (const k of ['data', 'result', 'body']) {
    if (d && typeof d === 'object' && d[k] && typeof d[k] === 'object') d = d[k];
  }
  if (Array.isArray(d)) d = d[0];
  if (!d || typeof d !== 'object') return { ok: false, note: 'phản hồi không phải object' };

  const netInflow = pick(d, NET_KEYS);
  if (netInflow == null) return { ok: false, note: fieldNote(d, NET_KEYS.concat(['list'])) };

  return {
    ok: true,
    data: {
      netInflow,
      cumNetInflow: pick(d, ['cumNetInflow', 'cumulativeNetInflow', 'totalNetInflow']),
      totalNetAssets: pick(d, ['totalNetAssets', 'netAssets', 'totalNetAsset']),
      date: pickDate(d, ['lastUpdateDate', 'date', 'tradingDay', 'timestamp', 'updateTime'].concat(NET_KEYS)),
      funds: readFunds(d.list),
      source: 'sosovalue',
    },
  };
}

async function fetchAsset(asset, key, types) {
  const type = types[asset.symbol] || asset.type;
  const url = BASE.replace(/\/+$/, '') + PATH;
  const headers = { [KEY_HEADER]: key, accept: 'application/json' };
  const opts = { method: METHOD, headers };
  let target = url;
  if (METHOD === 'GET') target += (url.indexOf('?') < 0 ? '?' : '&') + 'type=' + encodeURIComponent(type);
  else { headers['content-type'] = 'application/json'; opts.body = JSON.stringify({ type }); }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try { res = await fetch(target, { ...opts, signal: ctrl.signal }); }
  catch (e) {
    return { ok: false, message: scrub(e.name === 'AbortError' ? 'Quá thời gian chờ' : String(e.message || e), key) };
  } finally { clearTimeout(timer); }

  if (!res.ok) {
    // Nói rõ ĐÃ GỌI GÌ (không kèm key) để sửa được bằng biến môi trường.
    return { ok: false, message: `HTTP ${res.status} · ${METHOD} ${PATH} type=${type}` };
  }
  let body;
  try { body = await res.json(); } catch (e) { return { ok: false, message: 'Không phải JSON' }; }
  if (body && body.code != null && String(body.code) !== '0' && String(body.code) !== '200') {
    return { ok: false, message: scrub(body.msg || body.message || `code ${body.code}`, key) };
  }
  const r = read(body);
  if (!r.ok) return { ok: false, message: `Không đọc được dòng tiền${r.note ? ' — ' + r.note : ''}` };
  return { ok: true, data: r.data };
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
  const key = (process.env.SOSOVALUE_API_KEY || '').trim();
  if (!key) {
    return json(res, 200, {
      configured: false,
      sources: [],
      supported: [],
      message: 'Chưa cấu hình SOSOVALUE_API_KEY. Dòng tiền ETF cần nhà cung cấp có API key.',
    });
  }

  const types = typeMap();
  const results = await pool(ASSETS, async (a) => ({ symbol: a.symbol, res: await fetchAsset(a, key, types) }), 4);

  /*
   * CHỐT MỘT NGÀY CHO CẢ BẢNG. Cùng một nguồn nhưng mỗi tài sản chốt số xong
   * vào lúc khác nhau, nên vẫn lệch được. Bảng trộn hai ngày mà không nói ra
   * thì cộng lại ra một con số không tồn tại. Lấy ngày nhiều tài sản có nhất
   * (hoà thì lấy ngày mới hơn) và đánh dấu dòng nào lệch.
   */
  const tally = new Map();
  for (const r of results) {
    const d = r.res.ok && r.res.data.date;
    if (d) tally.set(d, (tally.get(d) || 0) + 1);
  }
  let target = null;
  for (const [d, n] of tally) {
    const best = target ? tally.get(target) : -1;
    if (n > best || (n === best && d > target)) target = d;
  }

  const data = {};
  const errors = [];
  const dates = new Set();
  for (const r of results) {
    if (!r.res.ok) { errors.push(`${r.symbol}: ${r.res.message}`); continue; }
    let row = r.res.data;
    if (row.date && row.date !== target) row = { ...row, offDate: true };
    if (row.date) dates.add(row.date);
    data[r.symbol] = row;
  }

  return json(res, 200, {
    configured: true,
    available: Object.keys(data).length > 0,
    sources: ['sosovalue'],
    supported: ASSETS.map((a) => a.symbol),   // một nguồn phủ cả 12
    generatedAt: new Date().toISOString(),
    date: target,
    mixedDates: dates.size > 1,
    assets: data,
    errors: errors.slice(0, 24),
  });
};
