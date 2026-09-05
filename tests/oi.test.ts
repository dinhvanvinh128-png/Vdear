/**
 * OPEN INTEREST + LONG/SHORT — legacy-static/js/oi.js
 *
 * Đây là module trình duyệt, không phải module của lib/, nên bài kiểm nạp tệp
 * bằng vm với một `window` và một `fetch` giả. Cách này kiểm được đúng thứ dễ
 * hỏng nhất mà mắt không nhìn ra: bộ đệm, việc gộp request trùng, hạn mức IP,
 * và ngưỡng chết của phép phân loại giá/OI.
 *
 * Không có bài nào gọi ra mạng thật.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SRC = fs.readFileSync(
  path.join(process.cwd(), 'legacy-static/js/oi.js'), 'utf8');

type Call = { url: string };

function load(handler: (url: string) => unknown) {
  const calls: Call[] = [];
  const win: Record<string, unknown> = {};
  const ctx: Record<string, unknown> = {
    window: win,
    setTimeout, clearTimeout, Date, Math, Number, JSON, Promise, Error, Array, Object,
    AbortController,
    fetch: (url: string) => {
      calls.push({ url });
      const r = handler(url);
      if (r instanceof Error) return Promise.reject(r);
      if (r === undefined) return Promise.resolve({ ok: false, status: 400, json: async () => ({}) });
      return Promise.resolve({ ok: true, status: 200, json: async () => r });
    },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { OI: win.VdearOI as any, calls };
}

const histRow = (t: number, oi: number) => ({
  symbol: 'BTCUSDT', sumOpenInterest: String(oi),
  sumOpenInterestValue: String(oi * 100), timestamp: t,
});

/* ----------------------------- khung thời gian ------------------------- */

test('khung 1W và 1M bị từ chối vì Binance không có period đó', async () => {
  const { OI, calls } = load(() => []);
  assert.equal(OI.supports('4h'), true);
  assert.equal(OI.supports('1w'), false);
  assert.equal(OI.supports('1M'), false);
  // Quan trọng hơn: không được BẮN request rồi mới bỏ kết quả.
  assert.equal(await OI.hist('BTC', '1w'), null);
  assert.equal(await OI.ratio('BTC', 'top', '1M'), null);
  assert.equal(calls.length, 0);
});

test('khung 10h của trang quy về period 12h của nguồn', () => {
  const { OI } = load(() => []);
  assert.equal(OI.periodFor('10h'), '12h');
  assert.equal(OI.periodFor('2h'), '2h');
  assert.equal(OI.periodFor('3m'), null);
});

/* --------------------------------- đọc số ------------------------------ */

test('mọi số của Binance là CHUỖI và phải được ép sang số', async () => {
  const { OI } = load(() => [histRow(1000, 34085.5), histRow(2000, 34090)]);
  const a = await OI.hist('BTC', '4h');
  assert.equal(typeof a[0].oi, 'number');
  assert.equal(a[0].oi, 34085.5);
  assert.equal(a[0].value, 3408550);
});

test('dòng hỏng bị bỏ, không làm hỏng cả chuỗi', () => {
  const { OI } = load(() => []);
  const out = OI._rows([
    histRow(3000, 3),
    { symbol: 'X', sumOpenInterest: 'n/a', timestamp: 4000 },   // số không đọc được
    { symbol: 'X', sumOpenInterest: '5' },                       // thiếu timestamp
    histRow(1000, 1),
  ]);
  assert.equal(out.length, 2);
  // và trả về theo thứ tự thời gian TĂNG dần, không theo thứ tự nguồn trả.
  // So bằng chuỗi: mảng dựng trong vm thuộc realm khác nên deepEqual sẽ báo
  // "same structure but not reference-equal" dù nội dung đúng.
  assert.equal(out.map((r: { t: number }) => r.t).join(','), '1000,3000');
});

test('mảng rỗng hoặc phản hồi lạ trả null chứ không ném lỗi', () => {
  const { OI } = load(() => []);
  assert.equal(OI._rows([]), null);
  assert.equal(OI._rows(null), null);
  assert.equal(OI._rows({ error: 'nope' }), null);
  assert.equal(OI._lsRows([{ nonsense: 1 }]), null);
});

test('tỉ lệ long/short tính lại từ hai tỉ trọng, không tin longShortRatio', () => {
  const { OI } = load(() => []);
  const out = OI._lsRows([
    { longAccount: '0.6', shortAccount: '0.4', longShortRatio: '999', timestamp: 1 },
  ]);
  assert.equal(out[0].long, 0.6);
  assert.equal(out[0].short, 0.4);
  assert.equal(Math.round(out[0].ratio * 100) / 100, 1.5);   // 0.6/0.4, KHÔNG phải 999
});

/* --------------------------------- bộ đệm ------------------------------ */

test('hai lời gọi liên tiếp chỉ bắn MỘT request', async () => {
  const { OI, calls } = load(() => [histRow(1, 10)]);
  await OI.hist('BTC', '4h');
  await OI.hist('BTC', '4h');
  assert.equal(calls.length, 1);
});

test('nhiều lời gọi CÙNG LÚC được gộp làm một', async () => {
  const { OI, calls } = load(() => [histRow(1, 10)]);
  await Promise.all([
    OI.hist('BTC', '4h'), OI.hist('BTC', '4h'), OI.hist('BTC', '4h'),
  ]);
  assert.equal(calls.length, 1);
});

test('symbol khác nhau thì không dùng chung bộ đệm', async () => {
  const { OI, calls } = load(() => [histRow(1, 10)]);
  await OI.hist('BTC', '4h');
  await OI.hist('ETH', '4h');
  assert.equal(calls.length, 2);
});

test('coin không có futures: 400 -> null, và không hỏi lại ngay', async () => {
  const { OI, calls } = load(() => undefined);   // fetch trả 400
  assert.equal(await OI.current('NOPE'), null);
  assert.equal(await OI.current('NOPE'), null);
  assert.equal(calls.length, 1, 'null phải được đệm, nếu không sẽ tự phá hạn mức');
});

/* -------------------------------- hạn mức ------------------------------ */

test('vượt hạn mức thì từ chối ngay thay vì xếp hàng', async () => {
  const { OI, calls } = load(() => [histRow(1, 10)]);
  const start = OI.budget();
  assert.ok(start > 0 && start <= 1000);
  // đốt hết hạn mức bằng các symbol khác nhau (mỗi cái một request)
  const jobs = [];
  for (let i = 0; i < start + 20; i++) jobs.push(OI.hist('C' + i, '4h'));
  const res = await Promise.all(jobs);
  assert.equal(calls.length, start, 'không được gọi quá trần');
  assert.equal(OI.budget(), 0);
  assert.ok(res.filter((r) => r === null).length >= 20, 'phần dư phải trả null');
});

test('null do hết hạn mức KHÔNG bị đệm lại', async () => {
  const { OI, calls } = load(() => [histRow(1, 10)]);
  const start = OI.budget();
  for (let i = 0; i < start; i++) await OI.hist('C' + i, '4h');
  assert.equal(OI.budget(), 0);

  assert.equal(await OI.hist('LATE', '4h'), null);   // bị từ chối vì hết hạn mức
  const before = calls.length;
  OI._reset();                                      // hạn mức hồi lại
  const again = await OI.hist('LATE', '4h');
  assert.ok(again && again.length === 1, 'phải hỏi lại thật chứ không trả null đã đệm');
  assert.equal(calls.length, before + 1);
});

/* ------------------------- phân loại giá / OI -------------------------- */

const candles = (...closes: number[]) => closes.map((c) => ({ close: c }));
const series = (...ois: number[]) => ois.map((oi, i) => ({ t: i * 1000, oi, value: oi }));

test('giá lên + OI lên = tiền mới vào long', () => {
  const { OI } = load(() => []);
  const r = OI.classify(series(100, 110), candles(10, 11), 1);
  assert.equal(r.state, 'longsIn');
  assert.equal(Math.round(r.oiPct), 10);
  assert.equal(Math.round(r.pricePct), 10);
});

test('giá lên + OI xuống = short cover', () => {
  const { OI } = load(() => []);
  assert.equal(OI.classify(series(100, 90), candles(10, 11), 1).state, 'shortCover');
});

test('giá xuống + OI lên = tiền mới vào short', () => {
  const { OI } = load(() => []);
  assert.equal(OI.classify(series(100, 110), candles(11, 10), 1).state, 'shortsIn');
});

test('giá xuống + OI xuống = long thanh lý', () => {
  const { OI } = load(() => []);
  assert.equal(OI.classify(series(100, 90), candles(11, 10), 1).state, 'longsOut');
});

test('nhiễu nhỏ hơn ngưỡng chết KHÔNG được gán hướng', () => {
  const { OI } = load(() => []);
  // +0.02% giá, +0.02% OI: dưới ngưỡng 0.35% -> đi ngang, không phải "longsIn"
  const r = OI.classify(series(100, 100.02), candles(10, 10.002), 1);
  assert.equal(r.state, 'flat');
  // đối chứng: đẩy qua ngưỡng thì phải đổi kết luận, nếu không phép kiểm này
  // không đo được gì cả
  const r2 = OI.classify(series(100, 101), candles(10, 10.1), 1);
  assert.equal(r2.state, 'longsIn');
});

test('thiếu dữ liệu thì trả null chứ không đoán', () => {
  const { OI } = load(() => []);
  assert.equal(OI.classify(null, candles(1, 2), 1), null);
  assert.equal(OI.classify(series(1, 2), null, 1), null);
  assert.equal(OI.classify(series(1), candles(1), 1), null);
  // OI bằng 0 ở mốc đầu: chia cho 0 phải ra null, không ra Infinity
  assert.equal(OI.classify(series(0, 5), candles(1, 2), 1), null);
});

test('mỗi trạng thái có một khoá i18n riêng, không trùng nhau', () => {
  const { OI } = load(() => []);
  const keys = ['longsIn', 'shortCover', 'shortsIn', 'longsOut', 'flat'].map((s) => OI.stateKey(s));
  assert.equal(new Set(keys).size, 5);
  assert.equal(OI.stateKey('không-tồn-tại'), OI.stateKey('flat'));
});

/* ------------------------------- symbol -------------------------------- */

test('symbol dựng đúng từ base, không nhân đôi USDT', () => {
  const { OI } = load(() => []);
  assert.equal(OI.symbolOf('BTC'), 'BTCUSDT');
  assert.equal(OI.symbolOf('btc'), 'BTCUSDT');
  assert.equal(OI.symbolOf('BTCUSDT'), 'BTCUSDT');
  assert.equal(OI.symbolOf('BTC-USDT'), 'BTCUSDT');
});
