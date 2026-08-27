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

/*
 * 12 tài sản, mỗi tài sản một danh sách MÃ LOẠI để thử.
 *
 * us-btc-spot / us-eth-spot / us-sol-spot đã chạy thật (trả về số khớp với
 * trang của SoSoValue, kèm mã quỹ IBIT/GBTC/ETHA/BSOL...). Các tài sản còn lại
 * trả về VỎ RỖNG với cùng khuôn đó, nên khuôn đúng nhưng mã có thể khác — vài
 * nguồn dùng tên đầy đủ (ripple, dogecoin) thay vì mã ngắn.
 *
 * Nên thử lần lượt và CHỈ NHẬN bản ghi có ngày thật. Đây không phải đoán bừa:
 * mỗi lần thử đều được kiểm chứng, thử hết mà không có bản ghi nào có ngày thì
 * báo "nguồn không có tài sản này" chứ không nhận vỏ rỗng làm dữ liệu.
 *
 * Biết chắc mã đúng thì đặt SOSOVALUE_TYPE_MAP để khỏi phải thử.
 */
const ASSETS = [
  { symbol: 'BTC',  types: ['us-btc-spot'] },
  { symbol: 'ETH',  types: ['us-eth-spot'] },
  { symbol: 'XRP',  types: ['us-xrp-spot', 'us-ripple-spot'] },
  { symbol: 'SOL',  types: ['us-sol-spot'] },
  { symbol: 'DOGE', types: ['us-doge-spot', 'us-dogecoin-spot'] },
  { symbol: 'LINK', types: ['us-link-spot', 'us-chainlink-spot'] },
  { symbol: 'AVAX', types: ['us-avax-spot', 'us-avalanche-spot'] },
  { symbol: 'HBAR', types: ['us-hbar-spot', 'us-hedera-spot'] },
  { symbol: 'LTC',  types: ['us-ltc-spot', 'us-litecoin-spot'] },
  { symbol: 'DOT',  types: ['us-dot-spot', 'us-polkadot-spot'] },
  { symbol: 'HYPE', types: ['us-hype-spot', 'us-hyperliquid-spot'] },
  { symbol: 'BNB',  types: ['us-bnb-spot', 'us-binancecoin-spot', 'us-binance-coin-spot'] },
];

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

const DATE_KEYS = ['lastUpdateDate', 'date', 'tradingDay', 'timestamp', 'updateTime'];

/*
 * Mảng thì phải lấy bản ghi MỚI NHẤT theo ngày, không phải phần tử đầu. Nhà
 * cung cấp xếp cũ-trước thì d[0] là ngày cũ nhất — số hiện ra sai hoàn toàn mà
 * trông vẫn hợp lý. Không đọc được ngày của phần tử nào thì mới đành lấy d[0].
 */
function newest(arr) {
  let best = null;
  for (const row of arr) {
    if (!row || typeof row !== 'object') continue;
    const d = pickDate(row, DATE_KEYS.concat(NET_KEYS));
    if (!d) continue;
    if (!best || d > best.date) best = { date: d, row };
  }
  return best ? best.row : arr[0];
}

/*
 * Liệt kê MỌI số đọc được bên trong object bọc. Khi số hiện ra không khớp
 * trang của nhà cung cấp, đây là thứ nói cho biết đã lấy nhầm trường nào —
 * thay vì đoán thêm một vòng nữa.
 */
function candidates(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out = {};
  for (const k of Object.keys(v).slice(0, 20)) {
    const n = num(v[k]);
    if (n != null) out[k] = n;
  }
  return Object.keys(out).length ? out : null;
}

function read(payload) {
  let d = payload;
  for (const k of ['data', 'result', 'body']) {
    if (d && typeof d === 'object' && d[k] && typeof d[k] === 'object') d = d[k];
  }
  if (Array.isArray(d)) d = d.length ? newest(d) : null;
  if (!d || typeof d !== 'object') return { ok: false, note: 'phản hồi không phải object' };

  const netInflow = pick(d, NET_KEYS);
  if (netInflow == null) return { ok: false, note: fieldNote(d, NET_KEYS.concat(['list'])) };

  return {
    ok: true,
    data: {
      netInflow,
      cumNetInflow: pick(d, ['cumNetInflow', 'cumulativeNetInflow', 'totalNetInflow']),
      totalNetAssets: pick(d, ['totalNetAssets', 'netAssets', 'totalNetAsset']),
      traded: pick(d, ['dailyTotalValueTraded', 'totalValueTraded', 'volume', 'dailyVolume']),
      // SoSoValue hiện "x12", "x11" — số quỹ đang niêm yết của tài sản đó.
      fundCount: Array.isArray(d.list) ? d.list.length : null,
      date: pickDate(d, DATE_KEYS.concat(NET_KEYS)),
      funds: readFunds(d.list),
      source: 'sosovalue',
    },
    // Chỉ trả về khi gọi kèm ?diag=1. Tên trường + các số đọc được bên trong,
    // đủ để đối chiếu với trang của nhà cung cấp và sửa dứt điểm.
    diag: {
      keys: Object.keys(d).slice(0, 20),
      wasArray: Array.isArray(payload && payload.data),
      netField: NET_KEYS.find((k) => d[k] != null) || null,
      netCandidates: candidates(d[NET_KEYS.find((k) => d[k] != null)]),
      listLen: Array.isArray(d.list) ? d.list.length : null,
      listKeys: Array.isArray(d.list) && d.list[0] && typeof d.list[0] === 'object'
        ? Object.keys(d.list[0]).slice(0, 12) : null,
    },
  };
}

/* Một lần gọi cho một mã loại. */
async function fetchOne(type, key) {
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
  return { ok: true, data: r.data, diag: r.diag };
}

/*
 * VỎ RỖNG vs SỐ 0 THẬT — phân biệt bằng TÀI SẢN RÒNG, không phải bằng ngày.
 *
 * Trang SoSoValue cho thấy LINK, HBAR, AVAX, DOGE, DOT có dòng tiền đúng bằng
 * $0.00 nhưng tài sản ròng $170.25M, $56.88M, $37.03M... Quỹ có thật, chỉ là
 * hôm đó không ai tạo/huỷ chứng chỉ. Đó là DỮ LIỆU, phải hiện $0.
 *
 * Vỏ rỗng là bản ghi mà MỌI chỉ số đều trống: không dòng tiền, không tài sản
 * ròng, không giá trị giao dịch, không quỹ nào. Quỹ có tồn tại thì tài sản
 * ròng không thể bằng 0 — nên bản ghi thế này nghĩa là nguồn không nhận ra mã
 * tài sản. Nhận nó làm dữ liệu là bày ra một số 0 giả.
 */
function isShell(d) {
  return !d.netInflow && !d.totalNetAssets && !d.traded && !(d.funds && d.funds.length);
}

/*
 * Thử lần lượt các mã loại, CHỈ NHẬN bản ghi không phải vỏ rỗng. Hết mã mà vẫn
 * rỗng -> báo nguồn không có tài sản này, kèm danh sách đã thử.
 */
async function fetchAsset(asset, key, override) {
  const list = override[asset.symbol] ? [override[asset.symbol]] : asset.types;
  const tried = [];
  let lastErr = null;
  for (const type of list) {
    const r = await fetchOne(type, key);
    tried.push(type);
    if (!r.ok) { lastErr = r.message; continue; }
    if (!isShell(r.data)) return { ok: true, data: r.data, diag: { ...r.diag, type } };
    lastErr = null;                      // gọi được, chỉ là rỗng
  }
  if (lastErr) return { ok: false, message: lastErr, tried };
  return { ok: false, empty: true, message: `Nguồn không có ETF cho tài sản này (đã thử: ${tried.join(', ')})`, tried };
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
  // ?diag=1 -> kèm mô tả dạng dữ liệu thật của nhà cung cấp. Chỉ tên trường và
  // các số đọc được, không bao giờ kèm key.
  const wantDiag = !!(req && req.query && String(req.query.diag || '') === '1');
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
  const notCovered = [];
  const dates = new Set();
  const diag = {};
  for (const r of results) {
    if (!r.res.ok) {
      // Nguồn KHÔNG CÓ tài sản này khác hẳn với gọi hỏng. Gộp làm một là để
      // người xem tưởng đợi thêm sẽ có.
      if (r.res.empty) notCovered.push(r.symbol);
      else errors.push(`${r.symbol}: ${r.res.message}`);
      continue;
    }
    let row = r.res.data;
    if (row.date && row.date !== target) row = { ...row, offDate: true };
    if (row.date) dates.add(row.date);
    data[r.symbol] = row;
    if (wantDiag) diag[r.symbol] = r.res.diag;
  }

  /*
   * Cờ báo động: mọi tài sản ra CÙNG một con số. Nghĩa là tham số `type` không
   * được nhà cung cấp dùng đến — nó trả cùng một bản ghi cho mọi lần gọi, và
   * cả bảng là một con số duy nhất lặp 12 lần. Trông vẫn hợp lý nên không ai
   * nhận ra; phải nói thẳng ra.
   */
  const vals = Object.values(data).map((v) => v.netInflow);
  const sameValue = vals.length > 2 && vals.every((v) => v === vals[0]);

  return json(res, 200, {
    configured: true,
    available: Object.keys(data).length > 0,
    sources: ['sosovalue'],
    // Tài sản nguồn THỰC SỰ phục vụ — không phải 12 mã ta hỏi. Vỏ rỗng không
    // tính là được phục vụ.
    supported: ASSETS.map((a) => a.symbol).filter((sym) => notCovered.indexOf(sym) < 0),
    notCovered,
    generatedAt: new Date().toISOString(),
    date: target,
    mixedDates: dates.size > 1,
    sameValue,
    assets: data,
    errors: errors.slice(0, 24),
    ...(wantDiag ? { diag } : {}),
  });
};
