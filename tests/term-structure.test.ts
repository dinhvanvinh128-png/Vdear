/**
 * TERM STRUCTURE + BASIS + FUNDING GỘP — api/term-structure.js
 *
 * Phần đáng kiểm không phải "có gọi được API không" mà là bốn chỗ dễ ra một
 * con số trông hợp lý mà sai:
 *   · basis quy về năm khi sát ngày đáo hạn (chia cho số ngày tiến về 0),
 *   · cộng funding của sàn chu kỳ 4h với sàn chu kỳ 8h,
 *   · trọng số theo OI khi một sàn thiếu dữ liệu,
 *   · "cực đoan 3 ngày liên tục" so với "trung bình 3 ngày vượt ngưỡng".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P = (require(path.join(process.cwd(), 'api/term-structure.js')) as any)._pure;

/* ------------------------------ basis ---------------------------------- */

test('basis quy về năm theo đúng công thức (quý − perp)/perp × 365/ngày', () => {
  // quý 102.000, perp 100.000, còn 90 ngày -> 2% × 365/90 = 8.111%
  const v = P.annualizedBasisPct(102000, 100000, 90);
  assert.equal(Math.round(v * 1000) / 1000, 8.111);
});

test('contango và backwardation ra dấu ngược nhau', () => {
  assert.ok(P.annualizedBasisPct(101000, 100000, 30) > 0);
  assert.ok(P.annualizedBasisPct(99000, 100000, 30) < 0);
});

test('sát ngày đáo hạn KHÔNG được để 365/ngày nổ tung', () => {
  // 0.1 ngày còn lại: nếu không sàn thì 365/0.1 = 3650 lần
  const sanned = P.annualizedBasisPct(100100, 100000, 0.1);
  const tayCham = ((100100 - 100000) / 100000) * (365 / P.MIN_DAYS) * 100;
  assert.equal(Math.round(sanned * 100), Math.round(tayCham * 100),
    'phải bị sàn ở MIN_DAYS chứ không dùng 0.1');
  // đối chứng: không sàn thì con số lớn gấp năm lần
  const khongSan = ((100100 - 100000) / 100000) * (365 / 0.1) * 100;
  assert.ok(khongSan > sanned * 4);
});

test('perp bằng 0 hoặc thiếu giá thì trả null chứ không Infinity', () => {
  assert.equal(P.annualizedBasisPct(100, 0, 30), null);
  assert.equal(P.annualizedBasisPct(null, 100, 30), null);
  assert.equal(P.annualizedBasisPct(100, 100, null), null);
});

test('số ngày còn lại tính từ mốc thời gian của CHÍNH điểm dữ liệu', () => {
  const delivery = 1_700_000_000_000;
  const tenDaysBefore = delivery - 10 * 86400000;
  assert.equal(P.daysToDelivery(delivery, tenDaysBefore), 10);
  // điểm cũ hơn trong chuỗi lịch sử phải có nhiều ngày còn lại hơn
  const twentyDaysBefore = delivery - 20 * 86400000;
  assert.ok(P.daysToDelivery(delivery, twentyDaysBefore)
    > P.daysToDelivery(delivery, tenDaysBefore));
});

/* --------------------------- percentile -------------------------------- */

test('percentile nội suy, không nhảy bậc', () => {
  const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(P.percentile(a, 0), 1);
  assert.equal(P.percentile(a, 100), 10);
  assert.equal(P.percentile(a, 50), 5.5);
  // p90 và p93 phải KHÁC nhau — cách lấy "phần tử thứ p%" thô sẽ ra bằng nhau
  assert.notEqual(P.percentile(a, 90), P.percentile(a, 93));
});

test('percentile chịu được chuỗi rỗng và giá trị hỏng', () => {
  assert.equal(P.percentile([], 90), null);
  assert.equal(P.percentile(null, 90), null);
  assert.equal(P.percentile([1, NaN, 3, null as unknown as number], 50), 2);
});

/* ---------------------------- funding APR ------------------------------ */

test('funding quy về %/năm theo ĐÚNG chu kỳ của từng sàn', () => {
  // 0.01% mỗi 8h = 3 kỳ/ngày × 365 = 1095 kỳ/năm -> 10.95%/năm
  assert.equal(Math.round(P.fundingAprPct(0.0001, 8) * 100) / 100, 10.95);
  // cùng rate nhưng chu kỳ 4h thì gấp đôi
  assert.equal(Math.round(P.fundingAprPct(0.0001, 4) * 100) / 100, 21.9);
});

test('chu kỳ thiếu hoặc bằng 0 thì trả null, không chia cho 0', () => {
  assert.equal(P.fundingAprPct(0.0001, 0), null);
  assert.equal(P.fundingAprPct(0.0001, null), null);
  assert.equal(P.fundingAprPct(null, 8), null);
});

/* -------------------- trung bình có trọng số theo OI -------------------- */

const venue = (id: string, aprPct: number | null, oiUsd: number | null) =>
  ({ id, aprPct, oiUsd });

test('trọng số theo OI, không phải trung bình cộng', () => {
  const r = P.weightedFunding([
    venue('a', 10, 900),    // sàn lớn
    venue('b', 100, 100),   // sàn nhỏ, rate cực đoan
  ]);
  // trung bình cộng sẽ ra 55; theo trọng số phải ra 19
  assert.equal(Math.round(r.aprPct), 19);
  assert.equal(r.coverage, 1);
});

test('sàn thiếu dữ liệu bị LOẠI và trọng số chuẩn hoá lại', () => {
  const r = P.weightedFunding([
    venue('a', 10, 800),
    venue('b', null, 200),      // có OI, thiếu funding
  ]);
  assert.equal(r.aprPct, 10, 'sàn thiếu không được kéo con số về đâu cả');
  assert.equal(Math.round(r.coverage * 100), 80, 'độ phủ tính theo TIỀN, không theo số sàn');
  assert.deepEqual(r.used, ['a']);
  assert.equal(r.missing.length, 1);
  assert.equal(r.missing[0].id, 'b');
});

test('một sàn LỚN vắng mặt phải làm độ phủ tụt mạnh hơn một sàn nhỏ', () => {
  const thieuLon = P.weightedFunding([venue('a', 10, 100), venue('b', null, 900)]);
  const thieuNho = P.weightedFunding([venue('a', 10, 900), venue('b', null, 100)]);
  assert.ok(thieuLon.coverage < thieuNho.coverage);
  assert.equal(Math.round(thieuLon.coverage * 100), 10);
  assert.equal(Math.round(thieuNho.coverage * 100), 90);
});

test('không sàn nào dùng được thì trả null chứ không trả 0', () => {
  const r = P.weightedFunding([venue('a', null, 100), venue('b', 10, null)]);
  assert.equal(r.aprPct, null, '0%/năm là một phát biểu về thị trường; null là "không biết"');
});

/* ------------------------ funding cực đoan ----------------------------- */

const hist = (aprs: number[]) => aprs.map((aprPct, i) => ({ t: i * 8 * 3600000, aprPct }));

test('dưới 30 kỳ thì KHÔNG kết luận cực đoan', () => {
  const r = P.extremeFunding(hist(new Array(20).fill(5)), { percentile: 95, days: 3 });
  assert.equal(r.enough, false);
  assert.equal(r.need, 30);
});

test('cực đoan chỉ báo khi MỌI kỳ trong cửa sổ đều trên ngưỡng', () => {
  // 90 kỳ thấp, rồi 9 kỳ (3 ngày) rất cao
  const a = new Array(90).fill(2).concat(new Array(9).fill(80));
  const r = P.extremeFunding(hist(a), { percentile: 95, days: 3, intervalHours: 8 });
  assert.equal(r.enough, true);
  assert.equal(r.windowPeriods, 9);
  assert.equal(r.extreme, true);
  assert.equal(r.streakPeriods, 9);
  assert.equal(r.streakDays, 3);
});

test('một kỳ tụt xuống giữa cửa sổ là KHÔNG còn cực đoan', () => {
  const a = new Array(90).fill(2).concat([80, 80, 80, 2, 80, 80, 80, 80, 80]);
  const r = P.extremeFunding(hist(a), { percentile: 95, days: 3, intervalHours: 8 });
  assert.equal(r.extreme, false,
    '"trung bình 3 ngày vượt ngưỡng" là phát biểu khác và yếu hơn nhiều');
  assert.equal(r.streakPeriods, 5, 'chuỗi liên tiếp tính ngược từ cuối');
});

test('cửa sổ tính theo chu kỳ THẬT của sàn, không cố định 9 kỳ', () => {
  const a = new Array(200).fill(2);
  const r8 = P.extremeFunding(hist(a), { percentile: 95, days: 3, intervalHours: 8 });
  const r4 = P.extremeFunding(hist(a), { percentile: 95, days: 3, intervalHours: 4 });
  assert.equal(r8.windowPeriods, 9);
  assert.equal(r4.windowPeriods, 18, 'sàn 4h có gấp đôi số kỳ trong 3 ngày');
});
