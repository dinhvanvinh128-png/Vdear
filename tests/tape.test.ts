/**
 * TẦNG DỮ LIỆU THEO LỆNH KHỚP + CVD + VOLUME PROFILE
 * legacy-static/js/tape.js · js/cvd.js · js/vp.js
 *
 * Năm chỗ mà làm sai vẫn ra một biểu đồ đẹp:
 *
 *   1. Đảo chiều taker buy/sell. CVD vẫn vẽ ra một đường mượt, chỉ là NGƯỢC
 *      DẤU hoàn toàn. Không nhìn ra bằng mắt.
 *   2. Khử trùng theo thời gian thay vì theo aggTradeId. Nhiều lệnh khớp trong
 *      cùng một mili giây là bình thường, lọc theo thời gian ăn mất lệnh thật.
 *   3. Gộp khung mà không lượng tử hoá lại các mức giá. Hình vẫn ra, POC lệch.
 *      4. Phân kỳ so hai điểm cuối thay vì dùng pivot: chuỗi nào cũng "có phân kỳ".
 *   5. Trộn profile dựng từ nến (xấp xỉ) với profile dựng từ lệnh khớp (thật).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function load() {
  const self_: Record<string, unknown> = {};
  const ctx: Record<string, unknown> = { self: self_, Math, Number, Object, Array, JSON };
  vm.createContext(ctx);
  for (const f of ['tape.js', 'cvd.js', 'vp.js']) {
    vm.runInContext(fs.readFileSync(
      path.join(process.cwd(), 'legacy-static/js', f), 'utf8'), ctx);
  }
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T: self_.VdearTape as any, C: self_.VdearCVD as any, V: self_.VdearVP as any,
  };
}
const { T, C, V } = load();

const trade = (a: number, p: number, q: number, ms: number, m: boolean) =>
  ({ a, p: String(p), q: String(q), T: ms, m });

/* ======================= chiều mua/bán chủ động ======================== */

test('m = true nghĩa là BÁN chủ động, m = false là MUA chủ động', () => {
  assert.equal(T.isTakerBuy({ m: false }), true, 'người bán là maker -> lệnh thị trường là MUA');
  assert.equal(T.isTakerBuy({ m: true }), false, 'người mua là maker -> lệnh thị trường là BÁN');
});

test('ĐẢO CHIỀU MUA/BÁN LÀM CVD NGƯỢC DẤU HOÀN TOÀN', () => {
  const tape = T.createTape({ tickSize: 0.1 });
  // 3 lệnh mua chủ động, 1 lệnh bán chủ động
  tape.push(trade(1, 100, 3, 60000, false));
  tape.push(trade(2, 100, 1, 60000, true));
  const b = tape.all()[0];
  assert.equal(b.buyVol, 3);
  assert.equal(b.sellVol, 1);
  assert.equal(T.delta(b), 2);
  // Nếu đảo chiều thì delta ra −2: cùng độ lớn, ngược dấu, đồ thị nhìn y hệt.
  assert.equal(-T.delta(b), -2);
});

/* ============================ bước giá ================================= */

test('bước giá suy từ tick size, không gõ cứng', () => {
  // BTC tick 0,1 và một coin tick 0,0000001 phải ra hai bước khác nhau
  const btc = T.priceStep(0.1, 500, 600);
  const memes = T.priceStep(0.0000001, 0.0005, 600);
  assert.ok(btc >= 0.1);
  assert.ok(memes < 0.001);
  assert.ok(btc / memes > 100);
});

test('bước giá bị nới cho tới khi số mức nằm dưới trần', () => {
  const step = T.priceStep(0.01, 10000, 600);
  assert.ok(10000 / step <= 600, `${10000 / step} mức là quá nhiều`);
  // đối chứng: dùng thẳng tick 0,01 sẽ ra một triệu mức
  assert.ok(10000 / 0.01 > 600 * 1000);
});

test('bước giá luôn là 1 / 2 / 5 nhân luỹ thừa 10 của tick', () => {
  const step = T.priceStep(0.1, 5000, 600);
  const ratio = step / 0.1;
  const exp = Math.round(Math.log10(ratio));
  const mant = ratio / Math.pow(10, exp);
  assert.ok([1, 2, 5].some((m) => Math.abs(mant - m) < 1e-9)
    || [1, 2, 5].some((m) => Math.abs(ratio / Math.pow(10, exp - 1) - m) < 1e-9),
  `bước ${step} không phải một con số đọc được`);
});

test('lượng tử hoá cho hai giá trong cùng ô ra CÙNG một khoá', () => {
  assert.equal(T.quantize(100.04, 0.1), T.quantize(100.09, 0.1));
  assert.notEqual(T.quantize(100.04, 0.1), T.quantize(100.11, 0.1));
});

test('tick size thiếu thì trả null, không lấy đại một bước', () => {
  assert.equal(T.priceStep(null, 100, 600), null);
  assert.equal(T.priceStep(0, 100, 600), null);
  assert.equal(T.quantize(100, 0), null);
});

/* ========================== delta dẫn xuất ============================= */

test('delta và tổng khối lượng là SỐ DẪN XUẤT, không lưu trong bucket', () => {
  const b = T._newBucket(0);
  b.buyVol = 7; b.sellVol = 3;
  assert.equal(T.delta(b), 4);
  assert.equal(T.totalVol(b), 10);
  assert.ok(!('delta' in b), 'lưu delta riêng thì sớm muộn nó lệch khỏi buy − sell');
  assert.ok(!('totalVol' in b));
});

test('VWAP của bucket tính từ khối lượng quy USDT thật', () => {
  const tape = T.createTape({ tickSize: 0.1 });
  tape.push(trade(1, 100, 1, 0, false));
  tape.push(trade(2, 200, 3, 0, false));
  // (100·1 + 200·3) / 4 = 175
  assert.equal(T.vwap(tape.all()[0]), 175);
});

/* ============================ khử trùng ================================ */

test('KHỬ TRÙNG THEO aggTradeId, không theo thời gian', () => {
  const tape = T.createTape({ tickSize: 0.1 });
  // Ba lệnh KHÁC NHAU trong CÙNG một mili giây — chuyện bình thường.
  assert.equal(tape.push(trade(1, 100, 1, 60000, false)), true);
  assert.equal(tape.push(trade(2, 100, 1, 60000, false)), true);
  assert.equal(tape.push(trade(3, 100, 1, 60000, false)), true);
  assert.equal(tape.all()[0].buyVol, 3, 'lọc theo thời gian sẽ chỉ giữ 1 và ăn mất 2 lệnh thật');
  // Lệnh TRÙNG id thì mới bị bỏ.
  assert.equal(tape.push(trade(2, 100, 1, 60000, false)), false);
  assert.equal(tape.all()[0].buyVol, 3);
  assert.equal(tape.stats().droppedDuplicates, 1);
});

test('số lệnh bị bỏ được ĐẾM, không bỏ im lặng', () => {
  const tape = T.createTape({ tickSize: 0.1 });
  tape.push(trade(1, 100, 1, 0, false));
  tape.push(trade(1, 100, 1, 0, false));
  tape.push(trade(1, 100, 1, 0, false));
  assert.equal(tape.stats().droppedDuplicates, 2);
});

test('dữ liệu hỏng bị bỏ và không tạo bucket rỗng', () => {
  const tape = T.createTape({ tickSize: 0.1 });
  assert.equal(tape.push({ a: 1, p: 'abc', q: '1', T: 0, m: false }), false);
  assert.equal(tape.push({ a: 2, p: '100', q: '0', T: 0, m: false }), false);
  assert.equal(tape.all().length, 0);
});

/* ========================== thứ tự và trần bộ nhớ ====================== */

test('lệnh về MUỘN được chèn đúng chỗ, chuỗi vẫn tăng dần', () => {
  const tape = T.createTape({ tickSize: 0.1 });
  tape.push(trade(3, 100, 1, 180000, false));
  tape.push(trade(1, 100, 1, 60000, false));
  tape.push(trade(2, 100, 1, 120000, false));
  const ts = tape.all().map((b: { t: number }) => b.t);
  assert.equal(ts.join(','), '60000,120000,180000');
  assert.equal(tape.stats().outOfOrder, 2);
});

test('TRẦN BỘ NHỚ: bucket cũ tự bị dọn, không chờ ai gọi', () => {
  const tape = T.createTape({ tickSize: 0.1, maxBuckets: 5 });
  for (let i = 0; i < 20; i++) tape.push(trade(i, 100, 1, i * 60000, false));
  assert.equal(tape.all().length, 5);
  // Giữ lại 5 bucket MỚI NHẤT
  assert.equal(tape.all()[4].t, 19 * 60000);
  assert.equal(tape.stats().buckets, 5);
});

/* ============================== gộp khung ============================== */

function tapeOf(prices: number[], tick = 0.1) {
  const tape = T.createTape({ tickSize: tick });
  prices.forEach((p, i) => tape.push(trade(i, p, 1, i * 60000, false)));
  return tape;
}

test('gộp khung cộng đúng khối lượng và giữ đúng OHLC', () => {
  const tape = tapeOf([100, 105, 95, 102, 108, 99]);
  const g = T.rollup(tape.all(), 60 * 60000, { tickSize: 0.1 });
  assert.equal(g.length, 1);
  assert.equal(g[0].buyVol, 6);
  assert.equal(g[0].open, 100);
  assert.equal(g[0].high, 108);
  assert.equal(g[0].low, 95);
  assert.equal(g[0].close, 99);
});

test('GỘP KHUNG LƯỢNG TỬ HOÁ LẠI MỨC GIÁ, không cộng thẳng', () => {
  // Dải giá rộng nên khung lớn phải có bước giá THÔ HƠN từng bucket 1 phút.
  const prices: number[] = [];
  for (let i = 0; i < 60; i++) prices.push(1000 + i * 7.3);
  const tape = tapeOf(prices, 0.1);
  const g = T.rollup(tape.all(), 60 * 60000, { tickSize: 0.1, maxLevels: 20 });

  const levels = Object.keys(g[0].levels).length;
  assert.ok(levels <= 20, `gộp xong còn ${levels} mức, trần là 20`);

  // Tổng khối lượng phải BẢO TOÀN qua phép lượng tử hoá lại.
  const sum = Object.values(g[0].levels).reduce((a: number, b) => a + (b as number), 0);
  assert.ok(Math.abs(sum - 60) < 1e-9, `tổng ${sum} phải bằng 60`);

  // Đối chứng: cộng thẳng map của 60 bucket sẽ giữ nguyên độ mịn 1 phút.
  const tho: Record<string, number> = {};
  tape.all().forEach((b: { levels: Record<string, number> }) => {
    for (const k of Object.keys(b.levels)) tho[k] = (tho[k] || 0) + b.levels[k];
  });
  assert.ok(Object.keys(tho).length > levels,
    'cộng thẳng cho ra nhiều mức hơn hẳn — đó chính là lỗi ta đang tránh');
});

test('gộp khung chia đúng nhóm theo mốc thời gian', () => {
  const tape = T.createTape({ tickSize: 0.1 });
  tape.push(trade(1, 100, 1, 0, false));
  tape.push(trade(2, 100, 1, 59 * 60000, false));
  tape.push(trade(3, 100, 1, 61 * 60000, false));
  const g = T.rollup(tape.all(), 60 * 60000, { tickSize: 0.1 });
  assert.equal(g.length, 2);
  assert.equal(g[0].buyVol, 2);
  assert.equal(g[1].buyVol, 1);
});

/* ============================== bù dữ liệu ============================= */

test('mất kết nối ngắn thì bù toàn bộ', () => {
  const p = T.backfillPlan(1000, 1000 + 60000, 15 * 60000);
  assert.equal(p.needed, true);
  assert.equal(p.partial, false);
  assert.equal(p.startMs, 1000);
});

test('MẤT KẾT NỐI QUÁ LÂU: bù phần gần nhất và ĐÁNH DẤU thiếu', () => {
  const now = 1000 + 10 * 3600 * 1000;
  const p = T.backfillPlan(1000, now, 15 * 60000);
  assert.equal(p.partial, true, 'phải bật cờ, không im lặng nối liền hai đầu');
  assert.equal(p.startMs, now - 15 * 60000);
  assert.ok(p.gapMs > 15 * 60000);
});

test('không mất kết nối thì không cần bù', () => {
  assert.equal(T.backfillPlan(1000, 1000).needed, false);
  assert.equal(T.backfillPlan(null, 5000).needed, false);
});

/* ================================= CVD ================================= */

const bucketsOf = (deltas: Array<[number, number]>) =>
  deltas.map(([buy, sell], i) => ({ t: i * 60000, buyVol: buy, sellVol: sell }));

test('CVD cộng dồn đúng và nhớ điểm bắt đầu', () => {
  const s = C.series(bucketsOf([[3, 1], [1, 2], [5, 0]]));
  assert.equal(s.rows.map((r: { cvd: number }) => r.cvd).join(','), '2,1,6');
  assert.equal(s.startedAt, 0);
  assert.equal(s.last, 6);
  assert.equal(s.absoluteMeaningless, true,
    'mức tuyệt đối của CVD phụ thuộc điểm bắt đầu nên vô nghĩa — module phải nói ra');
});

test('bucket thiếu dữ liệu tạo CHỖ NGẮT, không bị coi là delta 0', () => {
  const s = C.series([
    { t: 0, buyVol: 3, sellVol: 1 },
    { t: 60000, buyVol: null, sellVol: null },
    { t: 120000, buyVol: 1, sellVol: 0 },
  ]);
  assert.equal(s.rows[1].gap, true);
  assert.equal(s.rows[1].cvd, null,
    'coi là 0 sẽ vẽ ra một đoạn đi ngang trông như thị trường cân bằng');
  assert.equal(s.rows[2].cvd, 3, 'cộng dồn tiếp tục từ giá trị trước chỗ ngắt');
});

/* ================================ pivot ================================ */

test('pivot phải NHÔ HẲN ra, bằng nhau thì không tính', () => {
  const v = [1, 2, 3, 2, 1];
  assert.equal(C.pivots(v, 2, 2).highs.length, 1);
  const phang = [1, 3, 3, 3, 1];
  assert.equal(C.pivots(phang, 2, 2).highs.length, 0,
    'đoạn đi ngang mà cho phép bằng sẽ sinh ra hàng loạt pivot giả');
});

test('pivot không bao giờ xuất hiện ở `right` nến cuối — đó là giới hạn thật', () => {
  const v = [5, 1, 2, 3, 9];
  const p = C.pivots(v, 2, 2);
  assert.ok(p.highs.every((h: { i: number }) => h.i <= v.length - 1 - 2));
});

/* ============================== phân kỳ ================================ */

function makeSeries(n: number, priceFn: (i: number) => number, cvdFn: (i: number) => number) {
  const candles = [];
  const rows = [];
  for (let i = 0; i < n; i++) {
    const p = priceFn(i);
    candles.push({ time: i, open: p, high: p + 1, low: p - 1, close: p, volume: 10 });
    rows.push({ t: i, cvd: cvdFn(i), delta: 0, gap: false });
  }
  return { candles, rows };
}

test('PHÂN KỲ TĂNG: giá đáy thấp hơn, CVD đáy cao hơn', () => {
  // Hai đáy giá: sâu hơn ở lần sau; CVD ngược lại.
  const price = (i: number) => (i === 10 ? 80 : i === 30 ? 70 : 100);
  const cvd = (i: number) => (i === 10 ? -50 : i === 30 ? -20 : 0);
  const { candles, rows } = makeSeries(45, price, cvd);
  const r = C.detect(candles, rows, { left: 3, right: 3, minBars: 5, maxBars: 60 });
  const bull = r.divergences.filter((d: { type: string }) => d.type === 'bullish');
  assert.equal(bull.length, 1);
  assert.equal(bull[0].fromIdx, 10);
  assert.equal(bull[0].toIdx, 30);
});

test('PHÂN KỲ GIẢM: giá đỉnh cao hơn, CVD đỉnh thấp hơn', () => {
  const price = (i: number) => (i === 10 ? 120 : i === 30 ? 130 : 100);
  const cvd = (i: number) => (i === 10 ? 50 : i === 30 ? 20 : 0);
  const { candles, rows } = makeSeries(45, price, cvd);
  const r = C.detect(candles, rows, { left: 3, right: 3, minBars: 5, maxBars: 60 });
  const bear = r.divergences.filter((d: { type: string }) => d.type === 'bearish');
  assert.equal(bear.length, 1);
  assert.equal(bear[0].fromIdx, 10);
});

test('GIÁ VÀ CVD CÙNG CHIỀU THÌ KHÔNG CÓ PHÂN KỲ', () => {
  const price = (i: number) => (i === 10 ? 80 : i === 30 ? 70 : 100);
  const cvd = (i: number) => (i === 10 ? -20 : i === 30 ? -50 : 0);  // CVD cũng thấp hơn
  const { candles, rows } = makeSeries(45, price, cvd);
  const r = C.detect(candles, rows, { left: 3, right: 3 });
  assert.equal(r.divergences.length, 0);
});

test('hai pivot quá xa nhau KHÔNG được ghép thành phân kỳ', () => {
  const price = (i: number) => (i === 10 ? 80 : i === 200 ? 70 : 100);
  const cvd = (i: number) => (i === 10 ? -50 : i === 200 ? -20 : 0);
  const { candles, rows } = makeSeries(220, price, cvd);
  const gan = C.detect(candles, rows, { left: 3, right: 3, maxBars: 300 });
  const xa = C.detect(candles, rows, { left: 3, right: 3, maxBars: 60 });
  assert.equal(gan.divergences.length, 1);
  assert.equal(xa.divergences.length, 0,
    'hai đáy cách nhau 190 nến là hai sự kiện rời rạc, không phải một phân kỳ');
});

test('chuỗi quá ngắn thì nói CHƯA ĐỦ, không trả mảng rỗng như một kết luận', () => {
  const { candles, rows } = makeSeries(10, () => 100, () => 0);
  const r = C.detect(candles, rows);
  assert.equal(r.enough, false);
  assert.equal(r.need, 20);
});

/* =========================== VOLUME PROFILE ============================ */

test('POC là mức giá có khối lượng lớn nhất', () => {
  const p = V._build({ 100: 5, 101: 30, 102: 7 }, 1, 42, 'tape');
  assert.equal(p.poc, 101);
  assert.equal(p.pocVol, 30);
});

test('Value Area gom đúng 70% khối lượng quanh POC', () => {
  const bins: Record<number, number> = {};
  for (let i = 0; i < 21; i++) bins[100 + i] = i === 10 ? 100 : 5;
  const total = 100 + 20 * 5;
  const p = V._build(bins, 1, total, 'tape');
  assert.equal(p.poc, 110);
  assert.ok(p.vaShare >= 0.70, `mới gom được ${p.vaShare}`);
  // Không được gom quá tay: 70% của 200 là 140, POC đã 100 nên chỉ cần thêm ~8 ô
  assert.ok(p.vah - p.val <= 12, `vùng giá trị rộng ${p.vah - p.val}, quá nhiều`);
  assert.ok(p.val <= p.poc && p.poc <= p.vah);
});

test('Value Area lan về phía ĐÔNG HƠN trước', () => {
  // Phía trên POC đông hơn hẳn phía dưới. Vùng giá trị phải lan LÊN, và không
  // lan xuống chút nào cho tới khi đủ 70%.
  const bins: Record<number, number> = {
    96: 1, 97: 1, 98: 1, 99: 1, 100: 50, 101: 20, 102: 20, 103: 20, 104: 1,
  };
  const total = Object.values(bins).reduce((a, b) => a + b, 0);   // 115, cần 80.5
  const p = V._build(bins, 1, total, 'tape');
  assert.equal(p.poc, 100);
  assert.equal(p.val, 100, 'chưa cần lan xuống thì không được lan xuống');
  assert.equal(p.vah, 102, 'lan lên đúng hai bậc là đủ 70%');
  assert.ok(p.vaShare >= 0.70);
  // Đối chứng: nếu lan đều hai bên thì vùng sẽ là [98, 102] — rộng hơn và
  // gom cả những ô gần như không có giao dịch.
  assert.ok(p.vah - p.val < 4);
});

test('LVN là ô có giao dịch nhưng THƯA HẲN, có ngưỡng nói ra được', () => {
  const bins: Record<number, number> = { 100: 100, 101: 100, 102: 1, 103: 100 };
  const p = V._build(bins, 1, 301, 'tape');
  assert.ok(p.lvn.includes(102));
  assert.ok(!p.lvn.includes(100));
  assert.equal(p.lvnRatio, V.LVN_RATIO);
});

test('PROFILE TỪ NẾN PHẢI TỰ ĐÁNH DẤU LÀ XẤP XỈ', () => {
  const candles = [
    { high: 105, low: 95, volume: 100, close: 100 },
    { high: 103, low: 97, volume: 100, close: 100 },
  ];
  const p = V.fromCandles(candles, { buckets: 20 });
  assert.equal(p.source, 'candle');
  assert.equal(p.approximate, true,
    'rải đều khối lượng trên dải nến là xấp xỉ, không phải phép đo');
});

test('profile từ lệnh khớp KHÔNG bị đánh dấu xấp xỉ', () => {
  const tape = T.createTape({ tickSize: 1 });
  for (let i = 0; i < 30; i++) tape.push(trade(i, 100 + (i % 5), 1, i * 60000, i % 2 === 0));
  const p = V.fromTape(tape.all(), { tickSize: 1 });
  assert.equal(p.source, 'tape');
  assert.equal(p.approximate, false);
});

test('tổng khối lượng của profile bằng đúng tổng đưa vào', () => {
  const tape = T.createTape({ tickSize: 1 });
  for (let i = 0; i < 30; i++) tape.push(trade(i, 100 + (i % 7), 2, i * 60000, false));
  const p = V.fromTape(tape.all(), { tickSize: 1 });
  assert.ok(Math.abs(p.total - 60) < 1e-9, `tổng ${p.total} phải là 60`);
});

test('profile rỗng trả null, không trả một hình rỗng', () => {
  assert.equal(V.fromTape([], { tickSize: 1 }), null);
  assert.equal(V.fromCandles([], {}), null);
});

/* ==================== đối chiếu S&R với profile ======================== */

test('mức trùng POC được xếp là vùng ĐÔNG, có nêu nguồn', () => {
  const p = V._build({ 100: 5, 110: 50, 120: 5 }, 1, 60, 'tape');
  const r = V.classifyLevel(p, 110.2, 0.35);
  assert.equal(r.kind, 'hvn');
  assert.equal(r.at, 'poc');
  assert.equal(r.source, 'tape');
});

test('mức nằm trong vùng thưa được xếp là LVN', () => {
  const bins: Record<number, number> = { 100: 100, 101: 100, 102: 1, 103: 100 };
  const p = V._build(bins, 1, 301, 'tape');
  assert.equal(V.classifyLevel(p, 102, 0.35).kind, 'lvn');
});

test('mức không gần đâu cả trả null, không ép vào một nhóm', () => {
  const p = V._build({ 100: 5, 110: 50, 120: 5 }, 1, 60, 'tape');
  assert.equal(V.classifyLevel(p, 105, 0.1), null);
});

test('bán kính "trùng" là tham số, không phải cảm tính', () => {
  const p = V._build({ 100: 5, 110: 50, 120: 5 }, 1, 60, 'tape');
  assert.equal(V.classifyLevel(p, 110.5, 0.1), null, 'bán kính hẹp: không trùng');
  assert.ok(V.classifyLevel(p, 110.5, 1), 'bán kính rộng: trùng');
});

/* ================= bậc tin cậy từ Volume Profile ====================== */

test('BẬC TIN CẬY LÀ MỘT TRƯỜNG RIÊNG, KHÔNG CỘNG VÀO THANG HỘI TỤ', () => {
  const p = V._build({ 100: 5, 110: 50, 120: 5 }, 1, 60, 'tape');
  const r = V.confidenceTier(p, [110], 0.35);
  assert.equal(r.separateFromConfluence, true);
  assert.ok(!('confluence' in r),
    'cộng vào thang 5 điều kiện là âm thầm đổi ý nghĩa của mọi winrate lịch sử');
});

test('vùng S&R trùng POC nâng bậc tin cậy', () => {
  const p = V._build({ 100: 5, 110: 50, 120: 5 }, 1, 60, 'tape');
  const r = V.confidenceTier(p, [110], 0.35);
  assert.equal(r.tier, 1);
  assert.equal(r.hits[0].at, 'poc');
});

test('vùng S&R nằm trong LVN HẠ bậc tin cậy', () => {
  const bins: Record<number, number> = { 100: 100, 101: 100, 102: 1, 103: 100 };
  const p = V._build(bins, 1, 301, 'tape');
  const r = V.confidenceTier(p, [102], 0.35);
  assert.equal(r.tier, -1);
  assert.equal(r.hits[0].kind, 'lvn');
});

test('một vùng đông và một vùng thưa thì triệt tiêu, bậc về 0', () => {
  const bins: Record<number, number> = { 100: 100, 101: 100, 102: 1, 103: 100 };
  const p = V._build(bins, 1, 301, 'tape');
  const r = V.confidenceTier(p, [102, 100], 0.35);
  assert.equal(r.score, 0);
  assert.equal(r.tier, 0);
});

test('không có profile thì bậc 0 kèm lý do, không phải "không có tín hiệu"', () => {
  const r = V.confidenceTier(null, [100]);
  assert.equal(r.tier, 0);
  assert.equal(r.reason, 'no-data');
});

test('bậc tin cậy mang theo cờ xấp xỉ của nguồn', () => {
  const p = V.fromCandles([{ high: 105, low: 95, volume: 100 }], { buckets: 10 });
  const r = V.confidenceTier(p, [p.poc], 1);
  assert.equal(r.approximate, true,
    'bậc tin cậy dựng từ profile xấp xỉ phải nói ra là xấp xỉ');
});
