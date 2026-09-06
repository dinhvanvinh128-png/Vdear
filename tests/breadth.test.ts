/**
 * ĐỘ RỘNG THỊ TRƯỜNG — api/breadth.js
 *
 * Ba chỗ dễ ra một con số trông hợp lý mà sai:
 *
 *   1. Coin chưa đủ 200 nến bị coi là "không nằm trên MA200". Như vậy là kéo
 *      tỉ lệ xuống bằng những coin ta KHÔNG BIẾT, và độ rộng trông xấu đi mỗi
 *      khi sàn niêm yết thêm coin mới.
 *   2. "Đỉnh 30 ngày" tính thiếu hoặc thừa chính nến đang xét.
 *   3. Phân kỳ: "giảm liên tiếp 5 ngày" khác "trung bình 5 ngày thấp hơn", và
 *      chỉ một vế BTC tăng thì chưa phải phân kỳ.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P = (require(path.join(process.cwd(), 'api/breadth.js')) as any)._pure;

/* ------------------------------- SMA ----------------------------------- */

test('SMA chưa đủ mẫu trả null, không trả trung bình của những gì đang có', () => {
  const c = [1, 2, 3];
  assert.equal(P.smaAt(c, 2, 5), null);
  assert.equal(P.smaAt(c, 2, 3), 2);
});

test('SMA gặp giá trị hỏng thì trả null, không bỏ qua phần tử đó', () => {
  const c = [1, null as unknown as number, 3];
  assert.equal(P.smaAt(c, 2, 3), null,
    'bỏ qua phần tử hỏng rồi chia cho 3 là tự bịa ra một trung bình');
});

/* ---------------------------- đỉnh 30 ngày ------------------------------ */

test('đỉnh 30 ngày tính CẢ nến đang xét', () => {
  const h = new Array(29).fill(10).concat([11]);
  assert.equal(P.isNewHigh(h, 29, 30), true);
});

test('bằng đỉnh cũ thì KHÔNG phải đỉnh mới', () => {
  const h = new Array(29).fill(10).concat([10]);
  assert.equal(P.isNewHigh(h, 29, 30), false);
});

test('chưa đủ 30 nến thì trả null, không đoán', () => {
  assert.equal(P.isNewHigh([1, 2, 3], 2, 30), null);
});

/* ------------------------------ độ rộng --------------------------------- */

function coin(base: string, closes: number[], highs?: number[]) {
  return {
    base,
    times: closes.map((_, i) => i * 86400000),
    closes,
    highs: highs || closes,
  };
}
const rising = (n: number, from = 100) =>
  Array.from({ length: n }, (_, i) => from + i);
const falling = (n: number, from = 400) =>
  Array.from({ length: n }, (_, i) => from - i);

test('COIN CHƯA ĐỦ 200 NẾN KHÔNG ĐƯỢC TÍNH VÀO MẪU SỐ của aboveMa200', () => {
  const dai = coin('A', rising(260));
  const ngan = coin('B', rising(50).concat(new Array(210).fill(null) as unknown as number[]));
  // Coin B có đủ độ dài mảng nhưng toàn giá trị hỏng ở đoạn cần MA -> không
  // tính được MA200 -> phải bị loại khỏi mẫu số, không bị coi là "dưới MA".
  const rows = P.breadthSeries([dai, ngan], 5);
  const r = rows[rows.length - 1];
  assert.equal(r.aboveMa200N, 1, 'mẫu số phải là 1, không phải 2');
  assert.equal(r.aboveMa200, 100, 'coin không tính được KHÔNG được kéo tỉ lệ xuống 50%');
});

test('tỉ lệ trên MA200 đúng khi một nửa số coin ở trên', () => {
  const rows = P.breadthSeries([
    coin('A', rising(260)), coin('B', rising(260)),
    coin('C', falling(260)), coin('D', falling(260)),
  ], 5);
  const r = rows[rows.length - 1];
  assert.equal(r.aboveMa200N, 4);
  assert.equal(r.aboveMa200, 50);
});

test('mỗi chỉ số có mẫu số RIÊNG, không dùng chung một mẫu số', () => {
  // Hai coin cùng độ dài, nhưng coin B chỉ có giá ở 40 ngày cuối (mới niêm
  // yết). up24h đếm được cả hai; aboveMa200 chỉ đếm được coin A.
  const bShort = (new Array(220).fill(null) as unknown as number[]).concat(rising(40));
  const rows = P.breadthSeries([coin('A', rising(260)), coin('B', bShort)], 5);
  const r = rows[rows.length - 1];
  assert.equal(r.up24hN, 2);
  assert.equal(r.aboveMa200N, 1);
  assert.equal(r.aboveMa200, 100,
    'coin mới niêm yết KHÔNG được kéo tỉ lệ xuống — nó không nằm trong mẫu số');
});

test('CHUỖI LỆCH ĐỘ DÀI BỊ BÁO LỖI TO, không trả về một con số trông hợp lý', () => {
  // Chỉ số i của hai chuỗi lệch nhau là hai ngày khác nhau. Im lặng tính tiếp
  // sẽ ra một tỉ lệ nhìn rất bình thường mà sai hoàn toàn.
  assert.throws(
    () => P.breadthSeries([coin('A', rising(260)), coin('B', rising(40))], 5),
    /không cùng độ dài/);
});

test('% coin tăng trong ngày là ảnh chụp một ngày, tính đúng', () => {
  const rows = P.breadthSeries([
    coin('A', [10, 11, 12]), coin('B', [10, 9, 8]),
  ], 3);
  const r = rows[rows.length - 1];
  assert.equal(r.up24h, 50);
});

test('chuỗi rỗng không làm nổ, trả mảng rỗng', () => {
  assert.equal(P.breadthSeries([], 5).length, 0);
});

/* ------------------------------- phân kỳ -------------------------------- */

const rowsOf = (vals: (number | null)[]) => vals.map((v, i) => ({
  t: i, aboveMa200: v, aboveMa200N: 10, newHigh30: 0, newHigh30N: 10, up24h: 0, up24hN: 10,
}));

test('PHÂN KỲ CẦN CẢ HAI VẾ: BTC tăng VÀ độ rộng giảm liên tiếp', () => {
  const rows = rowsOf([70, 68, 66, 64, 62, 60]);      // giảm 5 ngày liên tiếp
  const btcUp = [100, 101, 102, 103, 104, 106];
  const d = P.divergence(rows, btcUp, 5);
  assert.equal(d.streak, 5);
  assert.equal(d.btcUp, true);
  assert.equal(d.diverging, true);
});

test('BTC GIẢM thì độ rộng có thu hẹp cũng KHÔNG phải phân kỳ', () => {
  const rows = rowsOf([70, 68, 66, 64, 62, 60]);
  const btcDown = [106, 105, 104, 103, 102, 100];
  const d = P.divergence(rows, btcDown, 5);
  assert.equal(d.streak, 5, 'chuỗi vẫn đếm được');
  assert.equal(d.diverging, false, 'nhưng thiếu vế BTC tăng thì không kết luận');
});

test('MỘT NGÀY NHÍCH LÊN GIỮA CHỪNG LÀM ĐỨT CHUỖI', () => {
  const rows = rowsOf([70, 68, 66, 67, 65, 63]);
  const d = P.divergence(rows, [100, 101, 102, 103, 104, 106], 5);
  assert.equal(d.streak, 2, 'chuỗi đếm ngược từ cuối và dừng ở ngày nhích lên');
  assert.equal(d.diverging, false,
    '"trung bình 5 ngày thấp hơn" là phát biểu khác và yếu hơn nhiều');
  // Đối chứng: theo cách "trung bình" thì chuỗi này VẪN bị gọi là phân kỳ.
  const dau = (70 + 68 + 66) / 3, cuoi = (67 + 65 + 63) / 3;
  assert.ok(cuoi < dau, 'đúng vậy — nên cách đo phải nói rõ là "liên tiếp"');
});

test('chuỗi chưa đủ dài thì báo streak thật, không làm tròn lên', () => {
  const rows = rowsOf([70, 68, 66, 65]);
  const d = P.divergence(rows, [100, 101, 102, 103], 5);
  assert.equal(d.streak, 3);
  assert.equal(d.need, 5);
  assert.equal(d.diverging, false);
});

test('thiếu dữ liệu thì enough = false, không trả streak 0 như một kết luận', () => {
  const d = P.divergence(rowsOf([70]), [100], 5);
  assert.equal(d.enough, false);
});

test('giá trị null giữa chuỗi làm đứt chuỗi chứ không bị bỏ qua', () => {
  const rows = rowsOf([70, 68, null, 64, 62, 60]);
  const d = P.divergence(rows, [100, 101, 102, 103, 104, 106], 5);
  assert.equal(d.streak, 2);
});
