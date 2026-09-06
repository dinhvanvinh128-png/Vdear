/*
 * Vdearypto — NHẬN DIỆN CHẾ ĐỘ THỊ TRƯỜNG (market regime).
 *
 * Bốn trạng thái: TREND TĂNG · TREND GIẢM · TÍCH LUỸ · BIẾN ĐỘNG CAO.
 *
 * Cố ý dùng PHƯƠNG PHÁP QUY TẮC, không dùng học máy. Quy tắc thì đọc được,
 * kiểm được, và khi sai thì chỉ ra được sai ở đâu; một mô hình học máy trên
 * vài trăm nến chỉ cho ra một con số không giải thích nổi.
 *
 * Tệp này KHÔNG phụ thuộc `window`, `document`, `fetch` hay bất cứ thứ gì của
 * trình duyệt, để chạy được cả trong Web Worker (xem js/stats-worker.js).
 * Mọi tham số truyền vào, không đọc biến toàn cục.
 *
 * BA CHỖ DỄ SAI, ĐÃ XỬ LÝ RIÊNG
 * -----------------------------
 * 1. ADX phải dùng làm trơn Wilder (RMA), không phải trung bình cộng. Dùng
 *    trung bình cộng cho ra một đường ADX khác hẳn — cao hơn và giật hơn — nên
 *    ngưỡng 25/20 mất hết ý nghĩa.
 * 2. Percentile phải tính trên CỬA SỔ TRƯỢT kết thúc tại chính nến đang xét,
 *    không phải trên toàn chuỗi. Tính trên toàn chuỗi là nhìn trộm tương lai:
 *    nến thứ 10 được xếp hạng dựa trên cả những nến chưa xảy ra, và mọi con số
 *    winrate dựng trên đó đều đẹp giả tạo.
 * 3. Làm mượt 3 nến nghĩa là "điều kiện mới phải giữ đủ 3 nến LIÊN TIẾP rồi
 *    mới đổi nhãn", không phải "lấy nhãn xuất hiện nhiều nhất trong 3 nến".
 */
(function (root) {
  'use strict';

  var KEYS = ['trend_up', 'trend_down', 'range', 'volatile'];

  var DEFAULTS = {
    adxPeriod: 14,
    adxTrend: 25,        // ADX trên mức này = có xu hướng
    adxRange: 20,        // ADX dưới mức này = không có xu hướng
    bbPeriod: 20,
    bbMult: 2,
    bbLookback: 100,     // cửa sổ xếp hạng độ rộng dải Bollinger
    bbPct: 30,           // dưới percentile này = bị nén
    atrPeriod: 14,
    atrLookback: 100,
    atrPct: 85,          // trên percentile này = biến động cao
    confirmBars: 3,      // số nến liên tiếp phải giữ điều kiện mới đổi nhãn
  };

  function num(x) {
    if (x == null || x === '') return null;
    var n = Number(x);
    return Number.isFinite(n) ? n : null;
  }

  /* ------------------------- làm trơn kiểu Wilder ----------------------- */

  /*
   * RMA: giá trị đầu là trung bình cộng `period` phần tử, sau đó
   *   rma[i] = (rma[i-1] * (period - 1) + x[i]) / period
   * Đây là thứ Wilder định nghĩa cho ATR/ADX/RSI. Phần tử trước `period-1`
   * trả null chứ không trả 0 — chưa đủ dữ liệu là chưa đủ dữ liệu.
   */
  function rma(values, period) {
    var out = new Array(values.length).fill(null);
    if (!values.length || period < 1 || values.length < period) return out;
    var sum = 0;
    for (var i = 0; i < period; i++) {
      var v = num(values[i]);
      if (v == null) return out;
      sum += v;
    }
    var prev = sum / period;
    out[period - 1] = prev;
    for (var j = period; j < values.length; j++) {
      var x = num(values[j]);
      if (x == null) { out[j] = prev; continue; }
      prev = (prev * (period - 1) + x) / period;
      out[j] = prev;
    }
    return out;
  }

  /* ------------------------------- ADX ---------------------------------- */

  /*
   * ADX/DMI theo đúng Wilder:
   *   +DM = high−high₋₁ nếu lớn hơn low₋₁−low và > 0, ngược lại 0
   *   −DM = low₋₁−low   nếu lớn hơn high−high₋₁ và > 0, ngược lại 0
   *   TR  = max(h−l, |h−c₋₁|, |l−c₋₁|)
   *   +DI = 100 · RMA(+DM)/RMA(TR),  −DI tương tự
   *   DX  = 100 · |+DI − −DI| / (+DI + −DI)
   *   ADX = RMA(DX)
   */
  function adxSeries(candles, period) {
    var p = period || DEFAULTS.adxPeriod;
    var n = (candles || []).length;
    var out = { adx: new Array(n).fill(null), plusDI: new Array(n).fill(null),
      minusDI: new Array(n).fill(null) };
    if (n < p * 2) return out;

    var tr = new Array(n).fill(0), pdm = new Array(n).fill(0), mdm = new Array(n).fill(0);
    for (var i = 1; i < n; i++) {
      var c = candles[i], q = candles[i - 1];
      var up = c.high - q.high;
      var dn = q.low - c.low;
      pdm[i] = (up > dn && up > 0) ? up : 0;
      mdm[i] = (dn > up && dn > 0) ? dn : 0;
      tr[i] = Math.max(c.high - c.low, Math.abs(c.high - q.close), Math.abs(c.low - q.close));
    }
    // Bỏ phần tử 0 (không có nến trước) rồi làm trơn, sau đó dời chỉ số về lại.
    var trR = rma(tr.slice(1), p), pR = rma(pdm.slice(1), p), mR = rma(mdm.slice(1), p);
    var dx = new Array(n).fill(null);
    for (var k = 0; k < trR.length; k++) {
      var idx = k + 1;
      if (trR[k] == null || pR[k] == null || mR[k] == null || trR[k] === 0) continue;
      var pdi = 100 * pR[k] / trR[k];
      var mdi = 100 * mR[k] / trR[k];
      out.plusDI[idx] = pdi; out.minusDI[idx] = mdi;
      var sum = pdi + mdi;
      dx[idx] = sum === 0 ? 0 : 100 * Math.abs(pdi - mdi) / sum;
    }
    // ADX = RMA của DX, bắt đầu từ nến đầu tiên DX có giá trị.
    var first = dx.findIndex(function (v) { return v != null; });
    if (first < 0) return out;
    var adxR = rma(dx.slice(first).map(function (v) { return v == null ? 0 : v; }), p);
    for (var m = 0; m < adxR.length; m++) {
      if (adxR[m] != null) out.adx[first + m] = adxR[m];
    }
    return out;
  }

  /* ------------------------ độ rộng dải Bollinger ----------------------- */

  // (dải trên − dải dưới) / dải giữa × 100. Chuẩn hoá theo giá nên so sánh
  // được giữa các coin và giữa các thời kỳ giá khác nhau.
  function bbWidthSeries(closes, period, mult) {
    var p = period || DEFAULTS.bbPeriod;
    var k = mult || DEFAULTS.bbMult;
    var n = (closes || []).length;
    var out = new Array(n).fill(null);
    if (n < p) return out;
    for (var i = p - 1; i < n; i++) {
      var sum = 0;
      for (var a = i - p + 1; a <= i; a++) sum += closes[a];
      var mean = sum / p;
      if (!(mean > 0)) continue;
      var vsum = 0;
      for (var b = i - p + 1; b <= i; b++) vsum += (closes[b] - mean) * (closes[b] - mean);
      var sd = Math.sqrt(vsum / p);
      out[i] = (2 * k * sd) / mean * 100;
    }
    return out;
  }

  /*
   * ATR quy về % giá — cùng lý do chuẩn hoá như độ rộng Bollinger.
   *
   * THỨ TỰ QUAN TRỌNG: chia TỪNG nến cho giá của CHÍNH nó rồi mới làm trơn.
   * Làm ngược lại (trơn ATR tuyệt đối rồi chia cho giá hiện tại) sinh ra một
   * thiên lệch có hướng: trong một xu hướng giảm kéo dài, ATR tuyệt đối được
   * làm trơn còn mang biên độ của vùng giá CAO hơn trước đó, chia cho giá hôm
   * nay đã thấp nên tỉ số cứ tăng đều. Nến nào cũng thành "cao nhất từ trước
   * tới nay", xếp hạng luôn vượt p85, và mọi xu hướng giảm dài đều bị dán nhãn
   * "biến động cao". Đây là lỗi thật đã bị bài kiểm bắt được.
   */
  function atrPctSeries(candles, period) {
    var p = period || DEFAULTS.atrPeriod;
    var n = (candles || []).length;
    var out = new Array(n).fill(null);
    if (n < 2) return out;
    var trPct = [];
    for (var i = 1; i < n; i++) {
      var c = candles[i], q = candles[i - 1];
      var tr = Math.max(c.high - c.low, Math.abs(c.high - q.close), Math.abs(c.low - q.close));
      trPct.push(c.close > 0 ? tr / c.close * 100 : null);
    }
    var r = rma(trPct, p);
    for (var k = 0; k < r.length; k++) {
      if (r[k] != null) out[k + 1] = r[k];
    }
    return out;
  }

  /* ---------------------------- xếp hạng ------------------------------- */

  /*
   * Vị trí percentile của `value` trong cửa sổ `window` phần tử KẾT THÚC tại
   * chính nó. Không dùng toàn chuỗi: xem cả tương lai để xếp hạng quá khứ là
   * nhìn trộm, và mọi winrate dựng trên đó đều đẹp giả tạo.
   */
  function rankPct(series, i, window) {
    var v = num(series[i]);
    if (v == null) return null;
    var from = Math.max(0, i - window + 1);
    var below = 0, total = 0;
    for (var k = from; k <= i; k++) {
      var x = num(series[k]);
      if (x == null) continue;
      total++;
      if (x < v) below++;
    }
    // Cần đủ mẫu mới xếp hạng được. Một nửa cửa sổ là tối thiểu.
    if (total < Math.max(10, window / 2)) return null;
    return below / (total - 1 || 1) * 100;
  }

  /* -------------------------- phân loại thô ----------------------------- */

  /*
   * Thứ tự luật (biến động cao ĐÈ LÊN các nhãn khác, theo đúng yêu cầu):
   *   ATR% ở trên percentile 85  -> volatile
   *   ADX > 25 và +DI > −DI      -> trend_up
   *   ADX > 25 và −DI > +DI      -> trend_down
   *   ADX < 20 và độ rộng BB dưới percentile 30 -> range
   *   còn lại                    -> null (chưa xếp được, GIỮ nhãn cũ)
   *
   * Trả null chứ không trả một nhãn mặc định: "chưa xếp được" là một trạng
   * thái thật, gán bừa vào 'range' là bịa ra một phát biểu về thị trường.
   */
  function classifyAt(i, ctx, opt) {
    var o = opt || DEFAULTS;
    var atrRank = rankPct(ctx.atrPct, i, o.atrLookback);
    if (atrRank != null && atrRank > o.atrPct) return 'volatile';

    var adx = num(ctx.adx[i]), p = num(ctx.plusDI[i]), m = num(ctx.minusDI[i]);
    if (adx != null && p != null && m != null) {
      if (adx > o.adxTrend && p > m) return 'trend_up';
      if (adx > o.adxTrend && m > p) return 'trend_down';
      if (adx < o.adxRange) {
        var bbRank = rankPct(ctx.bbWidth, i, o.bbLookback);
        if (bbRank != null && bbRank < o.bbPct) return 'range';
      }
    }
    return null;
  }

  /* ------------------------------- chuỗi -------------------------------- */

  /*
   * Chuỗi chế độ đã LÀM MƯỢT.
   *
   * Quy tắc: nhãn hiện tại chỉ đổi khi một nhãn khác xuất hiện liên tiếp đủ
   * `confirmBars` nến. Không có bộ lọc này thì ADX dao động quanh 25 làm nhãn
   * nhảy qua lại từng nến, và bảng winrate theo chế độ trở thành nhiễu.
   *
   * Lưu ý: "3 nến liên tiếp" KHÁC "nhãn phổ biến nhất trong 3 nến". Cách sau
   * cho đổi nhãn khi chỉ 2/3 nến đồng ý — yếu hơn hẳn.
   */
  function regimeSeries(candles, opts) {
    var o = Object.assign({}, DEFAULTS, opts || {});
    var n = (candles || []).length;
    var out = new Array(n).fill(null);
    if (!n) return { regime: out, ctx: null };

    var closes = candles.map(function (c) { return c.close; });
    var a = adxSeries(candles, o.adxPeriod);
    var ctx = {
      adx: a.adx, plusDI: a.plusDI, minusDI: a.minusDI,
      bbWidth: bbWidthSeries(closes, o.bbPeriod, o.bbMult),
      atrPct: atrPctSeries(candles, o.atrPeriod),
    };

    var current = null, pending = null, run = 0;
    for (var i = 0; i < n; i++) {
      var raw = classifyAt(i, ctx, o);
      if (raw == null) {
        // Chưa xếp được: giữ nguyên nhãn đang có và ĐẶT LẠI chuỗi chờ. Một nến
        // không xếp được là bằng chứng chống lại nhãn đang chờ xác nhận.
        pending = null; run = 0;
      } else if (raw === current) {
        pending = null; run = 0;
      } else {
        // Nhãn thô khác nhãn hiện tại: đếm chuỗi liên tiếp.
        if (raw === pending) run++; else { pending = raw; run = 1; }
        // Kiểm tra ngưỡng ngay tại đây, kể cả nến đầu tiên của chuỗi. Trước đó
        // phép kiểm chỉ nằm ở nhánh `raw === pending`, nên confirmBars = 1 vẫn
        // trễ một nến — tức là "không làm mượt" cũng bị làm mượt.
        if (run >= o.confirmBars) { current = pending; pending = null; run = 0; }
      }
      out[i] = current;
    }
    return { regime: out, ctx: ctx, opts: o };
  }

  /*
   * Trạng thái tại nến cuối, kèm số nến đã ở trong trạng thái đó và các con số
   * thô để giao diện giải thích được vì sao lại là nhãn này.
   */
  function current(candles, opts) {
    var r = regimeSeries(candles, opts);
    var n = r.regime.length;
    if (!n) return null;
    var key = r.regime[n - 1];
    var bars = 0;
    for (var i = n - 1; i >= 0 && r.regime[i] === key; i--) bars++;
    var o = r.opts;
    return {
      key: key, bars: key == null ? 0 : bars,
      adx: r.ctx.adx[n - 1], plusDI: r.ctx.plusDI[n - 1], minusDI: r.ctx.minusDI[n - 1],
      bbWidth: r.ctx.bbWidth[n - 1],
      bbRank: rankPct(r.ctx.bbWidth, n - 1, o.bbLookback),
      atrPct: r.ctx.atrPct[n - 1],
      atrRank: rankPct(r.ctx.atrPct, n - 1, o.atrLookback),
      confirmBars: o.confirmBars,
    };
  }

  /* --------------------------- ma trận winrate -------------------------- */

  // Dưới ngưỡng này thì KHÔNG công bố winrate. Một ô 3 lệnh thắng 2 không phải
  // "winrate 67%", nó là ba lần tung đồng xu.
  var MIN_SAMPLE = 30;

  function emptyCell() { return { trades: 0, wins: 0, rSum: 0 }; }

  /*
   * Gom kết quả backtest theo (chiến lược × chế độ).
   *
   * `trades` là mảng { strategy, regime, win, r } do bên gọi sinh ra — module
   * này không tự chạy backtest để khỏi nhân đôi định nghĩa tín hiệu đang nằm
   * ở js/strategy.js.
   */
  function matrix(trades) {
    var cells = {};
    var strategies = [], regimes = [];
    for (var i = 0; i < (trades || []).length; i++) {
      var t = trades[i];
      if (!t || !t.strategy || !t.regime) continue;   // chế độ null: bỏ, không gom vào ô nào
      var key = t.strategy + '|' + t.regime;
      if (!cells[key]) cells[key] = emptyCell();
      cells[key].trades++;
      if (t.win) cells[key].wins++;
      var r = num(t.r);
      if (r != null) cells[key].rSum += r;
      if (strategies.indexOf(t.strategy) < 0) strategies.push(t.strategy);
      if (regimes.indexOf(t.regime) < 0) regimes.push(t.regime);
    }
    var out = {};
    Object.keys(cells).forEach(function (k) {
      var c = cells[k];
      var enough = c.trades >= MIN_SAMPLE;
      out[k] = {
        trades: c.trades, wins: c.wins,
        enough: enough,
        // Mẫu nhỏ thì winrate và kỳ vọng là null, KHÔNG phải một con số mờ đi.
        // Hiện số rồi ghi chú nhỏ "mẫu ít" thì người đọc vẫn nhớ con số.
        winRate: enough ? c.wins / c.trades * 100 : null,
        expectancyR: enough ? c.rSum / c.trades : null,
        need: MIN_SAMPLE,
      };
    });
    return {
      cells: out,
      strategies: strategies.sort(),
      regimes: KEYS.filter(function (k) { return regimes.indexOf(k) >= 0; }),
      minSample: MIN_SAMPLE,
    };
  }

  function cell(mx, strategy, regime) {
    if (!mx || !mx.cells) return null;
    return mx.cells[strategy + '|' + regime] || null;
  }

  root.VdearRegime = {
    KEYS: KEYS,
    DEFAULTS: DEFAULTS,
    MIN_SAMPLE: MIN_SAMPLE,
    rma: rma,
    adxSeries: adxSeries,
    bbWidthSeries: bbWidthSeries,
    atrPctSeries: atrPctSeries,
    rankPct: rankPct,
    classifyAt: classifyAt,
    regimeSeries: regimeSeries,
    current: current,
    matrix: matrix,
    cell: cell,
  };
})(typeof self !== 'undefined' ? self : this);
