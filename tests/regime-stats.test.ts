/**
 * BẢNG WINRATE DÙNG CHUNG CHO RADAR — legacy-static/js/regime-stats.js
 *
 * Hai thứ ở đây, nếu sai, sẽ sai một cách IM LẶNG:
 *
 *   1. `Number(null) === 0`. Khoá localStorage chưa được đặt mà đem Number()
 *      thẳng thì "chưa đặt ngưỡng" biến thành "ngưỡng 0%", và bộ lọc không lọc
 *      gì cả nhưng vẫn trông như đang bật. Lỗi này ĐÃ XẢY RA THẬT trong lúc
 *      dựng, bài kiểm dưới đây là để nó không quay lại.
 *   2. Ô chưa đủ mẫu bị đối xử như ô winrate thấp. Đó là âm thầm đổi "không
 *      biết" thành "xấu", và nó giấu mất những tín hiệu chưa từng bị đánh giá.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SRC = fs.readFileSync(
  path.join(process.cwd(), 'legacy-static/js/regime-stats.js'), 'utf8');

function load(store: Record<string, string> = {}) {
  const win: Record<string, unknown> = {};
  const ctx: Record<string, unknown> = {
    window: win, Math, Number, Object, Array, JSON, Date, Promise, setTimeout, clearTimeout,
    localStorage: {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return win.VdearRegimeStats as any;
}

const payload = (over: Record<string, unknown> = {}) => Object.assign({
  at: Date.now(), rr: 2, coins: 24, totalTrades: 500,
  matrix: {
    cells: {
      'combat|trend_up': { trades: 120, wins: 60, enough: true, winRate: 50, expectancyR: 0.5, need: 30 },
      'combat|trend_down': { trades: 120, wins: 24, enough: true, winRate: 20, expectancyR: -0.4, need: 30 },
      'combat|range': { trades: 12, wins: 8, enough: false, winRate: null, expectancyR: null, need: 30 },
    },
    strategies: ['combat'], regimes: ['trend_up', 'trend_down', 'range'], minSample: 30,
  },
}, over);

/* ------------------------------ ngưỡng --------------------------------- */

test('CHƯA ĐẶT NGƯỠNG thì rơi về điểm hoà vốn, KHÔNG phải 0', () => {
  const RS = load({});                       // localStorage trống
  const thr = RS.getThreshold(payload());
  assert.ok(Math.abs(thr - 100 / 3) < 1e-9, `đang là ${thr}`);
  // Đối chứng chính xác cái bẫy: Number(null) cho ra 0, và 0 lọt mọi phép
  // kiểm khoảng giá trị.
  assert.equal(Number(null), 0);
  assert.ok(Number.isFinite(Number(null)) && Number(null) >= 0 && Number(null) <= 100,
    'chính vì 0 lọt hết nên phải chặn ở giá trị THÔ, không phải sau khi ép kiểu');
});

test('chuỗi rỗng cũng phải rơi về mặc định', () => {
  const RS = load({ vdear_winrate_min: '' });
  assert.ok(Math.abs(RS.getThreshold(payload()) - 100 / 3) < 1e-9);
});

test('ngưỡng 0 do NGƯỜI DÙNG đặt thì vẫn được tôn trọng', () => {
  const RS = load({ vdear_winrate_min: '0' });
  assert.equal(RS.getThreshold(payload()), 0,
    '"người dùng cố ý đặt 0" khác "chưa đặt gì" — hai thứ này không được gộp');
});

test('điểm hoà vốn suy từ R:R, không phải hằng số 50', () => {
  const RS = load({});
  assert.ok(Math.abs(RS.defaultThreshold(payload({ rr: 2 })) - 33.333) < 0.01);
  assert.ok(Math.abs(RS.defaultThreshold(payload({ rr: 1 })) - 50) < 1e-9);
  assert.ok(Math.abs(RS.defaultThreshold(payload({ rr: 3 })) - 25) < 1e-9);
  // Không có R:R thì mới dùng 50 làm chỗ dựa cuối cùng.
  assert.equal(RS.defaultThreshold(payload({ rr: null })), 50);
});

test('ngưỡng ngoài khoảng 0..100 bị bỏ qua', () => {
  assert.ok(Math.abs(load({ vdear_winrate_min: '250' }).getThreshold(payload()) - 100 / 3) < 1e-9);
  assert.ok(Math.abs(load({ vdear_winrate_min: 'abc' }).getThreshold(payload()) - 100 / 3) < 1e-9);
});

/* ------------------------------ đánh giá -------------------------------- */

test('ô đủ mẫu và dưới ngưỡng -> weak', () => {
  const RS = load({});
  const j = RS.judge(payload(), 'trend_down', 33.3, 'combat');
  assert.equal(j.state, 'weak');
  assert.equal(j.winRate, 20);
  assert.equal(j.cell.trades, 120);
});

test('ô đủ mẫu và đạt ngưỡng -> ok', () => {
  const RS = load({});
  assert.equal(RS.judge(payload(), 'trend_up', 33.3, 'combat').state, 'ok');
});

test('Ô CHƯA ĐỦ MẪU LÀ "unknown", KHÔNG PHẢI "weak"', () => {
  const RS = load({});
  const j = RS.judge(payload(), 'range', 33.3, 'combat');
  assert.equal(j.state, 'unknown',
    'ô 12 mẫu thắng 8 (67%) vẫn là "chưa biết" — và ngược lại, mẫu nhỏ tệ cũng vậy');
  assert.notEqual(j.state, 'weak');
});

test('chế độ không có trong bảng -> unknown, không nổ', () => {
  const RS = load({});
  assert.equal(RS.judge(payload(), 'volatile', 33.3, 'combat').state, 'unknown');
  assert.equal(RS.judge(payload(), null, 33.3, 'combat').state, 'unknown');
  assert.equal(RS.judge(null, 'trend_up', 33.3, 'combat').state, 'unknown');
});

test('ngưỡng hỏng thì dùng mặc định chứ không so với NaN', () => {
  const RS = load({});
  // NaN so sánh với gì cũng false -> mọi ô sẽ thành "ok" một cách im lặng.
  const j = RS.judge(payload(), 'trend_down', NaN, 'combat');
  assert.equal(j.state, 'weak');
  assert.ok(Math.abs(j.threshold - 100 / 3) < 1e-9);
});

/* --------------------------- bộ đệm localStorage ------------------------ */

test('bảng quá hạn bị bỏ, không dùng số của tuần trước', () => {
  const old = JSON.stringify(payload({ at: Date.now() - 7 * 24 * 3600 * 1000 }));
  const RS = load({ vdear_regime_matrix: old });
  assert.equal(RS.cached(), null);
});

test('bảng còn hạn được đọc lại nguyên vẹn', () => {
  const fresh = JSON.stringify(payload({ at: Date.now() - 60000 }));
  const RS = load({ vdear_regime_matrix: fresh });
  assert.ok(RS.cached());
  assert.equal(RS.cached().coins, 24);
});

test('bộ đệm hỏng cú pháp không làm vỡ trang', () => {
  const RS = load({ vdear_regime_matrix: '{khong-phai-json' });
  assert.equal(RS.cached(), null);
});
