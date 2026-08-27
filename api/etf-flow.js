/*
 * Dòng tiền ETF giao ngay — HÀM SERVER (Vercel Serverless Function).
 *
 * Vì sao phải có file này: dòng tiền ròng của ETF chỉ nhà cung cấp có API key
 * mới công bố, mà API key TUYỆT ĐỐI không được xuống trình duyệt. Trang tĩnh
 * gọi hàm này, hàm này giữ key lại và gọi nhà cung cấp.
 *
 * HAI NGUỒN, dùng được cùng lúc:
 *
 *   CoinGlass  — đường dẫn lấy từ TÀI LIỆU CHÍNH THỨC (coinglass-api-docs),
 *                đã đối chiếu, không đoán. Chỉ có 4 tài sản:
 *                  GET /api/etf/{bitcoin|ethereum|solana|xrp}/flow-history
 *                  header CG-API-KEY. Có ở mọi gói kể cả Hobbyist.
 *                Kèm dòng tiền TỪNG QUỸ trong etf_flows[].
 *
 *   SoSoValue  — phủ nhiều tài sản hơn. CẢNH BÁO: đường dẫn và tên trường bên
 *                dưới CHƯA ĐỐI CHIẾU được với tài liệu (môi trường phát triển
 *                chặn mọi host bên ngoài). Nên toàn bộ đều ghi đè được bằng
 *                biến môi trường, và khi gọi hỏng hàm trả về ĐÚNG thứ nó đã
 *                gọi + các trường nó thấy, để sửa bằng env chứ không phải sửa
 *                code. Không nhận ra dạng dữ liệu -> báo lỗi, KHÔNG suy đoán số.
 *
 * Tài sản nào cả hai nguồn đều trả về thì lấy CoinGlass (đã xác minh) và ghi
 * nguồn vào từng dòng để giao diện nói rõ số đến từ đâu.
 *
 * Không có key nào -> configured:false. Gọi hỏng -> errors kèm lý do.
 * Không đường nào trong file này sinh ra số liệu.
 *
 * Cấu hình (Vercel → Settings → Environment Variables):
 *   COINGLASS_API_KEY     tuỳ chọn (bật 4 tài sản đã xác minh)
 *   SOSOVALUE_API_KEY     tuỳ chọn (bật thêm các tài sản khác)
 *   COINGLASS_API_BASE    mặc định https://open-api-v4.coinglass.com
 *   SOSOVALUE_API_BASE    mặc định https://api.sosovalue.xyz
 *   SOSOVALUE_ETF_PATH    mặc định /openapi/v2/etf/currentEtfDataMetrics
 *   SOSOVALUE_ETF_METHOD  mặc định POST
 *   SOSOVALUE_KEY_HEADER  mặc định x-soso-api-key
 *   SOSOVALUE_TYPE_MAP    JSON {"SYMBOL":"loại"} để sửa mã tài sản
 *
 * ĐẶT KEY Ở ENV, KHÔNG BAO GIỜ Ở TRONG FILE NÀY.
 */

const TIMEOUT_MS = 9000;

const CG_BASE = process.env.COINGLASS_API_BASE || 'https://open-api-v4.coinglass.com';
const SS_BASE = process.env.SOSOVALUE_API_BASE || 'https://api.sosovalue.xyz';
const SS_PATH = process.env.SOSOVALUE_ETF_PATH || '/openapi/v2/etf/currentEtfDataMetrics';
const SS_METHOD = (process.env.SOSOVALUE_ETF_METHOD || 'POST').toUpperCase();
const SS_KEY_HEADER = process.env.SOSOVALUE_KEY_HEADER || 'x-soso-api-key';

// 12 tài sản người dùng yêu cầu. cg = đoạn đường dẫn CoinGlass (null = nguồn
// này không có). ss = mã loại SoSoValue, theo khuôn us-<symbol>-spot; sai thì
// sửa bằng SOSOVALUE_TYPE_MAP chứ không phải sửa code.
const ASSETS = [
  { symbol: 'BTC',  cg: 'bitcoin'  }, { symbol: 'ETH',  cg: 'ethereum' },
  { symbol: 'XRP',  cg: 'xrp'      }, { symbol: 'SOL',  cg: 'solana'   },
  { symbol: 'DOGE', cg: null }, { symbol: 'LINK', cg: null },
  { symbol: 'AVAX', cg: null }, { symbol: 'HBAR', cg: null },
  { symbol: 'LTC',  cg: null }, { symbol: 'DOT',  cg: null },
  { symbol: 'HYPE', cg: null }, { symbol: 'BNB',  cg: null },
].map((a) => ({ ...a, ss: `us-${a.symbol.toLowerCase()}-spot` }));

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

/* Lấy trường đầu tiên đọc được trong danh sách tên có thể có. */
function pick(obj, names) {
  for (const k of names) {
    if (obj && obj[k] != null) { const v = num(obj[k]); if (v != null) return v; }
  }
  return null;
}

/* Ngày: chấp nhận chuỗi ISO/yyyy-mm-dd hoặc epoch ms/giây. */
function pickDate(obj, names) {
  for (const k of names) {
    const v = obj && obj[k];
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
function scrub(msg, keys) {
  let s = String(msg == null ? '' : msg);
  for (const k of keys) { if (k && k.length >= 8) s = s.split(k).join('[key bị ẩn]'); }
  return s.slice(0, 200);
}

async function call(url, opts) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try { return { ok: true, res: await fetch(url, { ...opts, signal: ctrl.signal }) }; }
  catch (e) {
    return { ok: false, message: e.name === 'AbortError' ? 'Quá thời gian chờ' : String(e.message || e) };
  } finally { clearTimeout(timer); }
}

/* ------------------------------ CoinGlass ------------------------------ */
/*
 * data là MẢNG theo ngày:
 *   { timestamp, flow_usd, price_usd, etf_flows: [{ etf_ticker, flow_usd }] }
 * Không tin thứ tự mảng — lấy phần tử có timestamp lớn nhất.
 */
function cgLatest(rows) {
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
        .map((f) => ({ ticker: String((f && f.etf_ticker) || '').toUpperCase(), flow: num(f && f.flow_usd) }))
        .filter((f) => f.ticker && f.flow != null)
        .sort((a, b) => Math.abs(b.flow) - Math.abs(a.flow))
    : [];
  return {
    netInflow: flow,
    price: num(r.price_usd),
    date: new Date(best.t).toISOString().slice(0, 10),
    funds,
    source: 'coinglass',
  };
}

async function fromCoinGlass(asset, key) {
  const c = await call(`${CG_BASE}/api/etf/${asset.cg}/flow-history`, {
    headers: { 'CG-API-KEY': key, accept: 'application/json' },
  });
  if (!c.ok) return { ok: false, message: scrub(c.message, [key]) };
  if (!c.res.ok) return { ok: false, message: `HTTP ${c.res.status}` };
  let body;
  try { body = await c.res.json(); } catch (e) { return { ok: false, message: 'Không phải JSON' }; }
  // CoinGlass bọc trong {code,msg,data}; code "0" là thành công.
  if (body && body.code != null && String(body.code) !== '0') {
    return { ok: false, message: scrub(body.msg || `code ${body.code}`, [key]) };
  }
  const data = cgLatest(body && body.data);
  if (!data) return { ok: false, message: 'Không có bản ghi đọc được' };
  return { ok: true, data };
}

/* ------------------------------ SoSoValue ------------------------------ */
/*
 * Dạng phản hồi CHƯA đối chiếu được với tài liệu, nên nhận nhiều tên trường có
 * thể có. Không khớp tên nào -> trả về danh sách TÊN trường đã thấy (chỉ tên,
 * không kèm giá trị) để sửa bằng env. Không đoán ra số.
 */
function ssRead(payload) {
  let d = payload;
  for (const k of ['data', 'result', 'body']) {
    if (d && typeof d === 'object' && d[k] && typeof d[k] === 'object') d = d[k];
  }
  if (Array.isArray(d)) d = d[0];
  if (!d || typeof d !== 'object') return { ok: false, keys: [] };
  const netInflow = pick(d, ['dailyNetInflow', 'netInflow', 'daily_net_inflow', 'flow_usd', 'netFlow']);
  if (netInflow == null) return { ok: false, keys: Object.keys(d).slice(0, 12) };
  return {
    ok: true,
    data: {
      netInflow,
      cumNetInflow: pick(d, ['cumNetInflow', 'cumulativeNetInflow', 'totalNetInflow']),
      totalNetAssets: pick(d, ['totalNetAssets', 'netAssets', 'totalNetAsset']),
      price: pick(d, ['price', 'price_usd', 'lastPrice']),
      date: pickDate(d, ['lastUpdateDate', 'date', 'tradingDay', 'timestamp', 'updateTime']),
      funds: [],                 // nguồn này chưa xác minh có tách theo quỹ
      source: 'sosovalue',
    },
  };
}

async function fromSoSoValue(asset, key, types) {
  const type = types[asset.symbol] || asset.ss;
  const url = SS_BASE.replace(/\/+$/, '') + SS_PATH;
  const headers = { [SS_KEY_HEADER]: key, accept: 'application/json' };
  const opts = { method: SS_METHOD, headers };
  let target = url;
  if (SS_METHOD === 'GET') target += (url.indexOf('?') < 0 ? '?' : '&') + 'type=' + encodeURIComponent(type);
  else { headers['content-type'] = 'application/json'; opts.body = JSON.stringify({ type }); }

  const c = await call(target, opts);
  if (!c.ok) return { ok: false, message: scrub(c.message, [key]) };
  if (!c.res.ok) {
    // Nói rõ ĐÃ GỌI GÌ (không kèm key) để sửa được bằng biến môi trường.
    return { ok: false, message: `HTTP ${c.res.status} · ${SS_METHOD} ${SS_PATH} type=${type}` };
  }
  let body;
  try { body = await c.res.json(); } catch (e) { return { ok: false, message: 'Không phải JSON' }; }
  if (body && body.code != null && String(body.code) !== '0' && String(body.code) !== '200') {
    return { ok: false, message: scrub(body.msg || body.message || `code ${body.code}`, [key]) };
  }
  const read = ssRead(body);
  if (!read.ok) {
    return {
      ok: false,
      message: `Không nhận ra dạng dữ liệu${read.keys.length ? ' (trường thấy: ' + read.keys.join(', ') + ')' : ''}`,
    };
  }
  return { ok: true, data: read.data };
}

/* ---------------------------------------------------------------------- */

async function pool(items, worker, size) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(new Array(Math.min(size, items.length)).fill(0).map(async () => {
    while (i < items.length) { const idx = i++; out[idx] = await worker(items[idx]); }
  }));
  return out;
}

module.exports = async function handler(req, res) {
  const cgKey = (process.env.COINGLASS_API_KEY || '').trim();
  const ssKey = (process.env.SOSOVALUE_API_KEY || '').trim();
  const sources = [];
  if (cgKey) sources.push('coinglass');
  if (ssKey) sources.push('sosovalue');

  if (!sources.length) {
    return json(res, 200, {
      configured: false,
      sources: [],
      supported: [],
      message: 'Chưa cấu hình nguồn ETF. Đặt COINGLASS_API_KEY và/hoặc SOSOVALUE_API_KEY ở biến môi trường phía server.',
    });
  }

  // Tài sản nào ÍT NHẤT một nguồn đã cấu hình có thể phục vụ.
  const types = typeMap();
  const supported = ASSETS.filter((a) => (cgKey && a.cg) || ssKey).map((a) => a.symbol);

  const results = await pool(ASSETS, async (a) => {
    const errs = [];
    // CoinGlass trước: đây là nguồn đã đối chiếu tài liệu.
    if (cgKey && a.cg) {
      const r = await fromCoinGlass(a, cgKey);
      if (r.ok) return { symbol: a.symbol, data: r.data, errs };
      errs.push(`${a.symbol} (CoinGlass): ${r.message}`);
    }
    if (ssKey) {
      const r = await fromSoSoValue(a, ssKey, types);
      if (r.ok) return { symbol: a.symbol, data: r.data, errs };
      errs.push(`${a.symbol} (SoSoValue): ${r.message}`);
    }
    return { symbol: a.symbol, data: null, errs };
  }, 4);

  const data = {};
  const errors = [];
  for (const r of results) {
    if (r.data) data[r.symbol] = r.data;
    else errors.push(...r.errs);
  }
  return json(res, 200, {
    configured: true,
    available: Object.keys(data).length > 0,
    sources,
    supported,
    generatedAt: new Date().toISOString(),
    assets: data,
    errors: errors.slice(0, 24),
  });
};
