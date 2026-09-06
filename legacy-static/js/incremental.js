/*
 * Vdearypto — CẬP NHẬT CHỈ BÁO TĂNG DẦN.
 *
 * Mục 4 của docs/INFRA-SCALING.md. Khi một nến mới đóng, tính lại toàn bộ
 * chuỗi cho mọi coin × mọi khung là lãng phí bậc hai; công thức truy hồi cho
 * cùng kết quả với một phép tính.
 *
 * ĐIỀU PHẢI NÓI THẲNG: CÔNG THỨC TRUY HỒI CÓ TRÔI SỐ
 * ---------------------------------------------------
 * Mỗi bước là một phép nhân-chia trên số dấu phẩy động, và sai số làm tròn
 * cộng dồn. Sau vài chục nghìn nến, giá trị truy hồi sẽ LỆCH khỏi giá trị tính
 * lại từ đầu. Lệch bao nhiêu thì phải ĐO, không được đoán — nên module này có
 * hàm `drift()` và hạ tầng phải chạy nó mỗi 24 giờ, tính lại toàn bộ rồi so.
 *
 * Không có phép đo đó thì "chỉ báo tăng dần" là một lời hứa không kiểm chứng,
 * và ngày nó trôi đủ xa để đổi một tín hiệu thì không ai biết.
 *
 * Thuần tính: không DOM, không mạng. Chạy được cả trong worker lẫn Node.
 */
(function (root) {
  'use strict';

  function num(x) {
    if (x == null || x === '') return null;
    var n = Number(x);
    return Number.isFinite(n) ? n : null;
  }

  /* ------------------------------- EMA ---------------------------------- */

  /*
   * EMA truy hồi:  ema_t = giá_t · k + ema_{t−1} · (1 − k),  k = 2/(n+1)
   *
   * Trạng thái khởi tạo là trung bình cộng `period` giá trị đầu — cùng quy ước
   * với emaSeries() trong js/indicators.js. Hai bên phải khởi tạo GIỐNG NHAU,
   * nếu không thì giá trị truy hồi và giá trị tính lại từ đầu sẽ lệch mãi mãi
   * bằng một hằng số, và phép đo trôi số sẽ báo động giả suốt.
   */
  function emaInit(values, period) {
    var p = num(period);
    if (p == null || p < 1) return null;
    var vals = (values || []).map(num).filter(function (v) { return v != null; });
    if (vals.length < p) return null;
    var sum = 0;
    for (var i = 0; i < p; i++) sum += vals[i];
    var ema = sum / p;
    for (var j = p; j < vals.length; j++) ema = vals[j] * (2 / (p + 1)) + ema * (1 - 2 / (p + 1));
    return { ema: ema, period: p, n: vals.length };
  }

  function emaStep(state, value) {
    var v = num(value);
    if (!state || v == null) return state;
    var k = 2 / (state.period + 1);
    return { ema: v * k + state.ema * (1 - k), period: state.period, n: state.n + 1 };
  }

  /* ------------------------------- RSI ---------------------------------- */

  /*
   * RSI Wilder truy hồi:
   *   avgGain_t = (avgGain_{t−1}·(n−1) + gain_t) / n     (tương tự avgLoss)
   *   RSI = 100 − 100/(1 + avgGain/avgLoss)
   *
   * avgLoss = 0 thì RSI = 100 theo định nghĩa, KHÔNG phải chia cho 0 rồi ra
   * NaN và lặng lẽ biến mất khỏi biểu đồ.
   */
  function rsiInit(closes, period) {
    var p = num(period) || 14;
    var vals = (closes || []).map(num).filter(function (v) { return v != null; });
    if (vals.length <= p) return null;
    var gain = 0, loss = 0, i;
    for (i = 1; i <= p; i++) {
      var d = vals[i] - vals[i - 1];
      if (d >= 0) gain += d; else loss -= d;
    }
    var ag = gain / p, al = loss / p;
    for (i = p + 1; i < vals.length; i++) {
      var dd = vals[i] - vals[i - 1];
      ag = (ag * (p - 1) + (dd > 0 ? dd : 0)) / p;
      al = (al * (p - 1) + (dd < 0 ? -dd : 0)) / p;
    }
    return { avgGain: ag, avgLoss: al, prevClose: vals[vals.length - 1], period: p, n: vals.length };
  }

  function rsiStep(state, close) {
    var c = num(close);
    if (!state || c == null) return state;
    var p = state.period;
    var d = c - state.prevClose;
    return {
      avgGain: (state.avgGain * (p - 1) + (d > 0 ? d : 0)) / p,
      avgLoss: (state.avgLoss * (p - 1) + (d < 0 ? -d : 0)) / p,
      prevClose: c, period: p, n: state.n + 1,
    };
  }

  function rsiValue(state) {
    if (!state) return null;
    if (state.avgLoss === 0) return state.avgGain === 0 ? 50 : 100;
    var rs = state.avgGain / state.avgLoss;
    return 100 - 100 / (1 + rs);
  }

  /* ------------------------------- ATR ---------------------------------- */

  function trueRange(c, prevClose) {
    var h = num(c && c.high), l = num(c && c.low), pc = num(prevClose);
    if (h == null || l == null) return null;
    if (pc == null) return h - l;
    return Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }

  function atrInit(candles, period) {
    var p = num(period) || 14;
    var list = candles || [];
    if (list.length <= p) return null;
    var trs = [];
    for (var i = 1; i < list.length; i++) {
      var tr = trueRange(list[i], list[i - 1].close);
      if (tr != null) trs.push(tr);
    }
    if (trs.length < p) return null;
    var sum = 0, k;
    for (k = 0; k < p; k++) sum += trs[k];
    var atr = sum / p;
    for (k = p; k < trs.length; k++) atr = (atr * (p - 1) + trs[k]) / p;
    return { atr: atr, prevClose: list[list.length - 1].close, period: p, n: list.length };
  }

  function atrStep(state, candle) {
    if (!state) return state;
    var tr = trueRange(candle, state.prevClose);
    if (tr == null) return state;
    return {
      atr: (state.atr * (state.period - 1) + tr) / state.period,
      prevClose: num(candle.close), period: state.period, n: state.n + 1,
    };
  }

  /* ---------------------------- đo trôi số ------------------------------ */

  /*
   * So giá trị truy hồi với giá trị tính lại từ đầu.
   *
   * Trả về sai số TƯƠNG ĐỐI, vì sai số tuyệt đối trên một chỉ báo giá 100.000
   * và trên một chỉ báo giá 0,00001 không so được với nhau.
   *
   * `tolerance` là ngưỡng báo động, mặc định 1e-9. Vượt ngưỡng thì hạ tầng
   * phải GHI LẠI và thay trạng thái truy hồi bằng bản tính lại — chứ không
   * phải im lặng dùng tiếp.
   */
  var DRIFT_TOLERANCE = 1e-9;

  function drift(incrementalValue, recomputedValue, tolerance) {
    var a = num(incrementalValue), b = num(recomputedValue);
    if (a == null || b == null) {
      return { ok: false, reason: 'missing', relative: null };
    }
    var tol = num(tolerance);
    if (tol == null) tol = DRIFT_TOLERANCE;
    var scale = Math.max(Math.abs(a), Math.abs(b));
    var rel = scale > 0 ? Math.abs(a - b) / scale : 0;
    return {
      ok: rel <= tol,
      relative: rel,
      absolute: Math.abs(a - b),
      tolerance: tol,
      incremental: a,
      recomputed: b,
      // Vượt ngưỡng: phải thay trạng thái bằng bản tính lại, không dùng tiếp.
      action: rel <= tol ? 'keep' : 'reseed',
    };
  }

  /*
   * Chạy toàn bộ phép kiểm trôi số cho một chuỗi: khởi tạo trên `warmup` nến
   * đầu, đẩy dần phần còn lại bằng công thức truy hồi, rồi so với bản tính lại
   * từ đầu trên TOÀN chuỗi.
   */
  function driftReport(candles, opts) {
    var o = opts || {};
    var warmup = num(o.warmup) || 100;
    var period = num(o.period) || 14;
    var list = candles || [];
    if (list.length < warmup + 10) {
      return { enough: false, need: warmup + 10, have: list.length };
    }
    var head = list.slice(0, warmup);
    var closes = list.map(function (c) { return c.close; });

    var rsiState = rsiInit(head.map(function (c) { return c.close; }), period);
    var atrState = atrInit(head, period);
    var emaState = emaInit(head.map(function (c) { return c.close; }), 20);
    if (!rsiState || !atrState || !emaState) {
      return { enough: false, need: warmup + 10, have: list.length };
    }
    for (var i = warmup; i < list.length; i++) {
      rsiState = rsiStep(rsiState, list[i].close);
      atrState = atrStep(atrState, list[i]);
      emaState = emaStep(emaState, list[i].close);
    }
    var fullRsi = rsiValue(rsiInit(closes, period));
    var fullAtr = atrInit(list, period);
    var fullEma = emaInit(closes, 20);

    return {
      enough: true,
      steps: list.length - warmup,
      rsi: drift(rsiValue(rsiState), fullRsi, o.tolerance),
      atr: drift(atrState.atr, fullAtr ? fullAtr.atr : null, o.tolerance),
      ema20: drift(emaState.ema, fullEma ? fullEma.ema : null, o.tolerance),
    };
  }

  root.VdearIncremental = {
    DRIFT_TOLERANCE: DRIFT_TOLERANCE,
    emaInit: emaInit, emaStep: emaStep,
    rsiInit: rsiInit, rsiStep: rsiStep, rsiValue: rsiValue,
    atrInit: atrInit, atrStep: atrStep, trueRange: trueRange,
    drift: drift, driftReport: driftReport,
  };
})(typeof self !== 'undefined' ? self : this);
