/*
 * Vdearypto — Web Worker gom thống kê (chiến lược × chế độ thị trường).
 *
 * Vì sao là worker: bảng ở /stats chạy backtest trên hàng chục coin, mỗi coin
 * vài trăm nến, hai chiến lược. Làm trên luồng chính thì thanh cuộn khựng
 * đúng lúc người dùng đang đọc.
 *
 * MẸO NẠP LẠI ĐÚNG MÃ ĐANG CHẠY THẬT
 * ----------------------------------
 * `self.window = self` cho phép nạp thẳng config.js và indicators.js vào
 * worker mà KHÔNG phải sửa hai tệp đó (chúng gán vào `window`). Nhờ vậy bảng
 * winrate chạy đúng bộ điều kiện tín hiệu mà radar đang dùng, không phải một
 * bản chép lại — chép lại là bảo đảm hai bản sẽ lệch nhau sau vài lần sửa, và
 * lúc đó bảng thống kê nói về một chiến lược không tồn tại.
 *
 * window.VdearI18n không có ở đây nên T() trong indicators.js rơi về trả lại
 * chính mã khoá. Không sao: phần gom số không đọc nhãn hiển thị nào.
 */
self.window = self;
importScripts('config.js', 'indicators.js', 'regime.js');

var CFG = self.VDEAR_CONFIG;
var TA = self.VdearTA;
var RG = self.VdearRegime;

// R:R của chính bộ quản trị vốn đang dùng: TP +100% ký quỹ, SL −50% ký quỹ.
// Thắng = +2R, thua = −1R. Lấy từ config chứ không gõ số 2 vào đây, để đổi
// config thì thống kê đổi theo.
function rr() {
  var tp = Number(CFG.money.tpMarginPct), sl = Number(CFG.money.slMarginPct);
  return (Number.isFinite(tp) && Number.isFinite(sl) && sl > 0) ? tp / sl : null;
}

var STRATEGIES = ['combat', 'rsi'];

function runCoin(base, candles, leverage) {
  var out = [];
  if (!candles || candles.length < 80) return out;
  var reg = RG.regimeSeries(candles).regime;
  var R = rr();
  STRATEGIES.forEach(function (strat) {
    TA.miniBacktest(candles, leverage, {
      strategy: strat,
      onTrade: function (t) {
        out.push({
          coin: base,
          strategy: strat,
          // Chế độ tại ĐÚNG nến phát tín hiệu, không phải chế độ hiện tại.
          // Lấy chế độ hôm nay gán cho lệnh của ba tháng trước là nhìn trộm
          // tương lai, và bảng winrate sẽ đẹp một cách vô nghĩa.
          regime: reg[t.entryIdx] || null,
          win: !!t.win,
          r: t.win ? R : -1,
        });
      },
    });
  });
  return out;
}

self.onmessage = function (e) {
  var msg = e.data || {};
  if (msg.type !== 'run') return;
  var lev = Number(msg.leverage) || CFG.money.leverage;
  var all = [];
  var perCoin = {};
  var skipped = [];

  (msg.coins || []).forEach(function (row) {
    try {
      var t = runCoin(row.base, row.candles, lev);
      if (!t.length) { skipped.push(row.base); return; }
      all = all.concat(t);
      perCoin[row.base] = t.length;
    } catch (err) {
      skipped.push(row.base);
    }
  });

  var mx = RG.matrix(all);

  // Chế độ hiện tại của từng coin — radar dùng để gắn huy hiệu.
  var now = {};
  (msg.coins || []).forEach(function (row) {
    try {
      var c = RG.current(row.candles);
      if (c) now[row.base] = c;
    } catch (err) { /* coin này thiếu nến, bỏ qua */ }
  });

  self.postMessage({
    type: 'result',
    matrix: mx,
    current: now,
    totalTrades: all.length,
    perCoin: perCoin,
    skipped: skipped,
    strategies: STRATEGIES,
    rr: rr(),
    leverage: lev,
  });
};
