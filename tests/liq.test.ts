/**
 * MÔ PHỎNG CHUỖI THANH LÝ — legacy-static/js/liq.js
 *
 * Module này nguy hiểm hơn mọi module khác trong repo: nó in ra những con số
 * trông y hệt dữ liệu thật ("1,2 tỉ USD long bị thanh lý ở $58.400") nhưng
 * thực chất là hệ quả của một mô hình giả định. Nên bài kiểm ở đây không chỉ
 * hỏi "có chạy không" mà hỏi bốn thứ:
 *
 *   1. công thức giá thanh lý có ĐÚNG đại số không (kiểm ngược lại từ định
 *      nghĩa ký quỹ, không phải so với một hằng số tự chép ra),
 *   2. tổng USD có BẢO TOÀN không — mô hình phân bổ Open Interest, nên tổng
 *      các phần phải bằng đầu vào, không được tự sinh thêm tiền,
 *   3. vòng lặp dây chuyền có tính một cụm hai lần không (lỗi này cho ra con
 *      số vô hạn mà nhìn vẫn "hợp lý"),
 *   4. thiếu dữ liệu có bị đổi thành 0 không.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SRC = fs.readFileSync(
  path.join(process.cwd(), 'legacy-static/js/liq.js'), 'utf8');

function load() {
  const win: Record<string, unknown> = {};
  const ctx: Record<string, unknown> = { window: win, Math, Number, Object, Array, JSON, Date };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return win.VdearLiq as any;
}
const L = load();

/* ------------------------- giá thanh lý ------------------------------- */

test('giá thanh lý long thoả ĐÚNG định nghĩa ký quỹ, không phải một hằng số chép tay', () => {
  const E = 100, lev = 10, mmr = 0.005;
  const P = L.liqPrice(E, lev, 'long', mmr);
  // Kiểm ngược: tại P, ký quỹ còn lại phải đúng bằng ký quỹ duy trì.
  // ký quỹ ban đầu E/lev, lãi/lỗ = (P − E), yêu cầu duy trì = mmr·P
  const conLai = E / lev + (P - E);
  assert.ok(Math.abs(conLai - mmr * P) < 1e-9,
    `còn lại ${conLai} phải bằng ký quỹ duy trì ${mmr * P}`);
});

test('giá thanh lý short cũng thoả định nghĩa, và nằm PHÍA TRÊN giá vào', () => {
  const E = 100, lev = 20, mmr = 0.005;
  const P = L.liqPrice(E, lev, 'short', mmr);
  const conLai = E / lev + (E - P);
  assert.ok(Math.abs(conLai - mmr * P) < 1e-9);
  assert.ok(P > E, 'short bị thanh lý khi giá TĂNG');
});

test('đòn bẩy càng cao thì giá thanh lý càng sát giá vào', () => {
  const a = L.liqPrice(100, 10, 'long');
  const b = L.liqPrice(100, 100, 'long');
  assert.ok(b > a, '100x phải bị thanh lý sớm hơn 10x');
  assert.ok(100 - b < 100 - a);
  // đối chứng số: 100x ~ 99.0, 10x ~ 90.45 (mmr 0.5%)
  assert.equal(Math.round(b * 100) / 100, 99.5);
  assert.equal(Math.round(a * 100) / 100, 90.45);
});

test('ký quỹ duy trì cao hơn đẩy giá thanh lý long LÊN (bị quét sớm hơn)', () => {
  const thap = L.liqPrice(100, 10, 'long', 0.004);
  const cao = L.liqPrice(100, 10, 'long', 0.02);
  assert.ok(cao > thap);
});

test('đầu vào hỏng trả null chứ không trả 0', () => {
  assert.equal(L.liqPrice(null, 10, 'long'), null);
  assert.equal(L.liqPrice(100, null, 'long'), null);
  assert.equal(L.liqPrice(0, 10, 'long'), null);
  assert.equal(L.liqPrice(100, 1, 'long'), null, 'đòn bẩy 1x không bao giờ bị thanh lý');
});

/* --------------------- giá vào lệnh từ khối lượng --------------------- */

const candle = (t: number, price: number, vol: number, withQuote = true) => ({
  time: t, open: price, high: price * 1.01, low: price * 0.99, close: price,
  volume: vol, quote: withQuote ? price * vol : undefined,
});

test('VWAP lấy từ quoteVolume/volume khi có — đó là số thật của sàn', () => {
  const e = L.entryBuckets([{ time: 1, high: 110, low: 90, close: 100, volume: 10, quote: 1050 }]);
  assert.equal(e.rows[0].price, 105, 'phải là 1050/10, không phải (110+90+100)/3 = 100');
  assert.equal(e.exact, 1);
  assert.equal(e.approx, 0);
});

test('thiếu quoteVolume mới rơi về giá điển hình, và ĐÁNH DẤU là xấp xỉ', () => {
  const e = L.entryBuckets([{ time: 1, high: 110, low: 90, close: 100, volume: 10 }]);
  assert.equal(e.rows[0].price, 100);
  assert.equal(e.approx, 1, 'không được im lặng coi con số xấp xỉ như số thật');
});

test('trọng số theo khối lượng, tổng đúng bằng 1', () => {
  const e = L.entryBuckets([candle(1, 100, 30), candle(2, 200, 70)]);
  const sum = e.rows.reduce((a: number, r: { weight: number }) => a + r.weight, 0);
  assert.ok(Math.abs(sum - 1) < 1e-12);
  assert.equal(Math.round(e.rows[0].weight * 100), 30);
  assert.equal(Math.round(e.rows[1].weight * 100), 70);
});

test('nến khối lượng 0 bị loại, không kéo trọng số về đâu', () => {
  const e = L.entryBuckets([candle(1, 100, 0), candle(2, 200, 50)]);
  assert.equal(e.rows.length, 1);
  assert.equal(e.rows[0].weight, 1);
});

/* --------------------------- phân bố đòn bẩy -------------------------- */

test('phân bố đòn bẩy được chuẩn hoá: gõ 40/30/20/10 hay 0.4/0.3/0.2/0.1 đều như nhau', () => {
  const a = L.normLeverage([{ lev: 10, share: 40 }, { lev: 20, share: 60 }]);
  const b = L.normLeverage([{ lev: 10, share: 0.4 }, { lev: 20, share: 0.6 }]);
  assert.equal(a.rows[0].share, b.rows[0].share);
  assert.equal(Math.round(a.rows[0].share * 100), 40);
});

test('tổng không tròn 100 vẫn không làm hụt Open Interest', () => {
  const r = L.normLeverage([{ lev: 10, share: 50 }, { lev: 20, share: 47 }]);
  const sum = r.rows.reduce((a: number, x: { share: number }) => a + x.share, 0);
  assert.ok(Math.abs(sum - 1) < 1e-12, 'tổng 97 phải được chuẩn hoá về 1');
});

/* ------------------------------ bản đồ cụm ---------------------------- */

const baseMap = (over: Record<string, unknown> = {}) => L.clusterMap(Object.assign({
  oiUsd: 1_000_000_000,
  price: 100,
  candles: [candle(1, 100, 100)],
  longShare: 0.5,
  bandPct: 25,
  binPct: 0.25,
}, over));

test('TỔNG USD BẢO TOÀN: mô hình phân bổ OI, không được tự sinh thêm tiền', () => {
  const m = baseMap();
  const tong = m.totalLongUsd + m.totalShortUsd + m.outsideBandUsd;
  assert.ok(Math.abs(tong - 1_000_000_000) < 1,
    `tổng ${tong} phải bằng đúng OI đầu vào`);
});

test('phần rơi ra ngoài dải được ĐẾM RIÊNG, không bị nuốt im lặng', () => {
  // 10x long từ giá 100 bị thanh lý ở ~90.45 — nằm ngoài dải ±5%.
  const m = baseMap({ bandPct: 5 });
  assert.ok(m.outsideBandUsd > 0, 'phải có phần rơi ra ngoài');
  const tong = m.totalLongUsd + m.totalShortUsd + m.outsideBandUsd;
  assert.ok(Math.abs(tong - 1_000_000_000) < 1);
  // đối chứng: dải rộng thì phần rơi ra ngoài phải NHỎ hơn hẳn
  const rong = baseMap({ bandPct: 25 });
  assert.ok(rong.outsideBandUsd < m.outsideBandUsd);
});

test('longShare chia đúng hai phía, và 0.5 khi thiếu thì phải BÁO là giả định', () => {
  const m = baseMap({ longShare: 0.8 });
  assert.ok(m.totalLongUsd > m.totalShortUsd * 3);
  assert.equal(m.assumptions.longShareAssumed, false);

  const k = L.clusterMap({ oiUsd: 1e9, price: 100, candles: [candle(1, 100, 100)] });
  assert.equal(k.assumptions.longShare, 0.5);
  assert.equal(k.assumptions.longShareAssumed, true,
    '0.5 im lặng là một phát biểu về thị trường mà ta không có');
});

test('cụm long nằm DƯỚI giá vào, cụm short nằm TRÊN', () => {
  const m = baseMap();
  let longMax = 0, shortMax = 0, longAt = 0, shortAt = 0;
  for (const b of m.bins) {
    if (b.longUsd > longMax) { longMax = b.longUsd; longAt = b.mid; }
    if (b.shortUsd > shortMax) { shortMax = b.shortUsd; shortAt = b.mid; }
  }
  assert.ok(longAt < 100, `cụm long đậm nhất ở ${longAt}, phải dưới 100`);
  assert.ok(shortAt > 100, `cụm short đậm nhất ở ${shortAt}, phải trên 100`);
});

test('OI hoặc giá thiếu thì trả null, không dựng bản đồ rỗng trông như thật', () => {
  assert.equal(L.clusterMap({ oiUsd: null, price: 100, candles: [candle(1, 100, 1)] }), null);
  assert.equal(L.clusterMap({ oiUsd: 1e9, price: null, candles: [candle(1, 100, 1)] }), null);
  assert.equal(L.clusterMap({ oiUsd: 1e9, price: 100, candles: [] }), null);
});

test('bản đồ mang theo TOÀN BỘ giả định đã dùng', () => {
  const m = baseMap({ mmr: 0.007 });
  assert.equal(m.assumptions.mmr, 0.007);
  assert.equal(m.assumptions.feesIgnored, true);
  assert.equal(m.assumptions.leverage.length, 4);
  assert.equal(m.assumptions.entryCandles, 1);
});

/* --------------------------- áp lực ròng ------------------------------ */

test('áp lực ròng so long phía DƯỚI với short phía TRÊN', () => {
  const m = baseMap({ longShare: 0.9 });
  const p = L.netPressure(m);
  assert.ok(p.belowUsd > p.aboveUsd);
  assert.ok(p.skew > 0 && p.skew <= 1);
});

test('không có cụm nào thì skew là null, KHÔNG phải 0', () => {
  const m = baseMap({ bandPct: 0.3 });   // dải quá hẹp, không cụm nào lọt vào
  const p = L.netPressure(m);
  assert.equal(p.belowUsd, 0);
  assert.equal(p.aboveUsd, 0);
  assert.equal(p.skew, null, '"cân bằng" và "không biết" là hai phát biểu khác nhau');
});

test('giới hạn cửa sổ ±% cắt bớt cụm ở xa', () => {
  const m = baseMap();
  const rong = L.netPressure(m);
  const hep = L.netPressure(m, 2);
  assert.ok(hep.belowUsd < rong.belowUsd);
});

/* ------------------------------ sổ lệnh ------------------------------- */

// Sổ lệnh đều: mỗi 0.1 giá có 1000 USD, đi từ 100 xuống 95.
const evenBook = () => {
  const bids: string[][] = [];
  for (let p = 99.9; p >= 95; p -= 0.1) bids.push([p.toFixed(4), (1000 / p).toFixed(8)]);
  const asks: string[][] = [];
  for (let p = 100.1; p <= 105; p += 0.1) asks.push([p.toFixed(4), (1000 / p).toFixed(8)]);
  return L.normBook({ bids, asks });
};

test('sổ lệnh nhận chuỗi và quy ra USD ngay', () => {
  const b = L.normBook({ bids: [['100', '2']], asks: [['101', '1']] });
  assert.equal(b.bids[0].usd, 200);
  assert.equal(b.asks[0].usd, 101);
});

test('mức giá hỏng bị bỏ, không thành 0 USD', () => {
  const b = L.normBook({ bids: [['100', '2'], ['abc', '5'], ['99', '0']], asks: [] });
  assert.equal(b.bids.length, 1);
});

test('bán vào sổ lệnh đẩy giá xuống theo đúng lượng thanh khoản ăn hết', () => {
  const book = evenBook();
  // 10.000 USD ăn hết 10 mức 0.1 -> khoảng 1 điểm giá
  const r = L.absorb(book.bids, 100, 10000, -1);
  assert.ok(r.price < 100 && r.price > 98.5, `giá dừng ở ${r.price}`);
  assert.equal(r.exhausted, false);
  // gấp năm lần lượng bán phải đẩy đi XA HƠN
  const r5 = L.absorb(book.bids, 100, 50000, -1);
  assert.ok(r5.price < r.price);
});

test('hết sổ lệnh thì DỪNG Ở MÉP SỔ và nói ra, không ngoại suy', () => {
  const book = evenBook();           // tổng bid ~49.000 USD tới 95
  const r = L.absorb(book.bids, 100, 500000, -1);
  assert.equal(r.exhausted, true);
  // Đáy sổ là 95. Không đi tiếp: đi tiếp bao xa thì dữ liệu công khai không nói.
  assert.equal(Math.round(r.price * 100) / 100, 95);
  assert.ok(r.filledUsd < 500000, 'chỉ khớp được phần sổ lệnh có thật');
});

test('bán vừa trong sổ thì KHÔNG bị đánh dấu hết sổ', () => {
  const r = L.absorb(evenBook().bids, 100, 10000, -1);
  assert.equal(r.exhausted, false);
  assert.equal(r.filledUsd, 10000);
});

test('ĐỐI CHỨNG: ngoại suy tuyến tính là thứ cho ra con số vô lý', () => {
  // Đây chính là công thức bản trước dùng. Giữ lại để nói rõ vì sao đã bỏ.
  const filled = 49000, movedPct = 5, need = 2_500_000;
  const perPct = filled / movedPct;
  const khongTran = 95 * (1 - ((need - filled) / perPct) / 100);
  assert.ok(khongTran < 0, `ngoại suy cho ra giá ${khongTran} — âm, tức vô nghĩa`);
});

test('chuỗi ăn hết sổ thì mang cờ exhausted ra ngoài', () => {
  const m = handMap([{ mid: 99, longUsd: 5_000_000 }]);
  const c = L.cascade(m, evenBook(), { dir: -1, startPrice: 99 });
  assert.equal(c.exhausted, true);
});

test('sổ lệnh rỗng thì giá không nhúc nhích và filledUsd = 0', () => {
  const r = L.absorb([], 100, 10000, -1);
  assert.equal(r.price, 100);
  assert.equal(r.filledUsd, 0);
});

/* -------------------------- chuỗi dây chuyền -------------------------- */

// Bản đồ dựng tay: hai cụm long ở 99 và 98, không có gì khác.
function handMap(bins: Array<{ mid: number; longUsd?: number; shortUsd?: number }>, price = 100) {
  return {
    price,
    bins: bins.map((b) => ({
      mid: b.mid, lo: b.mid - 0.05, hi: b.mid + 0.05,
      longUsd: b.longUsd || 0, shortUsd: b.shortUsd || 0,
    })),
  };
}

test('chuỗi dừng lại khi không còn cụm nào bị chạm', () => {
  const m = handMap([{ mid: 99, longUsd: 10000 }]);
  const c = L.cascade(m, evenBook(), { dir: -1, startPrice: 99 });
  assert.equal(c.rounds, 1);
  assert.equal(c.stop, 'no-more');
  assert.equal(c.totalLiquidatedUsd, 10000);
});

test('MỘT CỤM CHỈ ĐƯỢC TÍNH MỘT LẦN — nếu không thì vòng lặp tự nuôi chính nó', () => {
  const m = handMap([{ mid: 99, longUsd: 10000 }, { mid: 98.5, longUsd: 10000 }]);
  const c = L.cascade(m, evenBook(), { dir: -1, startPrice: 99 });
  assert.ok(c.totalLiquidatedUsd <= 20000 + 1e-6,
    `tổng ${c.totalLiquidatedUsd} không được vượt tổng hai cụm`);
  assert.ok(c.rounds >= 2, 'cụm thứ hai phải được kích hoạt');
});

test('cụm dày hơn đẩy giá đi xa hơn', () => {
  const mong = handMap([{ mid: 99, longUsd: 5000 }]);
  const day = handMap([{ mid: 99, longUsd: 40000 }]);
  const a = L.cascade(mong, evenBook(), { dir: -1, startPrice: 99 });
  const b = L.cascade(day, evenBook(), { dir: -1, startPrice: 99 });
  assert.ok(b.finalPrice < a.finalPrice);
});

test('không có sổ lệnh thì nói thẳng hasBook = false, không vẽ chuỗi bịa', () => {
  const m = handMap([{ mid: 99, longUsd: 10000 }]);
  const c = L.cascade(m, null, { dir: -1, startPrice: 99 });
  assert.equal(c.hasBook, false);
  assert.equal(c.finalPrice, 99, 'không có thanh khoản để đẩy thì giá đứng yên');
});

test('chạm mức không có cụm nào thì stop = no-trigger', () => {
  const m = handMap([{ mid: 90, longUsd: 10000 }]);
  const c = L.cascade(m, evenBook(), { dir: -1, startPrice: 99.5 });
  assert.equal(c.stop, 'no-trigger');
  assert.equal(c.totalLiquidatedUsd, 0);
});

test('chiều lên quét cụm SHORT, không quét cụm long', () => {
  const m = handMap([{ mid: 101, shortUsd: 10000 }, { mid: 99, longUsd: 999999 }]);
  const c = L.cascade(m, evenBook(), { dir: 1, startPrice: 101 });
  assert.equal(c.totalLiquidatedUsd, 10000);
  assert.ok(c.finalPrice > 101);
});

test('có trần số vòng, không lặp vô hạn', () => {
  const bins = [];
  for (let p = 99.9; p > 90; p -= 0.1) bins.push({ mid: Number(p.toFixed(2)), longUsd: 100 });
  const c = L.cascade(handMap(bins), evenBook(), { dir: -1, startPrice: 99.9, maxRounds: 5 });
  assert.ok(c.rounds <= 5);
});

/* -------------------------- ngưỡng nguy hiểm -------------------------- */

test('ngưỡng nguy hiểm phải thoả ĐÚNG định nghĩa: đủ vòng VÀ đủ độ trượt', () => {
  // Một chuỗi thật: cụm dày ở 99.5 đẩy giá qua cụm ở 98.4
  const m = handMap([
    { mid: 99.5, longUsd: 40000 },
    { mid: 98.4, longUsd: 40000 },
  ]);
  const d = L.dangerLevel(m, evenBook(), -1, { minPct: 1, minRounds: 2 });
  assert.ok(d, 'phải tìm ra ngưỡng');
  assert.equal(d.price, 99.5);
  assert.ok(d.cascade.rounds >= 2);
  assert.ok(Math.abs(d.cascade.movePct) >= 1);
});

test('cụm mỏng KHÔNG được gọi là ngưỡng nguy hiểm — thà trả null còn hơn hạ chuẩn', () => {
  const m = handMap([{ mid: 99.5, longUsd: 200 }, { mid: 98.4, longUsd: 200 }]);
  const d = L.dangerLevel(m, evenBook(), -1, { minPct: 1, minRounds: 2 });
  assert.equal(d, null);
});

test('ngưỡng trả về là mức GẦN giá hiện tại nhất, không phải mức lớn nhất', () => {
  const m = handMap([
    { mid: 99.5, longUsd: 40000 }, { mid: 98.4, longUsd: 40000 },
    { mid: 96.0, longUsd: 900000 }, { mid: 95.0, longUsd: 900000 },
  ]);
  const d = L.dangerLevel(m, evenBook(), -1, { minPct: 1, minRounds: 2 });
  assert.equal(d.price, 99.5, 'cú chạm đầu tiên mới là cú đáng lo');
});

test('chiều lên tìm ngưỡng phía TRÊN giá hiện tại', () => {
  const m = handMap([{ mid: 100.5, shortUsd: 40000 }, { mid: 101.6, shortUsd: 40000 }]);
  const d = L.dangerLevel(m, evenBook(), 1, { minPct: 1, minRounds: 2 });
  assert.ok(d && d.price > 100);
  assert.ok(d.fromCurrentPct > 0);
});

/* ------------------------------ mật độ -------------------------------- */

test('đỉnh mật độ là null khi bản đồ trống, không phải 0', () => {
  assert.equal(L.peak(handMap([{ mid: 99 }])), null);
  assert.equal(L.peak(handMap([{ mid: 99, longUsd: 5 }])), 5);
});
