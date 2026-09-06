/*
 * QUAN TRẮC — điểm cuối trạng thái nguồn dữ liệu.
 *
 * Mục 7 của docs/INFRA-SCALING.md, phần ĐO. Phần GỬI CẢNH BÁO đã bỏ theo yêu
 * cầu: endpoint này chỉ trả trạng thái, không gửi thông báo đi đâu cả và không
 * giữ khoá của dịch vụ nào.
 *
 * ĐO GÌ
 * -----
 *   · độ trễ dữ liệu từng sàn — sàn nào ngừng cập nhật quá 5 phút thì đánh dấu
 *   · tỉ lệ lỗi khi gọi API
 *   · thời gian chạy mỗi lượt kiểm
 *   · lệch đồng hồ giữa ta và sàn
 *   · số tín hiệu sinh ra mỗi ngày (cần kho dữ liệu, xem GHI CHÚ cuối tệp)
 */

const envelope = require('./_envelope');

const TIMEOUT_MS = 6000;

// Ngưỡng theo yêu cầu: một sàn ngừng cập nhật quá 5 phút là bất thường.
const STALE_MS = 5 * 60 * 1000;

const SOURCES = [
  { id: 'binance', url: 'https://fapi.binance.com/fapi/v1/time', pick: (j) => j && j.serverTime },
  {
    id: 'bybit', url: 'https://api.bybit.com/v5/market/time',
    pick: (j) => (j && j.result && j.result.timeSecond ? Number(j.result.timeSecond) * 1000 : null),
  },
  {
    id: 'okx', url: 'https://www.okx.com/api/v5/public/time',
    pick: (j) => (j && j.data && j.data[0] ? Number(j.data[0].ts) : null),
  },
  {
    id: 'bitget', url: 'https://api.bitget.com/api/v2/public/time',
    pick: (j) => (j && j.data ? Number(j.data.serverTime) : null),
  },
];

function num(x) {
  if (x == null || x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

async function probe(src) {
  const started = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(src.url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    const ms = Date.now() - started;
    if (!r.ok) return { id: src.id, ok: false, latencyMs: ms, error: 'HTTP ' + r.status };
    const j = await r.json();
    const serverMs = num(src.pick(j));
    return {
      id: src.id, ok: true, latencyMs: Date.now() - started,
      serverTime: serverMs,
      // Lệch đồng hồ giữa sàn và ta. Lệch lớn nghĩa là một trong hai bên sai
      // giờ, và mọi phép so theo thời gian sau đó đều đáng ngờ.
      clockSkewMs: serverMs != null ? Date.now() - serverMs : null,
    };
  } catch (e) {
    return {
      id: src.id, ok: false, latencyMs: Date.now() - started,
      error: String((e && e.name === 'AbortError') ? 'timeout' : (e && e.message) || e),
    };
  } finally { clearTimeout(t); }
}

/* --------------------------- phần thuần tính --------------------------- */

/*
 * Tổng hợp trạng thái từ các phép đo.
 *
 * `lastSeen` = { binance: ms, ... } — thời điểm cuối cùng mỗi sàn còn trả lời,
 * do bộ nhớ của instance giữ. Instance mới khởi động thì chưa có gì, và lúc đó
 * KHÔNG được kết luận "sàn chết": chưa biết khác với hỏng.
 */
function summarize(probes, lastSeen, now, staleMs) {
  const cutoff = num(staleMs) != null ? num(staleMs) : STALE_MS;
  const rows = [];
  let down = 0, unknown = 0;
  for (const p of probes || []) {
    const seen = lastSeen ? num(lastSeen[p.id]) : null;
    const sinceMs = seen != null ? now - seen : null;
    let state;
    if (p.ok) state = 'up';
    else if (sinceMs == null) { state = 'unknown'; unknown++; }
    else if (sinceMs > cutoff) { state = 'down'; down++; }
    else state = 'degraded';
    rows.push({
      id: p.id, state: state, ok: !!p.ok,
      latencyMs: p.latencyMs, error: p.error || null,
      lastSeenMs: seen, sinceMs: sinceMs, clockSkewMs: p.clockSkewMs == null ? null : p.clockSkewMs,
    });
  }
  const total = rows.length;
  return {
    sources: rows,
    total: total,
    down: down,
    unknown: unknown,
    errorRate: total ? rows.filter((r) => !r.ok).length / total : null,
    // "healthy" chỉ khi KHÔNG có sàn nào chết. Sàn chưa biết trạng thái không
    // được tính là khoẻ, cũng không bị tính là chết.
    healthy: down === 0,
    staleMs: cutoff,
  };
}

/* --------------------------- đệm của instance -------------------------- */

let lastSeen = {};
let cache = null;
const REFRESH_MS = 60 * 1000;

async function build() {
  const started = Date.now();
  const probes = await Promise.all(SOURCES.map(probe));
  const now = Date.now();
  for (const p of probes) if (p.ok) lastSeen[p.id] = now;

  const summary = summarize(probes, lastSeen, now, STALE_MS);

  return Object.assign({ ok: true }, summary, {
    jobMs: Date.now() - started,
    generatedAt: new Date(now).toISOString(),
  });
}

module.exports = async function handler(req, res) {
  try {
    if (!cache || Date.now() - cache.at > REFRESH_MS) {
      cache = { at: Date.now(), payload: await build() };
    }
    envelope.send(res, cache.payload, { sMaxAge: 60, maxAgeSeconds: 180 });
  } catch (e) {
    envelope.fail(res, e);
  }
};

/*
 * GHI CHÚ VỀ THỨ CHƯA LÀM ĐƯỢC TỪ ĐÂY
 * -----------------------------------
 * "Số tín hiệu sinh ra mỗi ngày" và "thời gian chạy job" của worker nền cần
 * một kho dữ liệu bền và một tiến trình chạy liên tục — hàm serverless này
 * sống vài trăm mili giây rồi chết, và bộ nhớ instance ở trên chỉ tồn tại tới
 * lần khởi động lạnh kế tiếp.
 *
 * Vì vậy `lastSeen` ở đây là bộ nhớ TẠM và trạng thái 'unknown' sau mỗi lần
 * khởi động lạnh là thật, không phải lỗi. Muốn quan trắc đúng nghĩa thì phải
 * có worker và kho dữ liệu như docs/INFRA-SCALING.md mô tả — phần đó cần hạ
 * tầng bên ngoài repo này.
 */
module.exports._pure = { summarize, STALE_MS };
module.exports._reset = function () { lastSeen = {}; cache = null; };
