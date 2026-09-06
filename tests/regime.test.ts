/**
 * CHẾ ĐỘ THỊ TRƯỜNG — legacy-static/js/regime.js
 *
 * Bốn thứ đáng kiểm, vì cả bốn đều cho ra một con số trông hợp lý khi làm sai:
 *
 *   1. ADX phải dùng làm trơn Wilder. Trung bình cộng cho ra đường ADX khác
 *      hẳn nên ngưỡng 25/20 mất ý nghĩa — mà nhìn biểu đồ thì không thấy.
 *   2. Percentile phải tính trên cửa sổ trượt kết thúc tại nến đang xét. Tính
 *      trên toàn chuỗi là NHÌN TRỘM TƯƠNG LAI, và mọi winrate dựng trên đó đều
 *      đẹp giả tạo.
 *   3. "Giữ 3 nến liên tiếp" khác "nhãn phổ biến nhất trong 3 nến".
 *   4. Mẫu dưới 30 thì không được công bố winrate.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SRC = fs.readFileSync(
  path.join(process.cwd(), 'legacy-static/js/regime.js'), 'utf8');

function load() {
  const self_: Record<string, unknown> = {};
  const ctx: Record<string, unknown> = { self: self_, Math, Number, Object, Array, JSON };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return self_.VdearRegime as any;
}
const R = load();

type C = { time: number; open: number; high: number; low: number; close: number; volume: number };
const bar = (i: number, o: number, h: number, l: number, c: number): C =>
  ({ time: i, open: o, high: h, low: l, close: c, volume: 100 });

/*
 * Bộ sinh nến. Phải ra OHLC HỢP LỆ: low ≤ open,close ≤ high. Bản đầu của bài
 * kiểm này đặt close nằm dưới low, thế là True Range phình lên và mọi nhãn đều
 * thành "biến động cao" — bài kiểm hỏng vì bộ sinh sai, không phải module sai.
 */
function mk(i: number, open: number, close: number, rng: number): C {
  const hi = Math.max(open, close) + rng;
  const lo = Math.min(open, close) - rng;
  return bar(i, open, hi, lo, close);
}
/*
 * Xu hướng dựng theo BƯỚC NHÂN (phần trăm), không phải bước cộng. Với bước
 * cộng, một chuỗi giảm từ 300 về 100 có biên độ tuyệt đối không đổi nhưng
 * ATR/giá TĂNG dần một cách máy móc, nên nến cuối luôn vượt p85 và mọi thứ đều
 * bị dán nhãn "biến động cao". Thị trường thật biến động theo phần trăm.
 */
function upTrend(n: number, stepPct = 1, rngPct = 0.4): C[] {
  const out: C[] = [];
  let base = 100;
  for (let i = 0; i < n; i++) {
    const close = base * (1 + stepPct / 100 * 0.8);
    out.push(mk(i, base, close, base * rngPct / 100));
    base = base * (1 + stepPct / 100);
  }
  return out;
}
function downTrend(n: number, stepPct = 1, rngPct = 0.4): C[] {
  const out: C[] = [];
  let base = 100 * Math.pow(1 + stepPct / 100, n);
  for (let i = 0; i < n; i++) {
    const close = base * (1 - stepPct / 100 * 0.8);
    out.push(mk(i, base, close, base * rngPct / 100));
    base = base * (1 - stepPct / 100);
  }
  return out;
}
/** Đi ngang, biên độ rất hẹp. */
function flat(n: number, rngPct = 0.15, level = 100): C[] {
  const out: C[] = [];
  const rng = level * rngPct / 100;
  for (let i = 0; i < n; i++) {
    const o = level + (i % 2 ? rng : -rng) * 0.4;
    out.push(mk(i, o, level, rng));
  }
  return out;
}

/* ------------------------------ RMA ----------------------------------- */

test('RMA đúng công thức Wilder, KHÁC trung bình cộng', () => {
  const v = [1, 2, 3, 4, 5, 6];
  const r = R.rma(v, 3);
  assert.equal(r[0], null);
  assert.equal(r[1], null);
  assert.equal(r[2], 2, 'giá trị đầu là trung bình cộng 3 phần tử đầu');
  // rma[3] = (2*2 + 4)/3 = 2.666…  còn trung bình cộng 3 phần tử cuối là 3
  assert.ok(Math.abs(r[3] - 8 / 3) < 1e-12);
  assert.notEqual(r[3], 3, 'nếu ra đúng 3 thì đang dùng trung bình cộng');
});

test('RMA thiếu dữ liệu trả null, không trả 0', () => {
  assert.deepEqual(R.rma([1, 2], 5).join(','), [null, null].join(','));
  assert.equal(R.rma([], 3).length, 0);
});

/* ------------------------------ ADX ------------------------------------ */

test('ADX cao và +DI vượt −DI trong xu hướng tăng', () => {
  const c = upTrend(120);
  const a = R.adxSeries(c, 14);
  const i = c.length - 1;
  assert.ok(a.adx[i] > 25, `ADX = ${a.adx[i]}`);
  assert.ok(a.plusDI[i] > a.minusDI[i]);
});

test('ADX cao và −DI vượt +DI trong xu hướng giảm', () => {
  const c = downTrend(120);
  const a = R.adxSeries(c, 14);
  const i = c.length - 1;
  assert.ok(a.adx[i] > 25);
  assert.ok(a.minusDI[i] > a.plusDI[i]);
});

test('ADX thấp khi giá đi ngang — đối chứng với hai bài trên', () => {
  const c = flat(120);
  const a = R.adxSeries(c, 14);
  assert.ok(a.adx[c.length - 1] < 25,
    `đi ngang mà ADX = ${a.adx[c.length - 1]} thì luật ADX>25 vô nghĩa`);
});

test('chuỗi quá ngắn thì ADX toàn null, không trả 0', () => {
  const a = R.adxSeries(upTrend(10), 14);
  assert.ok(a.adx.every((v: number | null) => v === null));
});

/* -------------------------- BB width / ATR ----------------------------- */

test('độ rộng Bollinger nhỏ khi giá nén, lớn khi giá giãn', () => {
  const hep = R.bbWidthSeries(flat(60).map((c) => c.close), 20, 2);
  const rong = R.bbWidthSeries(upTrend(60, 4).map((c) => c.close), 20, 2);
  assert.ok(hep[59] < rong[59], `${hep[59]} phải nhỏ hơn ${rong[59]}`);
});

test('ATR quy về % giá nên so sánh được giữa các coin giá khác nhau', () => {
  // Cùng biên độ TƯƠNG ĐỐI, giá gấp 1000 lần -> ATR% phải xấp xỉ bằng nhau.
  const re = (mul: number) => {
    const out: C[] = [];
    for (let i = 0; i < 60; i++) {
      const b = 100 * mul;
      out.push(bar(i, b, b * 1.01, b * 0.99, b));
    }
    return out;
  };
  const a = R.atrPctSeries(re(1), 14)[59];
  const b = R.atrPctSeries(re(1000), 14)[59];
  assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
});

/* --------------------------- percentile -------------------------------- */

test('PERCENTILE TRÊN CỬA SỔ TRƯỢT — không được nhìn tương lai', () => {
  // Chuỗi tăng dần: mỗi phần tử là lớn nhất TÍNH TỚI nó -> luôn ở top.
  const s = Array.from({ length: 100 }, (_, i) => i);
  const r = R.rankPct(s, 50, 40);
  assert.ok(r > 95, `phần tử lớn nhất trong cửa sổ phải ở gần 100, đang là ${r}`);
  // Đối chứng: nếu xếp hạng trên TOÀN chuỗi thì phần tử thứ 50 chỉ ở ~50%.
  const toanChuoi = s.filter((x) => x < s[50]).length / (s.length - 1) * 100;
  assert.ok(toanChuoi < 55,
    'nhìn cả tương lai thì cùng phần tử đó chỉ ở giữa bảng — đó là lỗi ta đang tránh');
});

test('không đủ mẫu trong cửa sổ thì trả null, không đoán bừa', () => {
  const s = [1, 2, 3];
  assert.equal(R.rankPct(s, 2, 100), null);
});

/* ---------------------------- phân loại -------------------------------- */

function classifyLast(candles: C[], opts?: Record<string, unknown>) {
  return R.current(candles, opts);
}

test('xu hướng tăng rõ ràng được xếp là trend_up', () => {
  const r = classifyLast(upTrend(200));
  assert.equal(r.key, 'trend_up');
  assert.ok(r.adx > 25);
  assert.ok(r.bars >= 1);
});

test('xu hướng giảm rõ ràng được xếp là trend_down', () => {
  assert.equal(classifyLast(downTrend(200)).key, 'trend_down');
});

test('XU HƯỚNG GIẢM DÀI KHÔNG ĐƯỢC TỰ BIẾN THÀNH "biến động cao"', () => {
  // Đây là một lỗi thật đã sửa: làm trơn ATR TUYỆT ĐỐI rồi mới chia cho giá
  // hiện tại thì trong một chuỗi giảm, tỉ số cứ tăng đều một cách máy móc và
  // nến nào cũng vượt p85.
  const c = downTrend(300, 1, 0.4);
  const atr = R.atrPctSeries(c, 14);
  const dau = atr[60], cuoi = atr[299];
  assert.ok(Math.abs(cuoi - dau) / dau < 0.05,
    `ATR% phải gần như không đổi khi biến động tương đối không đổi: ${dau} -> ${cuoi}`);
  assert.equal(classifyLast(c).key, 'trend_down');
});

test('đi ngang biên độ nén được xếp là range', () => {
  // 150 nến giãn để cửa sổ xếp hạng có cái so, rồi 200 nến nén để ADX kịp tụt
  // dưới 20 — ADX làm trơn Wilder nên nó nguội rất chậm sau một xu hướng mạnh.
  const up = upTrend(150, 3, 2);
  const level = up[up.length - 1].close;
  const c = up.concat(flat(200, 0.08, level).map((x, i) => ({ ...x, time: 150 + i })));
  const r = classifyLast(c);
  assert.equal(r.key, 'range', `ADX=${r.adx}, xếp hạng BB=${r.bbRank}`);
  assert.ok(r.adx < 20);
});

test('BIẾN ĐỘNG CAO ĐÈ LÊN nhãn xu hướng', () => {
  // Xu hướng tăng đều rồi 10 nến biên độ gấp 20 lần.
  const c = upTrend(180, 1, 0.4);
  for (let i = 0; i < 10; i++) {
    const b = c[c.length - 1].close;
    c.push(mk(180 + i, b, b * 1.005, b * 0.09));
  }
  const r = classifyLast(c);
  assert.equal(r.key, 'volatile', 'ATR vượt p85 phải đè lên trend_up');
  // đối chứng: bỏ 10 nến đó đi thì nhãn quay lại trend_up
  assert.equal(classifyLast(upTrend(180, 1, 0.4)).key, 'trend_up');
});

test('chưa xếp được thì GIỮ nhãn cũ, không gán bừa một nhãn mặc định', () => {
  const s = R.regimeSeries(upTrend(60), {});
  // 20 nến đầu chưa đủ dữ liệu -> null, không phải 'range'
  assert.equal(s.regime[5], null);
  assert.ok(s.regime.slice(0, 20).every((v: string | null) => v === null || v === undefined));
});

/* ---------------------------- làm mượt --------------------------------- */

test('NHÃN CHỈ ĐỔI KHI GIỮ ĐỦ 3 NẾN LIÊN TIẾP', () => {
  const up = upTrend(200);
  const withConfirm = R.regimeSeries(up, { confirmBars: 3 });
  const noConfirm = R.regimeSeries(up, { confirmBars: 1 });
  const count = (a: (string | null)[]) => {
    let n = 0;
    for (let i = 1; i < a.length; i++) if (a[i] !== a[i - 1]) n++;
    return n;
  };
  assert.ok(count(withConfirm.regime) <= count(noConfirm.regime),
    'làm mượt không được làm nhãn nhảy NHIỀU hơn');
});

test('NHÃN MỚI PHẢI CHỜ ĐÚNG 3 NẾN, không đổi ngay ở nến đầu tiên', () => {
  // Kiểm thẳng vào luật làm mượt: tìm nến ĐẦU TIÊN mà phân loại thô đổi ý, rồi
  // xem chuỗi đã làm mượt có đổi theo ngay không.
  //
  // (Không dùng "chèn một nến lạ" làm đối chứng: ATR làm trơn Wilder nên một
  //  nến biên độ lớn còn kéo ATR lên cao nhiều nến sau đó — nhãn thô đổi thật
  //  sự trong vài nến liên tiếp, và đó là hành vi đúng của ATR chứ không phải
  //  lỗi làm mượt.)
  const c = upTrend(180, 1, 0.4);
  for (let i = 0; i < 12; i++) {
    const b = c[c.length - 1].close;
    c.push(mk(180 + i, b, b * 1.005, b * 0.09));
  }
  const s3 = R.regimeSeries(c, { confirmBars: 3 });
  const s1 = R.regimeSeries(c, { confirmBars: 1 });

  const flip = s1.regime.findIndex((v: string | null, i: number) =>
    i > 0 && v === 'volatile' && s1.regime[i - 1] !== 'volatile');
  assert.ok(flip > 0, 'phải có một nến mà phân loại thô đổi sang volatile');

  assert.notEqual(s3.regime[flip], 'volatile', 'nến đầu tiên chưa được đổi');
  assert.notEqual(s3.regime[flip + 1], 'volatile', 'nến thứ hai vẫn chưa');
  assert.equal(s3.regime[flip + 2], 'volatile', 'đủ ba nến liên tiếp thì mới đổi');
});

/* --------------------------- ma trận winrate --------------------------- */

const trades = (n: number, strategy: string, regime: string, winEvery: number) =>
  Array.from({ length: n }, (_, i) => ({
    strategy, regime, win: i % winEvery === 0, r: i % winEvery === 0 ? 2 : -1,
  }));

test('DƯỚI 30 MẪU THÌ KHÔNG CÔNG BỐ WINRATE', () => {
  const m = R.matrix(trades(29, 'combat', 'trend_up', 2));
  const c = R.cell(m, 'combat', 'trend_up');
  assert.equal(c.trades, 29);
  assert.equal(c.enough, false);
  assert.equal(c.winRate, null, 'mẫu nhỏ phải là null, không phải một con số mờ đi');
  assert.equal(c.expectancyR, null);
  assert.equal(c.need, 30);
});

test('đủ 30 mẫu thì công bố — đối chứng của bài trên', () => {
  const m = R.matrix(trades(30, 'combat', 'trend_up', 2));
  const c = R.cell(m, 'combat', 'trend_up');
  assert.equal(c.enough, true);
  assert.equal(Math.round(c.winRate), 50);
});

test('kỳ vọng tính bằng R, không bằng tiền', () => {
  // 40 lệnh, thắng 1/4 (+2R), thua 3/4 (−1R) -> kỳ vọng = 0.25*2 − 0.75*1 = −0.25R
  const m = R.matrix(trades(40, 'combat', 'range', 4));
  const c = R.cell(m, 'combat', 'range');
  assert.ok(Math.abs(c.expectancyR - (-0.25)) < 1e-9, `đang là ${c.expectancyR}`);
});

test('lệnh không có chế độ (null) bị BỎ, không gom vào ô nào', () => {
  const m = R.matrix([
    { strategy: 'combat', regime: null, win: true, r: 2 },
    { strategy: 'combat', regime: 'trend_up', win: true, r: 2 },
  ]);
  assert.equal(R.cell(m, 'combat', 'trend_up').trades, 1);
  assert.equal(Object.keys(m.cells).length, 1);
});

test('ma trận liệt kê chế độ theo thứ tự cố định, không theo thứ tự gặp', () => {
  const m = R.matrix([
    { strategy: 'a', regime: 'volatile', win: true, r: 2 },
    { strategy: 'a', regime: 'trend_up', win: false, r: -1 },
  ]);
  assert.equal(m.regimes.join(','), 'trend_up,volatile');
});
