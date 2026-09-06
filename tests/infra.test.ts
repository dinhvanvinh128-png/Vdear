/**
 * HẠ TẦNG — legacy-static/js/incremental.js · js/signal-version.js
 *
 * Hai module này bảo vệ hai thứ dễ hỏng âm thầm nhất của một hệ tín hiệu:
 *
 *   1. Chỉ báo cập nhật bằng công thức truy hồi TRÔI dần khỏi giá trị tính lại
 *      từ đầu. Trôi thì chắc chắn trôi — vấn đề là có ĐO không. Không đo thì
 *      ngày nó trôi đủ xa để đổi một tín hiệu, không ai biết.
 *
 *   2. Đổi logic tín hiệu làm mọi winrate lịch sử nói về một chiến lược không
 *      còn tồn tại. Bản mới phải chạy ngầm và KHÔNG BAO GIỜ hiện ra cho tới
 *      khi có người cố ý chuyển.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function load(file: string, key: string) {
  const self_: Record<string, unknown> = {};
  const ctx: Record<string, unknown> = { self: self_, Math, Number, Object, Array, JSON, Date };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(
    path.join(process.cwd(), 'legacy-static/js', file), 'utf8'), ctx);
  return self_[key];
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const I = load('incremental.js', 'VdearIncremental') as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const S = load('signal-version.js', 'VdearSignalVersion') as any;

/* ===================== chỉ báo tăng dần ============================== */

type C = { time: number; open: number; high: number; low: number; close: number; volume: number };
function walk(n: number, seed = 7): C[] {
  let s = seed, p = 100;
  const out: C[] = [];
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const r = s / 0x7fffffff;
    const o = p;
    p = p * (1 + (r - 0.5) * 0.03);
    out.push({
      time: i, open: o, close: p,
      high: Math.max(o, p) * 1.002, low: Math.min(o, p) * 0.998, volume: 100,
    });
  }
  return out;
}

test('EMA truy hồi KHỚP với tính lại từ đầu', () => {
  const c = walk(400);
  const closes = c.map((x) => x.close);
  let st = I.emaInit(closes.slice(0, 100), 20);
  for (let i = 100; i < closes.length; i++) st = I.emaStep(st, closes[i]);
  const full = I.emaInit(closes, 20);
  const d = I.drift(st.ema, full.ema);
  assert.ok(d.ok, `sai số tương đối ${d.relative}`);
});

test('RSI truy hồi KHỚP với tính lại từ đầu', () => {
  const c = walk(400, 11);
  const closes = c.map((x) => x.close);
  let st = I.rsiInit(closes.slice(0, 100), 14);
  for (let i = 100; i < closes.length; i++) st = I.rsiStep(st, closes[i]);
  const full = I.rsiInit(closes, 14);
  const d = I.drift(I.rsiValue(st), I.rsiValue(full));
  assert.ok(d.ok, `sai số tương đối ${d.relative}`);
});

test('ATR truy hồi KHỚP với tính lại từ đầu', () => {
  const c = walk(400, 23);
  let st = I.atrInit(c.slice(0, 100), 14);
  for (let i = 100; i < c.length; i++) st = I.atrStep(st, c[i]);
  const full = I.atrInit(c, 14);
  const d = I.drift(st.atr, full.atr);
  assert.ok(d.ok, `sai số tương đối ${d.relative}`);
});

test('PHÉP ĐO TRÔI SỐ THẬT SỰ PHÁT HIỆN ĐƯỢC SAI LỆCH', () => {
  // Đối chứng: nếu không thì mọi bài trên chỉ đang khẳng định "hai số bằng
  // nhau" mà không biết phép đo có nhạy hay không.
  const d = I.drift(100, 100.0001);
  assert.equal(d.ok, false);
  assert.equal(d.action, 'reseed', 'vượt ngưỡng thì phải gieo lại, không dùng tiếp');
  assert.ok(d.relative > 1e-7);
});

test('sai số TƯƠNG ĐỐI, không tuyệt đối', () => {
  // Cùng một sai số TUYỆT ĐỐI 0,01, hai thang giá khác nhau, hai kết luận khác
  // nhau — và đó mới là điều đúng. Ngưỡng truyền vào tường minh để bài kiểm
  // nói về phép chia, không nói về giá trị mặc định.
  const TOL = 1e-6;
  const lon = I.drift(100000, 100000.01, TOL);
  const nho = I.drift(0.02, 0.03, TOL);
  // Cả hai đều là 0,01 — sai lệch còn lại chỉ là làm tròn của dấu phẩy động.
  assert.ok(Math.abs(lon.absolute - nho.absolute) < 1e-9, 'cùng sai số tuyệt đối');
  assert.equal(lon.ok, true, 'lệch 0,01 trên 100.000 là một phần mười triệu');
  assert.equal(nho.ok, false, 'lệch 0,01 trên 0,03 là lệch một phần ba');
  assert.ok(nho.relative > lon.relative * 1e6);
});

test('ngưỡng mặc định RẤT chặt — cố ý, để nó là dây báo động sớm', () => {
  // 1e-9 chặt hơn mức đủ để đổi một tín hiệu rất nhiều. Đó là chủ ý: dây báo
  // động phải kêu trước khi có hậu quả, không phải sau.
  assert.equal(I.DRIFT_TOLERANCE, 1e-9);
  assert.equal(I.drift(100000, 100000.01).ok, false,
    'ở ngưỡng mặc định thì ngay cả một phần mười triệu cũng phải kêu');
});

test('drift thiếu một vế thì báo missing, không coi là khớp', () => {
  const d = I.drift(null, 5);
  assert.equal(d.ok, false);
  assert.equal(d.reason, 'missing');
});

test('báo cáo trôi số chạy cả ba chỉ báo và nói rõ số bước', () => {
  const r = I.driftReport(walk(500, 31), { warmup: 120, period: 14 });
  assert.equal(r.enough, true);
  assert.equal(r.steps, 380);
  assert.ok(r.rsi.ok && r.atr.ok && r.ema20.ok,
    `rsi ${r.rsi.relative} atr ${r.atr.relative} ema ${r.ema20.relative}`);
});

test('chuỗi quá ngắn thì báo chưa đủ, không trả một báo cáo rỗng', () => {
  const r = I.driftReport(walk(50), { warmup: 100 });
  assert.equal(r.enough, false);
  assert.ok(r.need > r.have);
});

test('RSI với avgLoss = 0 trả 100, KHÔNG chia cho 0', () => {
  const up = Array.from({ length: 60 }, (_, i) => 100 + i);   // chỉ tăng
  const st = I.rsiInit(up, 14);
  assert.equal(I.rsiValue(st), 100);
  assert.ok(Number.isFinite(I.rsiValue(st)), 'NaN sẽ lặng lẽ biến mất khỏi biểu đồ');
});

test('khởi tạo EMA phải GIỐNG bản tính lại, nếu không sẽ lệch mãi mãi', () => {
  const closes = walk(300, 5).map((c) => c.close);
  // Khởi tạo trên 100 phần tử đầu rồi đẩy tiếp, so với khởi tạo trên toàn bộ.
  let st = I.emaInit(closes.slice(0, 100), 20);
  for (let i = 100; i < closes.length; i++) st = I.emaStep(st, closes[i]);
  const full = I.emaInit(closes, 20);
  // Sai số phải ở mức làm tròn, không phải một hằng số lệch.
  assert.ok(Math.abs(st.ema - full.ema) / full.ema < 1e-12,
    `lệch ${Math.abs(st.ema - full.ema)} — khởi tạo hai bên không giống nhau`);
});

/* ================== phiên bản tín hiệu / chạy ngầm ==================== */

function reg() {
  const r = S.createRegistry();
  r.register('v1', (x: number) => ({ side: x > 0 ? 'LONG' : 'SHORT', score: x }));
  r.register('v2', (x: number) => ({ side: x > 5 ? 'LONG' : 'SHORT', score: x * 2 }));
  return r;
}

test('bản đầu tiên đăng ký trở thành bản đang hiện', () => {
  const r = reg();
  assert.equal(r.active(), 'v1');
  assert.equal(r.shadow(), null);
});

test('BẢN CHẠY NGẦM KHÔNG BAO GIỜ LÀ THỨ HIỆN RA', () => {
  const r = reg();
  r.setShadow('v2');
  const out = r.run(3);
  assert.equal(out.version, 'v1');
  assert.equal(r.visible(out).score, 3, 'thứ hiện ra phải là kết quả của v1');
  assert.equal(out.shadow.score, 6, 'v2 vẫn chạy và vẫn ghi lại');
  assert.notEqual(r.visible(out).score, out.shadow.score);
});

test('không thể vừa hiện vừa chạy ngầm cùng một bản', () => {
  const r = reg();
  assert.equal(r.setShadow('v1'), false, 'v1 đang hiện thì không được đặt làm bản ngầm');
  r.setShadow('v2');
  r.setActive('v2');
  assert.equal(r.shadow(), null, 'chuyển v2 lên hiện thì nó phải thôi chạy ngầm');
});

test('BẢN NGẦM HỎNG KHÔNG ĐƯỢC LÀM HỎNG BẢN ĐANG HIỆN', () => {
  const r = S.createRegistry();
  r.register('v1', () => ({ side: 'LONG', score: 1 }));
  r.register('bad', () => { throw new Error('vỡ'); });
  r.setShadow('bad');
  const out = r.run(1);
  assert.equal(r.visible(out).side, 'LONG');
  assert.equal(out.shadow, null);
  assert.equal(out.errors.length, 1, 'lỗi phải được ghi lại, không nuốt im lặng');
});

/* ---------------------------- so hai bản ------------------------------ */

function recs(version: string, n: number, winEvery: number, spanMs: number, shadow = false) {
  const t0 = Date.now() - spanMs;
  return Array.from({ length: n }, (_, i) => {
    const r = S.record(version, { side: 'LONG', confluence: 3, score: 60 }, {
      at: t0 + Math.floor((i / Math.max(1, n - 1)) * spanMs), coin: 'BTC', tf: '4h', shadow,
    });
    r.outcome = i % winEvery === 0 ? 'win' : 'loss';
    r.r = i % winEvery === 0 ? 2 : -1;
    return r;
  });
}

test('CHƯA ĐỦ MẪU THÌ KHÔNG CÔNG BỐ CHÊNH LỆCH', () => {
  const all = recs('v1', 10, 2, 20 * 864e5).concat(recs('v2', 10, 3, 20 * 864e5));
  const c = S.compare(all, 'v1', 'v2');
  assert.equal(c.enoughSample, false);
  assert.equal(c.readyToCompare, false);
  assert.equal(c.winRateDelta, null, 'chưa đủ mẫu mà đưa ra con số là mời người ta đọc nhầm');
});

test('CHƯA ĐỦ HAI TUẦN THÌ CŨNG KHÔNG CÔNG BỐ', () => {
  const all = recs('v1', 60, 2, 3 * 864e5).concat(recs('v2', 60, 3, 3 * 864e5));
  const c = S.compare(all, 'v1', 'v2');
  assert.equal(c.enoughSample, true);
  assert.equal(c.enoughTime, false, 'ba ngày không phải hai tuần');
  assert.equal(c.readyToCompare, false);
  assert.equal(c.winRateDelta, null);
});

test('đủ mẫu VÀ đủ thời gian thì mới so, và chỉ là "đủ điều kiện cân nhắc"', () => {
  const all = recs('v1', 60, 4, 20 * 864e5).concat(recs('v2', 60, 2, 20 * 864e5));
  const c = S.compare(all, 'v1', 'v2');
  assert.equal(c.readyToCompare, true);
  assert.equal(Math.round(c.a.winRate), 25);
  assert.equal(Math.round(c.b.winRate), 50);
  assert.ok(c.winRateDelta > 20);
  // Module KHÔNG có hàm nào tự chuyển bản.
  assert.equal(typeof (S as Record<string, unknown>).autoPromote, 'undefined',
    'chuyển bản phải là hành động có chủ ý của con người');
});

test('BẢN GHI CHƯA CÓ KẾT QUẢ BỊ LOẠI KHỎI PHÉP SO', () => {
  const a = recs('v1', 40, 2, 20 * 864e5);
  const b = recs('v2', 40, 2, 20 * 864e5);
  // 30 bản ghi của v2 chưa dứt
  for (let i = 0; i < 30; i++) { b[i].outcome = null; b[i].r = null; }
  const c = S.compare(a.concat(b), 'v1', 'v2');
  assert.equal(c.a.trades, 40);
  assert.equal(c.b.trades, 10, 'chỉ đếm bản ghi đã dứt');
  assert.equal(c.enoughSample, false, 'và vì thế chưa đủ mẫu để so');
});

test('bản ghi mang đúng version và cờ shadow', () => {
  const r = S.record('v2', { side: 'SHORT', confluence: 4, score: 20 },
    { coin: 'ETH', tf: '1h', shadow: true, at: 1000 });
  assert.equal(r.version, 'v2');
  assert.equal(r.shadow, true);
  assert.equal(r.coin, 'ETH');
  assert.equal(r.outcome, null, 'chưa biết kết quả KHÁC với thua');
  assert.equal(r.r, null);
});

/* ================= vỏ bọc phản hồi API và quan trắc =================== */

import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E = require_(path.join(process.cwd(), 'api/_envelope.js')) as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const H = (require_(path.join(process.cwd(), 'api/health.js')) as any)._pure;

test('vỏ bọc tính đúng tuổi dữ liệu', () => {
  const now = 1_700_000_000_000;
  const w = E.wrap({ generatedAt: new Date(now - 90_000).toISOString() },
    { now, maxAgeSeconds: 300 });
  assert.equal(w.ageSeconds, 90);
  assert.equal(w.stale, false);
  assert.equal(w.unknownAge, false);
});

test('quá ngưỡng thì bật cờ stale', () => {
  const now = 1_700_000_000_000;
  const w = E.wrap({ generatedAt: new Date(now - 600_000).toISOString() },
    { now, maxAgeSeconds: 300 });
  assert.equal(w.ageSeconds, 600);
  assert.equal(w.stale, true);
});

test('THIẾU generatedAt THÌ COI LÀ CŨ, không tự đặt là bây giờ', () => {
  const w = E.wrap({ ok: true }, { now: 1_700_000_000_000, maxAgeSeconds: 300 });
  assert.equal(w.ageSeconds, null);
  assert.equal(w.unknownAge, true);
  assert.equal(w.stale, true,
    '"không biết tuổi" phải nghiêng về thận trọng — phía kia là hiện số cũ như số mới');
});

test('vỏ bọc giữ nguyên payload gốc, không nuốt trường nào', () => {
  const w = E.wrap({ ok: true, rows: [1, 2, 3], generatedAt: new Date().toISOString() }, {});
  assert.equal(w.ok, true);
  assert.equal(w.rows.length, 3);
});

test('sàn ngừng cập nhật quá 5 phút bị xếp là DOWN', () => {
  const now = 1_700_000_000_000;
  const s = H.summarize(
    [{ id: 'binance', ok: false, latencyMs: 10, error: 'timeout' }],
    { binance: now - 10 * 60000 }, now, H.STALE_MS);
  assert.equal(s.sources[0].state, 'down');
  assert.equal(s.healthy, false);
  assert.equal(s.down, 1);
});

test('vừa hỏng một lát thì là DEGRADED, chưa phải chết', () => {
  const now = 1_700_000_000_000;
  const s = H.summarize(
    [{ id: 'okx', ok: false, latencyMs: 10, error: 'HTTP 500' }],
    { okx: now - 60000 }, now, H.STALE_MS);
  assert.equal(s.sources[0].state, 'degraded');
  assert.equal(s.down, 0);
});

test('CHƯA TỪNG THẤY SÀN THÌ LÀ "unknown", KHÔNG PHẢI "chết"', () => {
  const now = 1_700_000_000_000;
  const s = H.summarize([{ id: 'bybit', ok: false, latencyMs: 10, error: 'timeout' }], {}, now);
  assert.equal(s.sources[0].state, 'unknown');
  assert.equal(s.down, 0);
  assert.equal(s.unknown, 1);
  assert.equal(s.healthy, true, 'chưa biết thì không được kết luận là hỏng');
});

test('tỉ lệ lỗi tính trên số nguồn đã đo', () => {
  const now = 1_700_000_000_000;
  const s = H.summarize([
    { id: 'a', ok: true, latencyMs: 1 }, { id: 'b', ok: false, latencyMs: 1 },
    { id: 'c', ok: true, latencyMs: 1 }, { id: 'd', ok: true, latencyMs: 1 },
  ], {}, now);
  assert.equal(s.errorRate, 0.25);
});
