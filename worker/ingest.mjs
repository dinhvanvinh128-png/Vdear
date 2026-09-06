/*
 * Vdearypto — worker nạp dữ liệu nền.
 *
 * ĐỌC worker/README.md TRƯỚC: tệp này CHƯA TỪNG CHẠY trên hạ tầng thật. Nó
 * được viết theo tài liệu API đã đối chiếu và dùng lại các module thuần tính
 * đã có bài kiểm, nhưng phần nạp thật và ghi thật cần chạy một lần với dữ liệu
 * thật rồi mới tin được.
 *
 * Không có phụ thuộc ngoài. Postgres nói giao thức nhị phân nên bình thường
 * phải có thư viện client; ở đây ta ghi qua PostgREST của Supabase bằng fetch,
 * đúng cách api/ đang làm, để worker chạy được với `node ingest.mjs` trần.
 * Muốn nối thẳng Postgres thì thay đúng hàm `write()` bên dưới.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* --------- dùng lại module thuần tính đã có bài kiểm, không chép lại ----- */

function loadBrowserModule(file, key) {
  const self_ = {};
  const ctx = { self: self_, Math, Number, Object, Array, JSON, Date };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(
    path.join(HERE, '..', 'legacy-static', 'js', file), 'utf8'), ctx);
  return self_[key];
}
const Tape = loadBrowserModule('tape.js', 'VdearTape');

/* ------------------------------- cấu hình ------------------------------- */

const SYMBOLS = (process.env.SYMBOLS || 'BTCUSDT,ETHUSDT')
  .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const PORT = Number(process.env.PORT || 8080);
const REST = process.env.BINANCE_FAPI_BASE || 'https://fapi.binance.com';
const WS_BASE = 'wss://fstream.binance.com/stream?streams=';

// Tài liệu: tối đa 1024 luồng mỗi kết nối. Giữ xa trần.
const MAX_STREAMS = 100;
const BACKOFF_BASE = 1000;
const BACKOFF_MAX = 30000;

// Không nghe tin gì quá ngần này thì coi như treo và báo 503 để bộ giám sát
// khởi động lại. Trả 200 mù quáng thì một tiến trình treo sẽ treo mãi mãi.
const DEAD_MS = 3 * 60 * 1000;

const state = {
  startedAt: Date.now(),
  lastMessageAt: null,
  messages: 0,
  reconnects: 0,
  writeErrors: 0,
  writes: 0,
  tapes: new Map(),
};

function log(...a) { console.log(new Date().toISOString(), ...a); }

/* --------------------------------- ghi ---------------------------------- */

/*
 * Ghi qua PostgREST. Thay hàm này nếu nối thẳng Postgres.
 *
 * `on_conflict` + Prefer: resolution=merge-duplicates để nạp lại cùng một đoạn
 * dữ liệu là vô hại — bù sau khi mất kết nối chắc chắn sẽ chồng lấn.
 */
async function write(table, rows, conflictCols) {
  if (!rows.length) return;
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!base || !key) return;         // chưa cấu hình thì chạy khô, không ném
  const url = base.replace(/\/$/, '') + '/rest/v1/' + table
    + (conflictCols ? '?on_conflict=' + conflictCols : '');
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: key, Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows),
    });
    if (!r.ok) { state.writeErrors++; log('ghi hỏng', table, r.status); return; }
    state.writes += rows.length;
  } catch (e) {
    state.writeErrors++;
    log('ghi hỏng', table, String(e && e.message));
  }
}

/* ------------------------------ bù lịch sử ------------------------------ */

async function backfillCandles(symbol, limit = 1000) {
  const url = `${REST}/fapi/v1/klines?symbol=${symbol}&interval=1m&limit=${limit}`;
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const rows = await r.json();
    if (!Array.isArray(rows)) return 0;
    // Bỏ nến CUỐI vì nó chưa đóng. Ghi một cây nến chưa đóng rồi không cập
    // nhật lại là để một giá trị sai nằm vĩnh viễn trong kho.
    const closed = rows.slice(0, -1);
    await write('candles_1m', closed.map((k) => ({
      symbol, venue: 'binance',
      bucket: new Date(k[0]).toISOString(),
      open: k[1], high: k[2], low: k[3], close: k[4],
      volume: k[5], quote_volume: k[7], trades: k[8],
    })), 'symbol,venue,bucket');
    return closed.length;
  } catch (e) {
    log('bù nến hỏng', symbol, String(e && e.message));
    return 0;
  }
}

/* ------------------------------ luồng thật ------------------------------ */

function tapeFor(symbol) {
  if (!state.tapes.has(symbol)) {
    state.tapes.set(symbol, Tape.createTape({ tickSize: 0.01, maxBuckets: 240 }));
  }
  return state.tapes.get(symbol);
}

let ws = null, attempt = 0, timer = null;

function connect() {
  const syms = SYMBOLS.slice(0, MAX_STREAMS);
  const url = WS_BASE + syms.map((s) => s.toLowerCase() + '@aggTrade').join('/');
  log('nối', syms.length, 'luồng');

  // WebSocket là API toàn cục từ Node 22, không cần thư viện.
  ws = new WebSocket(url);

  ws.onopen = () => { attempt = 0; log('đã nối'); };
  ws.onmessage = (ev) => {
    let d;
    try { d = JSON.parse(ev.data); } catch { return; }
    const t = d && d.data;
    if (!t || t.e !== 'aggTrade') return;
    state.messages++;
    state.lastMessageAt = Date.now();
    tapeFor(String(t.s).toUpperCase()).push(t);
  };
  ws.onerror = () => { /* onclose chạy ngay sau */ };
  ws.onclose = () => {
    state.reconnects++;
    const wait = Math.min(BACKOFF_MAX, BACKOFF_BASE * 2 ** attempt) * (0.7 + Math.random() * 0.6);
    attempt++;
    log('mất kết nối, chờ', Math.round(wait), 'ms');
    clearTimeout(timer);
    timer = setTimeout(connect, wait);
  };
}

/* ------------------------- xả bucket xuống kho -------------------------- */

/*
 * Mỗi phút, ghi những bucket ĐÃ ĐÓNG. Bucket của phút hiện tại còn đang nhận
 * lệnh nên chưa ghi — ghi rồi mà không cập nhật lại là để một con số dở dang
 * nằm trong kho.
 */
async function flush() {
  const now = Date.now();
  const cutoff = Math.floor(now / 60000) * 60000;
  for (const [symbol, tape] of state.tapes) {
    const done = tape.all().filter((b) => b.t < cutoff && !b._written);
    if (!done.length) continue;
    await write('tape_1m', done.map((b) => ({
      symbol,
      bucket: new Date(b.t).toISOString(),
      buy_volume: b.buyVol, sell_volume: b.sellVol,
      buy_quote: b.buyQuote, sell_quote: b.sellQuote,
      trades: b.trades,
      first_agg_id: b.firstId, last_agg_id: b.lastId,
      levels: b.levels, price_step: b.step,
    })), 'symbol,bucket');
    done.forEach((b) => { b._written = true; });
  }
}

async function writeMetrics() {
  const lag = state.lastMessageAt ? Date.now() - state.lastMessageAt : null;
  await write('metrics', [
    { metric: 'ws_messages', venue: 'binance', value: state.messages },
    { metric: 'ws_reconnects', venue: 'binance', value: state.reconnects },
    { metric: 'ws_lag_ms', venue: 'binance', value: lag },
    { metric: 'write_errors', value: state.writeErrors },
    { metric: 'rows_written', value: state.writes },
  ]);
}

/* ------------------------------ sức khoẻ -------------------------------- */

http.createServer((req, res) => {
  if (req.url !== '/healthz') { res.statusCode = 404; res.end(); return; }
  const lag = state.lastMessageAt ? Date.now() - state.lastMessageAt : null;
  // Chưa từng nhận tin nào sau khi đã chạy quá DEAD_MS cũng là treo.
  const dead = lag == null
    ? (Date.now() - state.startedAt > DEAD_MS)
    : lag > DEAD_MS;
  res.statusCode = dead ? 503 : 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    ok: !dead,
    uptimeMs: Date.now() - state.startedAt,
    lagMs: lag, messages: state.messages,
    reconnects: state.reconnects, writeErrors: state.writeErrors,
    symbols: SYMBOLS.length,
  }));
}).listen(PORT, () => log('sức khoẻ ở cổng', PORT));

/* ------------------------------- khởi động ------------------------------ */

(async () => {
  for (const s of SYMBOLS) {
    const n = await backfillCandles(s);
    log('bù', s, n, 'nến');
  }
  connect();
  setInterval(() => { flush().catch((e) => log('xả hỏng', String(e && e.message))); }, 60000);
  setInterval(() => { writeMetrics().catch(() => {}); }, 60000);
})();
