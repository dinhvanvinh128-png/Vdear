/**
 * NHẬT KÝ LỆNH — phần tính toán của legacy-static/js/journal.js
 *
 * Trọng tâm: R phải đúng, và phần "bài học" phải IM LẶNG khi chưa đủ bằng
 * chứng. Một kết luận nghe sâu sắc mà rỗng còn tệ hơn không có kết luận nào,
 * nên hầu hết bài dưới đây kiểm chuyện KHÔNG kết luận.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SRC = fs.readFileSync(path.join(process.cwd(), 'legacy-static/js/journal.js'), 'utf8');

function load() {
  const store: Record<string, string> = {};
  const win: Record<string, unknown> = {};
  const ctx: Record<string, unknown> = {
    window: win, Date, Math, Number, JSON, Object, Array, String, RegExp,
    localStorage: {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return win.VdearJournal as any;
}

type T = Record<string, unknown>;
let seq = 0;
const trade = (o: T = {}): T => ({
  id: 'x' + (++seq), at: 1700000000000 + seq * 60000, coin: 'BTC', side: 'LONG',
  entry: 100, tp: 120, sl: 90, status: 'open', ...o,
});
// Lệnh đã đóng ở một mức R cho trước (entry 100, sl 90 -> 1R = 10 giá)
const closedAt = (r: number, o: T = {}): T => trade({
  status: 'closed', closedAt: 1700000900000 + (++seq) * 60000,
  closePrice: 100 + r * 10, ...o,
});

/* ------------------------------- R ------------------------------------ */

test('R = lãi chia cho khoảng cách entry–stop', () => {
  const J = load();
  assert.equal(J.rOf(closedAt(2)), 2);
  assert.equal(J.rOf(closedAt(-1)), -1);
  assert.equal(J.rOf(closedAt(0.5)), 0.5);
});

test('SHORT tính ngược chiều', () => {
  const J = load();
  // entry 100, sl 110 -> 1R = 10; đóng ở 80 tức lãi 20 = +2R
  const t = trade({ side: 'SHORT', sl: 110, tp: 80, status: 'closed', closePrice: 80 });
  assert.equal(J.rOf(t), 2);
  const t2 = trade({ side: 'SHORT', sl: 110, tp: 80, status: 'closed', closePrice: 110 });
  assert.equal(J.rOf(t2), -1);
});

test('không có stop-loss thì KHÔNG có R, và không lấy đại mẫu số khác', () => {
  const J = load();
  assert.equal(J.rOf(trade({ sl: null, status: 'closed', closePrice: 150 })), null);
  // entry trùng sl: rủi ro bằng 0, chia cho 0 phải ra null chứ không Infinity
  assert.equal(J.rOf(trade({ sl: 100, status: 'closed', closePrice: 150 })), null);
});

test('R:R theo kế hoạch tính từ entry/tp/sl, không phải từ kết quả', () => {
  const J = load();
  assert.equal(J.plannedRR(trade({ entry: 100, tp: 120, sl: 90 })), 2);
  assert.equal(J.plannedRR(trade({ entry: 100, tp: 105, sl: 90 })), 0.5);
});

/* ---------------------------- thống kê -------------------------------- */

test('chưa có lệnh nào đóng thì winrate là "chưa có", KHÔNG phải 0%', () => {
  const J = load();
  const s = J.stats([trade(), trade()]);
  assert.equal(s.winRate, null, '0% đọc ra là "thua sạch" — hoàn toàn khác');
  assert.equal(s.totalR, null);
  assert.equal(s.open, 2);
  assert.equal(s.closed, 0);
});

test('winrate, tổng R và R trung bình', () => {
  const J = load();
  const s = J.stats([closedAt(2), closedAt(-1), closedAt(3), closedAt(-1)]);
  assert.equal(s.closed, 4);
  assert.equal(s.wins, 2);
  assert.equal(s.losses, 2);
  assert.equal(s.winRate, 50);
  assert.equal(Math.round(s.totalR * 100) / 100, 3);
  assert.equal(Math.round(s.avgR * 100) / 100, 0.75);
});

test('lệnh còn mở không được tính vào winrate', () => {
  const J = load();
  const s = J.stats([closedAt(2), trade(), trade()]);
  assert.equal(s.closed, 1);
  assert.equal(s.winRate, 100);
  assert.equal(s.total, 3);
});

test('chuỗi thắng/thua dài nhất tính theo thứ tự ĐÓNG lệnh', () => {
  const J = load();
  // mở theo thứ tự A,B,C nhưng đóng theo thứ tự C,A,B
  const A = trade({ status: 'closed', closePrice: 120, at: 1, closedAt: 200 });   // +2R
  const B = trade({ status: 'closed', closePrice: 120, at: 2, closedAt: 300 });   // +2R
  const C = trade({ status: 'closed', closePrice: 90, at: 3, closedAt: 100 });    // -1R
  const s = J.stats([A, B, C]);
  assert.equal(s.bestStreak, 2, 'A rồi B đóng liền nhau sau C');
  assert.equal(s.worstStreak, 1);
});

test('đường vốn cộng dồn R và bắt đầu từ 0', () => {
  const J = load();
  const pts = J.equityCurve([closedAt(1), closedAt(-1), closedAt(2)]);
  assert.equal(pts[0].cum, 0);
  assert.equal(pts.length, 4);
  assert.equal(Math.round(pts[pts.length - 1].cum * 100) / 100, 2);
});

/* -------------------------- nhóm theo chiều --------------------------- */

test('nhóm theo coin, theo hướng và theo mức confluence', () => {
  const J = load();
  const list = [
    closedAt(2, { coin: 'BTC', side: 'LONG', confluence: 5 }),
    // closedAt() dựng giá đóng theo hướng LONG, nên giữ LONG ở đây. Đưa SHORT
    // vào mà vẫn dùng giá đó thì thành lệnh THẮNG (short từ 100 xuống 90).
    closedAt(-1, { coin: 'BTC', side: 'LONG', confluence: 0 }),
    closedAt(1, { coin: 'ETH', side: 'LONG', confluence: 4 }),
  ];
  const d = J.byDimension(list);
  const btc = d.coin.find((g: { key: string }) => g.key === 'BTC');
  assert.equal(btc.n, 2);
  assert.equal(btc.winRate, 50);
  const high = d.confluence.find((g: { key: string }) => g.key === 'high');
  assert.equal(high.n, 2);
  assert.equal(high.winRate, 100);
});

test('confluence gộp thành ba mức, không để rời 0..5', () => {
  const J = load();
  assert.equal(J.confBucket({ confluence: 0 }), 'low');
  assert.equal(J.confBucket({ confluence: 1 }), 'low');
  assert.equal(J.confBucket({ confluence: 3 }), 'mid');
  assert.equal(J.confBucket({ confluence: 5 }), 'high');
  assert.equal(J.confBucket({ confluence: null }), null);
});

/* ------------------------------ bài học ------------------------------- */

test('dưới 5 lệnh thua thì KHÔNG rút bài học nào', () => {
  const J = load();
  const list = [];
  for (let i = 0; i < 4; i++) list.push(closedAt(-1, { confluence: 0 }));
  const l = J.lessons(list);
  assert.equal(l.enough, false);
  assert.equal(l.items.length, 0, 'bốn lệnh thua thì mọi quy luật rút ra đều là ngẫu nhiên');
});

test('yếu tố chỉ thành bài học khi ĐẬM HƠN HẲN trong nhóm thua', () => {
  const J = load();
  // 6 thua confluence thấp + 6 thắng confluence thấp: yếu tố này phủ 100% số
  // lệnh thua, nhưng cũng phủ 100% toàn bộ lệnh -> KHÔNG phải phát hiện gì.
  const list = [];
  for (let i = 0; i < 6; i++) list.push(closedAt(-1, { confluence: 0 }));
  for (let i = 0; i < 6; i++) list.push(closedAt(2, { confluence: 0 }));
  const l = J.lessons(list);
  assert.equal(l.enough, true);
  assert.equal(l.items.length, 0,
    '"70% lệnh thua là LONG" khi 70% lệnh vốn đã là LONG thì không nói lên điều gì');
});

test('yếu tố thật sự lệch thì ĐƯỢC nêu, kèm số lệnh', () => {
  const J = load();
  const list = [];
  for (let i = 0; i < 6; i++) list.push(closedAt(-1, { confluence: 0 }));   // thua, conf thấp
  for (let i = 0; i < 10; i++) list.push(closedAt(2, { confluence: 5 }));   // thắng, conf cao
  const l = J.lessons(list);
  assert.equal(l.enough, true);
  const low = l.items.find((it: { key: string }) => it.key === 'journal.lesson.lowConf');
  assert.ok(low, 'confluence thấp phủ 100% lệnh thua nhưng chỉ 37.5% tổng số');
  assert.equal(low.lossCount, 6);
  assert.equal(low.lossTotal, 6);
  assert.equal(Math.round(low.lossShare), 100);
  assert.equal(Math.round(low.allShare), 38);
});

test('nhiều nhất ba bài học, xếp theo mức lệch', () => {
  const J = load();
  const list = [];
  for (let i = 0; i < 8; i++) list.push(closedAt(-1, { confluence: 0, paMatch: false, leverage: 50, tp: 101 }));
  for (let i = 0; i < 12; i++) list.push(closedAt(2, { confluence: 5, paMatch: true, leverage: 3, tp: 130 }));
  const l = J.lessons(list);
  assert.ok(l.items.length <= 3);
  for (let i = 1; i < l.items.length; i++) {
    const a = l.items[i - 1], b = l.items[i];
    assert.ok((a.lossShare - a.allShare) >= (b.lossShare - b.allShare));
  }
});

/* -------------------------------- CSV --------------------------------- */

test('CSV bọc ô có dấu phẩy và nháy kép trong ghi chú', () => {
  const J = load();
  const csv = J.toCSV([trade({ note: 'vào sớm, chưa "xác nhận"' })]);
  const line = csv.split('\r\n')[1];
  assert.ok(line.includes('"vào sớm, chưa ""xác nhận"""'),
    'không bọc thì lệch cột từ dòng đó trở đi');
});

test('CSV có cột r đã tính sẵn và thời gian dạng ISO', () => {
  const J = load();
  const csv = J.toCSV([closedAt(2)]);
  const head = csv.split('\r\n')[0].split(',');
  assert.ok(head.includes('r'));
  const row = csv.split('\r\n')[1].split(',');
  assert.equal(row[head.indexOf('r')], '2.0000');
  assert.match(row[head.indexOf('at')], /^\d{4}-\d{2}-\d{2}T/);
});

/* --------------------------- chạm TP / SL ----------------------------- */

test('LONG chạm TP và chạm SL', () => {
  const J = load();
  const t = trade({ entry: 100, tp: 120, sl: 90 });
  assert.equal(J.hitOf(t, 121), 'tp');
  assert.equal(J.hitOf(t, 120), 'tp');
  assert.equal(J.hitOf(t, 89), 'sl');
  assert.equal(J.hitOf(t, 105), null);
});

test('SHORT chạm TP và chạm SL', () => {
  const J = load();
  const t = trade({ side: 'SHORT', entry: 100, tp: 80, sl: 110 });
  assert.equal(J.hitOf(t, 79), 'tp');
  assert.equal(J.hitOf(t, 111), 'sl');
  assert.equal(J.hitOf(t, 95), null);
});

test('lệnh đã đóng không bị đánh dấu lại', () => {
  const J = load();
  const t = trade({ status: 'tp', closePrice: 120 });
  assert.equal(J.hitOf(t, 89), null);
});

/* ------------------------ lưu trên máy người dùng --------------------- */

test('localStorage hỏng thì không ném lỗi, chỉ báo thất bại', () => {
  const J = load();
  // mảng dựng trong vm thuộc realm khác nên deepEqual so tham chiếu sẽ trượt
  assert.equal(J._local().length, 0);
  assert.equal(J._writeLocal([trade()]), true);
  assert.equal(J._local().length, 1);
});
