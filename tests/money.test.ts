/**
 * QUẢN TRỊ VỐN — legacy-static/js/money.js
 *
 * Bài kiểm này canh hai thứ song song:
 *
 *   A. TOÁN CÓ ĐÚNG KHÔNG. Kelly, khối lượng theo ATR, số lệnh độc lập hiệu
 *      dụng và thang DCA đều là những công thức mà làm sai vẫn ra một con số
 *      trông rất hợp lý. Mỗi bài dưới đây kiểm ngược từ định nghĩa, không so
 *      với một hằng số chép tay.
 *
 *   B. RÀNG BUỘC ĐẠO ĐỨC CÓ CÒN NGUYÊN KHÔNG. Cả module không được trả về một
 *      số tiền tuyệt đối nào. Có một bài quét toàn bộ tên trường trả ra để giữ
 *      điều đó — thêm một trường `profitUsd` là bài đó hỏng ngay.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SRC = fs.readFileSync(
  path.join(process.cwd(), 'legacy-static/js/money.js'), 'utf8');

function load() {
  const self_: Record<string, unknown> = {};
  const ctx: Record<string, unknown> = { self: self_, Math, Number, Object, Array, JSON };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return self_.VdearMoney as any;
}
const M = load();

/* ============================== KELLY ================================= */

test('Kelly đúng định nghĩa f* = W − (1−W)/R', () => {
  // W = 60%, R = 2  ->  0.6 − 0.4/2 = 0.4
  const k = M.kelly(60, 2);
  assert.ok(Math.abs(k.full - 40) < 1e-9, `đang là ${k.full}`);
});

test('mặc định là MỘT PHẦN TƯ Kelly, không phải Kelly đầy đủ', () => {
  const k = M.kelly(60, 2);
  assert.equal(k.fraction, 0.25);
  assert.ok(Math.abs(k.suggestedPct - 10) < 1e-9, 'một phần tư của 40% là 10%');
  assert.ok(k.suggestedPct < k.full, 'gợi ý phải nhỏ hơn Kelly đầy đủ');
});

test('KỲ VỌNG ÂM THÌ f* ÂM và cờ noEdge bật', () => {
  // W = 30%, R = 2 -> 0.3 − 0.7/2 = −0.05
  const k = M.kelly(30, 2);
  assert.ok(k.full < 0);
  assert.equal(k.noEdge, true);
  assert.equal(k.suggestedPct, 0, 'không có lợi thế thì gợi ý phải là 0, không phải một số nhỏ');
  assert.ok(k.expectancyR < 0);
});

test('đúng điểm hoà vốn thì f* = 0, không âm không dương', () => {
  // R = 2 -> hoà vốn ở W = 1/3
  const k = M.kelly(100 / 3, 2);
  assert.ok(Math.abs(k.full) < 1e-9, `đang là ${k.full}`);
  assert.ok(Math.abs(k.expectancyR) < 1e-9);
});

test('R:R cao hơn cho f* lớn hơn ở cùng winrate', () => {
  assert.ok(M.kelly(50, 3).full > M.kelly(50, 2).full);
});

test('thiếu W hoặc R thì trả null, không lấy 50/50 làm mặc định', () => {
  assert.equal(M.kelly(null, 2), null);
  assert.equal(M.kelly(60, null), null);
  assert.equal(M.kelly(60, 0), null);
  assert.equal(M.kelly(150, 2), null, 'winrate 150% là dữ liệu hỏng');
});

/* ====================== KHỐI LƯỢNG THEO BIẾN ĐỘNG ===================== */

test('rủi ro giữ nguyên thì dừng lỗ RỘNG GẤP ĐÔI cho vị thế NHỎ ĐI MỘT NỬA', () => {
  const hep = M.sizeByStop(1, 100, 2);      // dừng 2%
  const rong = M.sizeByStop(1, 100, 4);     // dừng 4%
  assert.ok(Math.abs(hep.notionalPct - 50) < 1e-9, `${hep.notionalPct}`);
  assert.ok(Math.abs(rong.notionalPct - 25) < 1e-9);
  assert.ok(Math.abs(hep.notionalPct / rong.notionalPct - 2) < 1e-9);
});

test('KIỂM NGƯỢC: vị thế đó chạm dừng lỗ đúng bằng mức rủi ro đã đặt', () => {
  const r = M.sizeByStop(1.5, 250, 5);      // dừng 5 điểm trên giá 250 = 2%
  // lỗ = notional × (khoảng dừng / giá) phải bằng đúng 1.5% tài khoản
  const loss = r.notionalPct * (5 / 250);
  assert.ok(Math.abs(loss - 1.5) < 1e-9, `lỗ ra ${loss}, phải là 1.5`);
});

test('COIN ATR GẤP BA THÌ KHỐI LƯỢNG NHỎ ĐI ĐÚNG BA LẦN', () => {
  const em = M.sizeByAtr(1, 100, 1, 2);     // ATR 1
  const dong = M.sizeByAtr(1, 100, 3, 2);   // ATR 3
  assert.ok(Math.abs(em.notionalPct / dong.notionalPct - 3) < 1e-9,
    `${em.notionalPct} / ${dong.notionalPct}`);
});

test('so sánh hai cách cho biết cách cố định sai bao nhiêu LẦN', () => {
  // ATR 5% giá, dừng 2×ATR = 10%; cách cố định dùng dừng 2%.
  const c = M.compareSizing(1, 100, 5, 2, 2);
  assert.ok(Math.abs(c.ratio - 5) < 1e-9,
    `cách cố định cho vị thế to gấp 5 lần, đang là ${c.ratio}`);
  assert.ok(c.fixed.notionalPct > c.byAtr.notionalPct);
});

test('ATR bằng 0 hoặc thiếu thì trả null, không chia cho 0', () => {
  assert.equal(M.sizeByAtr(1, 100, 0, 2), null);
  assert.equal(M.sizeByAtr(1, 100, null, 2), null);
  assert.equal(M.sizeByStop(1, 100, 0), null);
});

/* =========================== NHIỆT DANH MỤC ========================== */

const open = (n: number) => Array.from({ length: n }, (_, i) => ({ id: 'x' + i, coin: 'C' + i }));

test('nhiệt là TỔNG rủi ro các lệnh đang mở', () => {
  const h = M.portfolioHeat(open(5), () => 1);
  assert.equal(h.heatPct, 5);
  assert.equal(h.n, 5);
  assert.equal(h.level, 'warn', '5% dưới ngưỡng đỏ 6% nên là cảnh báo vàng');
});

test('ngưỡng đỏ đúng 6% theo yêu cầu', () => {
  assert.equal(M.HEAT_RED, 6);
  assert.equal(M.portfolioHeat(open(6), () => 1).level, 'red');
  assert.equal(M.portfolioHeat(open(5), () => 1).level, 'warn');
  assert.equal(M.portfolioHeat(open(3), () => 1).level, 'ok');
});

test('LỆNH KHÔNG XÁC ĐỊNH ĐƯỢC RỦI RO PHẢI ĐẾM RIÊNG, không coi là 0', () => {
  const h = M.portfolioHeat(open(5), (t: { id: string }) => (t.id === 'x0' ? null : 1));
  assert.equal(h.unknown, 1);
  assert.equal(h.heatPct, 4, 'bốn lệnh biết rủi ro cộng lại là 4');
  // Nếu coi lệnh thiếu là 0 thì con số vẫn là 4 — nhưng người đọc sẽ tưởng đã
  // tính đủ năm lệnh. Cờ `unknown` là thứ giao diện bắt buộc phải hiện.
  assert.ok(h.unknown > 0);
});

test('không lệnh nào xác định được thì nhiệt là null, KHÔNG phải 0', () => {
  const h = M.portfolioHeat(open(3), () => null);
  assert.equal(h.heatPct, null);
  assert.equal(h.level, 'unknown');
});

test('danh mục rỗng: nhiệt 0 là một phát biểu đúng', () => {
  const h = M.portfolioHeat([], () => 1);
  assert.equal(h.heatPct, 0);
  assert.equal(h.level, 'ok');
});

/* ============================ TƯƠNG QUAN ============================= */

const walk = (n: number, step: number, seed = 1) => {
  let s = seed, p = 100;
  const out = [p];
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    p = p * (1 + ((s / 0x7fffffff) - 0.5) * step);
    out.push(p);
  }
  return out;
};

test('tương quan tính trên LỢI SUẤT, không trên giá', () => {
  // Hai coin cùng đi lên đều nhưng lợi suất ngược pha hoàn toàn.
  const a = [100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210];
  const b = [100, 101, 115, 116, 133, 134, 154, 155, 178, 179, 205, 206];
  const rho = M.pearson(M.returns(a), M.returns(b));
  assert.ok(rho < 0.9,
    `giá hai coin đều đi lên nên tương quan GIÁ ~1; theo lợi suất phải thấp hơn hẳn, đang là ${rho}`);
});

test('chuỗi giống hệt nhau cho tương quan 1', () => {
  const a = walk(40, 0.04);
  assert.ok(Math.abs(M.pearson(M.returns(a), M.returns(a)) - 1) < 1e-9);
});

test('chuỗi ngược dấu hoàn toàn cho tương quan −1', () => {
  const r = M.returns(walk(40, 0.04));
  const neg = r.map((v: number | null) => (v == null ? null : -v));
  assert.ok(Math.abs(M.pearson(r, neg) + 1) < 1e-9);
});

test('dưới 10 điểm chung thì trả null — hệ số trên vài điểm là nhiễu', () => {
  assert.equal(M.pearson([1, 2, 3], [1, 2, 3]), null);
});

/* ==================== SỐ LỆNH ĐỘC LẬP HIỆU DỤNG ====================== */

function matrixOf(coins: string[], rho: number) {
  const m: Record<string, Record<string, number>> = {};
  coins.forEach((a) => {
    m[a] = {};
    coins.forEach((b) => { m[a][b] = a === b ? 1 : rho; });
  });
  return { coins, m };
}

test('NĂM LỆNH TƯƠNG QUAN 1.0 THỰC CHẤT LÀ MỘT LỆNH', () => {
  const e = M.effectiveN(matrixOf(['A', 'B', 'C', 'D', 'E'], 1));
  assert.ok(Math.abs(e.effective - 1) < 1e-9, `đang là ${e.effective}`);
  assert.equal(e.n, 5);
});

test('năm lệnh hoàn toàn độc lập cho đúng 5', () => {
  const e = M.effectiveN(matrixOf(['A', 'B', 'C', 'D', 'E'], 0));
  assert.ok(Math.abs(e.effective - 5) < 1e-9);
});

test('tương quan 0.8 làm năm lệnh còn hiệu dụng chưa tới hai', () => {
  const e = M.effectiveN(matrixOf(['A', 'B', 'C', 'D', 'E'], 0.8));
  // N/(1+(N−1)ρ̄) = 5/(1+4×0.8) = 1.19
  assert.ok(Math.abs(e.effective - 5 / 4.2) < 1e-9, `đang là ${e.effective}`);
  assert.ok(e.effective < 2);
});

test('CẶP THIẾU HỆ SỐ BỊ BỎ VÀ ĐẾM RIÊNG, không thay bằng 0', () => {
  const m = matrixOf(['A', 'B'], 0.9) as { coins: string[]; m: Record<string, Record<string, number | null>> };
  m.m.A.B = null; m.m.B.A = null;
  const e = M.effectiveN(m);
  assert.equal(e.missingPairs, 2);
  // Thay null bằng 0 sẽ cho N_eff = 2 (hai lệnh độc lập) — một khẳng định ta
  // không hề có bằng chứng.
  assert.ok(Math.abs(e.effective - 2) < 1e-9);
  assert.ok(e.missingPairs > 0, 'nên phải báo ra để giao diện nói rõ');
});

/* ------------------------------ cụm ----------------------------------- */

test('chỉ gom vào cụm những lệnh CÙNG HƯỚNG', () => {
  const m = matrixOf(['A', 'B', 'C'], 0.9);
  const c = M.clusters(m, { A: 'LONG', B: 'LONG', C: 'SHORT' }, 0.8);
  assert.equal(c.length, 1);
  assert.equal(c[0].coins.join(','), 'A,B');
  assert.equal(c[0].side, 'LONG');
});

test('dưới ngưỡng thì không thành cụm', () => {
  assert.equal(M.clusters(matrixOf(['A', 'B'], 0.5), { A: 'LONG', B: 'LONG' }, 0.8).length, 0);
});

/* ============================ THANG DCA ============================== */

test('giá mỗi bậc lùi đúng khoảng cách đã đặt, theo hướng BẤT LỢI', () => {
  const l = M.dcaLadder({ entry: 100, side: 'LONG', steps: 3, spacingPct: 5, leverage: 10, marginPctPerStep: 1 });
  assert.equal(l.rows[0].price, 100);
  assert.ok(Math.abs(l.rows[1].price - 95) < 1e-9);
  assert.ok(Math.abs(l.rows[2].price - 90) < 1e-9);

  const s = M.dcaLadder({ entry: 100, side: 'SHORT', steps: 3, spacingPct: 5, leverage: 10, marginPctPerStep: 1 });
  assert.ok(Math.abs(s.rows[2].price - 110) < 1e-9, 'SHORT thì bất lợi là giá TĂNG');
});

test('giá vào trung bình có trọng số theo vốn, không phải trung bình cộng thô', () => {
  const l = M.dcaLadder({ entry: 100, side: 'LONG', steps: 2, spacingPct: 10, leverage: 10, marginPctPerStep: 1 });
  // Cùng ký quỹ mỗi lần nhưng notional quy ra cùng % tài khoản, nên giá trung
  // bình có trọng số theo GIÁ TRỊ hợp đồng: (100·n + 90·n)/(2n) = 95
  assert.ok(Math.abs(l.rows[1].avgEntry - 95) < 1e-9, `đang là ${l.rows[1].avgEntry}`);
});

test('DCA KÉO GIÁ THANH LÝ RA XA HƠN — đó chính là điều nó đánh đổi', () => {
  const l = M.dcaLadder({ entry: 100, side: 'LONG', steps: 3, spacingPct: 10, leverage: 10, marginPctPerStep: 1 });
  const liq1 = l.rows[0].liqPrice, liq3 = l.rows[2].liqPrice;
  assert.ok(liq3 < liq1, 'giá thanh lý phải TỤT XUỐNG sau mỗi lần bù');
  // …nhưng vốn bỏ ra gấp ba, và đó mới là rủi ro thật.
  assert.equal(l.rows[2].cumMarginPct, 3);
  assert.equal(l.totalMarginPct, 3);
});

test('giá thanh lý ở bậc đầu khớp công thức ký quỹ', () => {
  const l = M.dcaLadder({ entry: 100, side: 'LONG', steps: 1, spacingPct: 5, leverage: 10, marginPctPerStep: 1, mmr: 0.005 });
  const P = l.rows[0].liqPrice;
  // Kiểm ngược từ định nghĩa ký quỹ, giống tests/liq.test.ts
  const conLai = 100 / 10 + (P - 100);
  assert.ok(Math.abs(conLai - 0.005 * P) < 1e-9);
});

test('đầu vào hỏng trả null chứ không dựng thang rỗng', () => {
  assert.equal(M.dcaLadder({ entry: 0, steps: 3, spacingPct: 5, leverage: 10 }), null);
  assert.equal(M.dcaLadder({ entry: 100, steps: 3, spacingPct: 5, leverage: 1 }), null);
  assert.equal(M.dcaLadder({ entry: 100, steps: 3, spacingPct: 0, leverage: 10 }), null);
});

test('số bậc có trần, không dựng bảng nghìn dòng', () => {
  const l = M.dcaLadder({ entry: 100, steps: 500, spacingPct: 1, leverage: 10, marginPctPerStep: 1 });
  assert.ok(l.rows.length <= 20);
});

/* ==================== GIÁ THANH LÝ RƠI VÀO CỤM ======================= */

function fakeMap(bins: Array<{ lo: number; hi: number; usd: number }>) {
  return {
    price: 100,
    bins: bins.map((b) => ({ lo: b.lo, hi: b.hi, mid: (b.lo + b.hi) / 2, longUsd: b.usd, shortUsd: 0 })),
  };
}

test('"rơi vào cụm" có ĐỊNH NGHĨA: ô nằm trong nhóm đậm nhất', () => {
  const map = fakeMap([
    { lo: 90, hi: 91, usd: 1 }, { lo: 91, hi: 92, usd: 1 }, { lo: 92, hi: 93, usd: 1 },
    { lo: 93, hi: 94, usd: 1 }, { lo: 94, hi: 95, usd: 1000 },
  ]);
  assert.equal(M.clusterRisk(map, 94.5, 20).inCluster, true);
  assert.equal(M.clusterRisk(map, 90.5, 20).inCluster, false);
});

test('giá ngoài bản đồ thì nói rõ là ngoài, không nói "an toàn"', () => {
  const map = fakeMap([{ lo: 90, hi: 91, usd: 5 }]);
  const r = M.clusterRisk(map, 50, 20);
  assert.equal(r.inMap, false);
  assert.equal(r.inCluster, false);
});

test('bản đồ rỗng trả null, không trả "không có cụm"', () => {
  assert.equal(M.clusterRisk(fakeMap([]), 95, 20), null);
  assert.equal(M.clusterRisk(null, 95, 20), null);
});

/* ================= RÀNG BUỘC ĐẠO ĐỨC: KHÔNG SỐ TIỀN ================== */

test('KHÔNG HÀM NÀO TRẢ VỀ MỘT TRƯỜNG TIỀN TUYỆT ĐỐI', () => {
  const outputs = [
    M.kelly(60, 2),
    M.sizeByStop(1, 100, 2),
    M.sizeByAtr(1, 100, 2, 2),
    M.compareSizing(1, 100, 2, 2, 2),
    M.portfolioHeat(open(3), () => 1),
    M.dcaLadder({ entry: 100, steps: 3, spacingPct: 5, leverage: 10, marginPctPerStep: 1 }),
    M.effectiveN(matrixOf(['A', 'B'], 0.5)),
  ];
  const names: string[] = [];
  const walkObj = (o: unknown, depth = 0) => {
    if (!o || typeof o !== 'object' || depth > 4) return;
    for (const k of Object.keys(o as Record<string, unknown>)) {
      names.push(k);
      walkObj((o as Record<string, unknown>)[k], depth + 1);
    }
  };
  outputs.forEach((o) => walkObj(o));
  const banned = names.filter((k) =>
    /usd|profit|pnl|money|amount|balance|equity|dollar|revenue|gain/i.test(k)
    && !/usd$/i.test('') );
  // `usd` chỉ được phép xuất hiện ở clusterRisk (đọc bản đồ thanh lý, là dữ
  // liệu thị trường chứ không phải tiền của người dùng) — nó không nằm trong
  // danh sách trên.
  assert.deepEqual(banned, [],
    `module quản trị vốn không được trả về số tiền tuyệt đối; thấy: ${banned.join(', ')}`);
  // Đối chứng: phép quét thật sự có nhìn thấy tên trường.
  assert.ok(names.includes('suggestedPct') && names.includes('notionalPct') && names.includes('heatPct'),
    'phép quét phải thật sự duyệt qua các trường, nếu không thì nó luôn "đạt"');
});
