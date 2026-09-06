/*
 * Vdearypto — CVD (Cumulative Volume Delta) và phân kỳ CVD/giá.
 *
 * Thuần tính: không DOM, không mạng. Chạy được trong Web Worker.
 *
 * HAI CHỖ QUYẾT ĐỊNH TOÀN BỘ CHẤT LƯỢNG
 * -------------------------------------
 * 1. CVD là chuỗi CỘNG DỒN, nên nó phụ thuộc vào ĐIỂM BẮT ĐẦU. Mức tuyệt đối
 *    của CVD không có ý nghĩa gì — chỉ có HÌNH DẠNG và HƯỚNG của nó mới có.
 *    Vì vậy chuỗi trả ra luôn kèm `startedAt`, và giao diện phải nói rõ chuỗi
 *    bắt đầu từ đâu thay vì để người đọc tưởng đó là một đại lượng tuyệt đối.
 *
 * 2. Phân kỳ phải tìm bằng SWING POINT (pivot), không phải so hai điểm cuối.
 *    So hai điểm cuối thì bất kỳ đoạn nhiễu nào cũng thành "phân kỳ", và trên
 *    một chuỗi đủ dài lúc nào cũng tìm được một cặp điểm nói lên điều ta muốn.
 *    Pivot đòi hỏi một đỉnh/đáy thật sự nhô ra khỏi N nến hai bên.
 */
(function (root) {
  'use strict';

  function num(x) {
    if (x == null || x === '') return null;
    var n = Number(x);
    return Number.isFinite(n) ? n : null;
  }

  /* -------------------------------- CVD --------------------------------- */

  /*
   * Cộng dồn delta theo thứ tự thời gian.
   *
   * `buckets` = [{ t, buyVol, sellVol }] đã sắp tăng dần. Bucket thiếu dữ liệu
   * KHÔNG được coi delta = 0: một khoảng đứt sẽ được đánh dấu `gap` để đường
   * vẽ ra có chỗ ngắt, thay vì nối thẳng qua và tạo ra một đoạn đi ngang
   * trông như thị trường cân bằng.
   */
  function series(buckets, opts) {
    var o = opts || {};
    var rows = [];
    var acc = 0;
    var started = null;
    for (var i = 0; i < (buckets || []).length; i++) {
      var b = buckets[i];
      var buy = num(b && b.buyVol), sell = num(b && b.sellVol);
      if (buy == null || sell == null) {
        rows.push({ t: b && b.t, cvd: null, delta: null, gap: true });
        continue;
      }
      var d = buy - sell;
      acc += d;
      if (started == null) started = b.t;
      rows.push({ t: b.t, cvd: acc, delta: d, gap: false });
    }
    return {
      rows: rows,
      startedAt: started,
      // Mức tuyệt đối vô nghĩa; trả ra để giao diện nói rõ chứ không để dùng.
      absoluteMeaningless: true,
      last: rows.length ? rows[rows.length - 1].cvd : null,
      bucketMs: o.bucketMs || null,
    };
  }

  /* ------------------------------- pivot -------------------------------- */

  /*
   * Pivot high tại i: giá cao nhất trong cửa sổ [i−left, i+right] và phải
   * NHÔ HẲN ra, tức lớn hơn HẲN (không bằng) mọi điểm hai bên. Cho phép bằng
   * thì một đoạn đi ngang sẽ sinh ra hàng loạt pivot giả.
   *
   * Điểm quan trọng: pivot chỉ xác nhận được sau `right` nến. Chuỗi trả ra vì
   * thế KHÔNG bao giờ chứa pivot ở `right` nến cuối cùng — đó là giới hạn thật
   * của phương pháp, không phải thiếu sót cần vá.
   */
  function pivots(values, left, right) {
    var L = num(left) || 3, R = num(right) || 3;
    var highs = [], lows = [];
    var n = (values || []).length;
    for (var i = L; i < n - R; i++) {
      var v = num(values[i]);
      if (v == null) continue;
      var isHigh = true, isLow = true;
      for (var k = i - L; k <= i + R; k++) {
        if (k === i) continue;
        var x = num(values[k]);
        if (x == null) { isHigh = false; isLow = false; break; }
        if (x >= v) isHigh = false;
        if (x <= v) isLow = false;
        if (!isHigh && !isLow) break;
      }
      if (isHigh) highs.push({ i: i, v: v });
      if (isLow) lows.push({ i: i, v: v });
    }
    return { highs: highs, lows: lows, left: L, right: R };
  }

  /* ------------------------------ phân kỳ ------------------------------- */

  /*
   * Phân kỳ giữa giá và CVD.
   *
   *   TĂNG (bullish): giá tạo đáy THẤP HƠN nhưng CVD tạo đáy CAO HƠN.
   *   GIẢM (bearish): giá tạo đỉnh CAO HƠN nhưng CVD tạo đỉnh THẤP HƠN.
   *
   * Ghép cặp pivot của GIÁ, rồi đọc CVD tại CHÍNH hai chỉ số ấy. Tìm pivot
   * riêng trên CVD rồi ghép chéo là sai: hai pivot ở hai thời điểm khác nhau
   * thì không so được với nhau.
   *
   * `maxBars` giới hạn khoảng cách giữa hai pivot — hai đáy cách nhau nửa năm
   * không phải một phân kỳ, chúng chỉ là hai sự kiện rời rạc.
   */
  function divergences(priceLows, priceHighs, cvdValues, opts) {
    var o = opts || {};
    var maxBars = num(o.maxBars) || 60;
    var minBars = num(o.minBars) || 5;
    var out = [];

    function scan(list, kind) {
      for (var i = 1; i < list.length; i++) {
        var a = list[i - 1], b = list[i];
        var gap = b.i - a.i;
        if (gap < minBars || gap > maxBars) continue;
        var ca = num(cvdValues[a.i]), cb = num(cvdValues[b.i]);
        if (ca == null || cb == null) continue;

        if (kind === 'bullish') {
          // giá đáy thấp hơn, CVD đáy cao hơn
          if (b.v < a.v && cb > ca) {
            out.push({
              type: 'bullish', fromIdx: a.i, toIdx: b.i,
              priceFrom: a.v, priceTo: b.v, cvdFrom: ca, cvdTo: cb, bars: gap,
            });
          }
        } else if (b.v > a.v && cb < ca) {
          // giá đỉnh cao hơn, CVD đỉnh thấp hơn
          out.push({
            type: 'bearish', fromIdx: a.i, toIdx: b.i,
            priceFrom: a.v, priceTo: b.v, cvdFrom: ca, cvdTo: cb, bars: gap,
          });
        }
      }
    }
    scan(priceLows || [], 'bullish');
    scan(priceHighs || [], 'bearish');
    out.sort(function (x, y) { return x.toIdx - y.toIdx; });
    return out;
  }

  /*
   * Tiện dụng: từ nến + chuỗi CVD ra thẳng danh sách phân kỳ.
   * `candles` = [{high, low, ...}], `cvdRows` = kết quả series().rows
   */
  function detect(candles, cvdRows, opts) {
    var o = opts || {};
    var n = Math.min((candles || []).length, (cvdRows || []).length);
    if (n < 20) return { divergences: [], enough: false, need: 20, have: n };
    var highs = [], lows = [], cvd = [];
    for (var i = 0; i < n; i++) {
      highs.push(num(candles[i].high));
      lows.push(num(candles[i].low));
      cvd.push(cvdRows[i] ? cvdRows[i].cvd : null);
    }
    var L = num(o.left) || 3, R = num(o.right) || 3;
    var ph = pivots(highs, L, R).highs;
    var pl = pivots(lows, L, R).lows;
    return {
      enough: true,
      divergences: divergences(pl, ph, cvd, o),
      pivotHighs: ph, pivotLows: pl,
      left: L, right: R,
      // Pivot cần `right` nến xác nhận -> vùng chưa kết luận được ở cuối chuỗi.
      unconfirmedBars: R,
    };
  }

  root.VdearCVD = {
    series: series,
    pivots: pivots,
    divergences: divergences,
    detect: detect,
  };
})(typeof self !== 'undefined' ? self : this);
