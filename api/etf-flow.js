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

/*
 * Tên trường dòng tiền ròng. dailyNetInflow là tên SoSoValue thực sự dùng —
 * xác nhận từ phản hồi thật của API chứ không phải phỏng đoán; các tên còn lại
 * giữ lại để chịu được thay đổi nhỏ.
 */
const NET_KEYS = ['dailyNetInflow', 'netInflow', 'daily_net_inflow', 'flow_usd', 'netFlow', 'value'];

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
  // Không có tên nào khớp -> liệt kê các khoá thật sự có, nếu không thông báo
  // lỗi rỗng thì lần sau vẫn phải đoán tiếp.
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
function cgParse(rows) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const r of rows) {
    const t = num(r && r.timestamp);
    const flow = num(r && r.flow_usd);
    if (t == null || flow == null) continue;      // không đọc được -> bỏ, không suy đoán
    const funds = Array.isArray(r.etf_flows)
      ? r.etf_flows
          .map((f) => ({ ticker: String((f && f.etf_ticker) || '').toUpperCase(), flow: num(f && f.flow_usd) }))
          .filter((f) => f.ticker && f.flow != null)
          .sort((a, b) => Math.abs(b.flow) - Math.abs(a.flow))
      : [];
    out.push({
      netInflow: flow,
      price: num(r.price_usd),
      date: new Date(t > 1e12 ? t : t * 1000).toISOString().slice(0, 10),
      funds,
      source: 'coinglass',
    });
  }
  // Mới nhất trước. Không tin thứ tự mảng của nhà cung cấp.
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
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
  const history = cgParse(body && body.data);
  if (!history.length) return { ok: false, message: 'Không có bản ghi đọc được' };
  return { ok: true, history };
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
  if (!d || typeof d !== 'object') return { ok: false, note: 'phản hồi không phải object' };

  const netInflow = pick(d, NET_KEYS);
  if (netInflow == null) return { ok: false, note: fieldNote(d, NET_KEYS.concat(['list'])) };

  return {
    ok: true,
    data: {
      netInflow,
      cumNetInflow: pick(d, ['cumNetInflow', 'cumulativeNetInflow', 'totalNetInflow']),
      totalNetAssets: pick(d, ['totalNetAssets', 'netAssets', 'totalNetAsset']),
      price: pick(d, ['price', 'price_usd', 'lastPrice']),
      date: pickDate(d, ['lastUpdateDate', 'date', 'tradingDay', 'timestamp', 'updateTime'].concat(NET_KEYS)),
      funds: ssFunds(d.list),
      source: 'sosovalue',
    },
  };
}

/*
 * `list` là mảng theo từng quỹ. Đọc được mã + dòng tiền thì dựng cột "quỹ đóng
 * góp nhiều nhất" như bên CoinGlass; không đọc được thì trả mảng rỗng và cột
 * đó để trống, chứ không bịa mã chứng khoán.
 */
function ssFunds(list) {
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
    return { ok: false, message: `Không đọc được dòng tiền${read.note ? ' — ' + read.note : ''}` };
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

  // Vòng 1: hỏi cả hai nguồn. CoinGlass trả về CẢ LỊCH SỬ, chưa chọn ngày.
  const results = await pool(ASSETS, async (a) => {
    const errs = [];
    let cg = null, ss = null;
    if (cgKey && a.cg) {
      const r = await fromCoinGlass(a, cgKey);
      if (r.ok) cg = r.history;
      else errs.push(`${a.symbol} (CoinGlass): ${r.message}`);
    }
    if (ssKey && !cg) {
      const r = await fromSoSoValue(a, ssKey, types);
      if (r.ok) ss = r.data;
      else errs.push(`${a.symbol} (SoSoValue): ${r.message}`);
    }
    return { symbol: a.symbol, cg, ss, errs };
  }, 4);

  /*
   * Vòng 2: CHỌN NGÀY CHUNG.
   *
   * Hai nguồn công bố lệch nhau: một bên đã chốt hôm qua, bên kia đã có hôm
   * nay. Cứ mỗi tài sản lấy bản ghi mới nhất của riêng nó thì bảng trộn hai
   * ngày khác nhau mà không ai biết — cộng lại ra một con số không tồn tại
   * trong thực tế. Nên chốt MỘT ngày cho cả bảng: ngày mới nhất mà nhiều tài
   * sản có nhất, rồi CoinGlass lấy đúng bản ghi của ngày đó trong lịch sử.
   */
  const tally = new Map();
  for (const r of results) {
    const d = r.cg ? r.cg[0].date : r.ss ? r.ss.date : null;
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
    let picked = null;
    if (r.cg) picked = r.cg.find((row) => row.date === target) || r.cg[0];
    else if (r.ss) picked = r.ss;
    if (!picked) { errors.push(...r.errs); continue; }
    // Dòng nào không phải ngày chung thì đánh dấu, để giao diện nói ra chứ
    // không im lặng trộn lẫn.
    if (picked.date && picked.date !== target) picked = { ...picked, offDate: true };
    if (picked.date) dates.add(picked.date);
    data[r.symbol] = picked;
    errors.push(...r.errs);
  }

  return json(res, 200, {
    configured: true,
    available: Object.keys(data).length > 0,
    sources,
    supported,
    generatedAt: new Date().toISOString(),
    date: target,
    mixedDates: dates.size > 1,
    assets: data,
    errors: errors.slice(0, 24),
  });
};
