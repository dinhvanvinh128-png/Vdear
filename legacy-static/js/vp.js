/*
 * Vdearypto — VOLUME PROFILE: POC, Value Area 70%, LVN.
 *
 * Thuần tính: không DOM, không mạng.
 *
 * HAI NGUỒN, HAI ĐỘ TIN CẬY KHÁC NHAU — KHÔNG ĐƯỢC TRỘN
 * -----------------------------------------------------
 *   'tape'   — dựng từ lệnh khớp thật (bản đồ giá→khối lượng của js/tape.js).
 *              Đây là phân bố khối lượng THẬT theo giá.
 *   'candle' — dựng từ nến, bằng cách rải khối lượng của mỗi nến đều trên dải
 *              cao–thấp của nó. Đây là XẤP XỈ: thị trường không giao dịch đều
 *              trên toàn dải nến, và cách rải đều luôn làm phẳng các đỉnh khối
 *              lượng thật.
 *
 * Mọi profile trả ra đều mang trường `source`, và giao diện có nghĩa vụ nói rõ
 * mình đang xem cái nào. Trộn hai nguồn vào một hình rồi gọi chung là "volume
 * profile" là biến một xấp xỉ thành một phép đo.
 */
(function (root) {
  'use strict';

  // Value Area theo quy ước Market Profile: 70% khối lượng quanh POC.
  var VALUE_AREA = 0.70;

  // Ô có khối lượng dưới ngần này lần khối lượng TRUNG BÌNH của các ô có giao
  // dịch thì coi là vùng thanh khoản mỏng (LVN). Ngưỡng phải nói ra được, nếu
  // không "LVN" chỉ là một cái tên gán cho vài ô nhìn thấp.
  var LVN_RATIO = 0.35;

  function num(x) {
    if (x == null || x === '') return null;
    var n = Number(x);
    return Number.isFinite(n) ? n : null;
  }

  /* --------------------------- dựng từ tape ----------------------------- */

  /*
   * Gộp `levels` (giá đã lượng tử -> khối lượng) của nhiều bucket thành một
   * profile. Bước giá được lượng tử hoá LẠI theo dải giá chung, vì mỗi bucket
   * có bước riêng theo dải của chính nó.
   */
  function fromTape(buckets, opts) {
    var o = opts || {};
    var Tape = root.VdearTape;
    var lo = null, hi = null;
    var list = buckets || [];
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (b.low != null && (lo == null || b.low < lo)) lo = b.low;
      if (b.high != null && (hi == null || b.high > hi)) hi = b.high;
    }
    if (lo == null || hi == null) return null;

    var step = num(o.step);
    if (step == null && Tape) {
      step = Tape.priceStep(o.tickSize, Math.max(hi - lo, num(o.tickSize) || 0), o.maxLevels);
    }
    if (step == null || step <= 0) return null;

    var bins = {};
    var total = 0;
    for (var k = 0; k < list.length; k++) {
      var lv = list[k].levels || {};
      for (var price in lv) {
        if (!Object.prototype.hasOwnProperty.call(lv, price)) continue;
        var q = num(lv[price]);
        if (q == null || q <= 0) continue;
        var key = Tape ? Tape.quantize(Number(price), step)
          : Math.floor(Number(price) / step) * step;
        bins[key] = (bins[key] || 0) + q;
        total += q;
      }
    }
    return build(bins, step, total, 'tape');
  }

  /* -------------------------- dựng từ nến (xấp xỉ) ---------------------- */

  /*
   * Rải khối lượng mỗi nến ĐỀU trên dải cao–thấp của nó.
   *
   * Đây là cách xấp xỉ tiêu chuẩn khi không có dữ liệu theo lệnh khớp, và nó
   * có một thiên lệch biết trước: khối lượng thật dồn quanh vùng giá đóng cửa
   * và các vùng giằng co, còn cách rải đều thì làm phẳng hết. POC tính từ đây
   * đáng tin ở mức "vùng nào đông", không đáng tin ở mức "đúng mức giá nào".
   */
  function fromCandles(candles, opts) {
    var o = opts || {};
    var Tape = root.VdearTape;
    var list = (candles || []).filter(function (c) {
      return num(c.high) != null && num(c.low) != null && num(c.volume) != null;
    });
    if (!list.length) return null;

    var lo = null, hi = null;
    for (var i = 0; i < list.length; i++) {
      if (lo == null || list[i].low < lo) lo = list[i].low;
      if (hi == null || list[i].high > hi) hi = list[i].high;
    }
    var step = num(o.step);
    if (step == null) {
      var want = num(o.buckets) || 90;
      step = (hi - lo) / want;
    }
    if (!(step > 0)) return null;

    var bins = {}, total = 0;
    for (var k = 0; k < list.length; k++) {
      var c = list[k];
      var v = num(c.volume);
      if (v == null || v <= 0) continue;
      var from = Math.floor(c.low / step), to = Math.floor(c.high / step);
      var n = Math.max(1, to - from + 1);
      var share = v / n;
      for (var b = from; b <= to; b++) {
        var key = Math.round(b * step * 1e12) / 1e12;
        bins[key] = (bins[key] || 0) + share;
        total += share;
      }
    }
    return build(bins, step, total, 'candle');
  }

  /* ---------------------------- POC / VA / LVN -------------------------- */

  function build(bins, step, total, source) {
    var rows = [];
    for (var price in bins) {
      if (!Object.prototype.hasOwnProperty.call(bins, price)) continue;
      rows.push({ price: Number(price), vol: bins[price] });
    }
    if (!rows.length || !(total > 0)) return null;
    rows.sort(function (a, b) { return a.price - b.price; });

    // POC: ô khối lượng lớn nhất.
    var pocIdx = 0;
    for (var i = 1; i < rows.length; i++) if (rows[i].vol > rows[pocIdx].vol) pocIdx = i;

    /*
     * Value Area: bắt đầu từ POC, mỗi bước nhìn HAI ô kề hai bên và lấy bên
     * nào đông hơn, cho tới khi gom đủ 70% tổng khối lượng.
     *
     * (Quy ước gốc của Market Profile lấy hai ô một lượt; ở đây lấy từng ô một
     * và so hai bên — cùng kết quả trên dữ liệu mịn, và không bị lệch khi số ô
     * còn lại ở một bên là lẻ.)
     */
    var need = total * VALUE_AREA;
    var acc = rows[pocIdx].vol;
    var lo = pocIdx, hi = pocIdx;
    var guard = 0;
    while (acc < need && (lo > 0 || hi < rows.length - 1) && guard++ < rows.length * 2) {
      var below = lo > 0 ? rows[lo - 1].vol : -1;
      var above = hi < rows.length - 1 ? rows[hi + 1].vol : -1;
      if (above >= below) { hi++; acc += rows[hi].vol; }
      else { lo--; acc += rows[lo].vol; }
    }

    // LVN: ô có giao dịch nhưng thưa hẳn so với trung bình.
    var traded = rows.filter(function (r) { return r.vol > 0; });
    var mean = traded.reduce(function (s, r) { return s + r.vol; }, 0) / traded.length;
    var lvn = rows.filter(function (r) { return r.vol > 0 && r.vol < mean * LVN_RATIO; })
      .map(function (r) { return r.price; });

    return {
      source: source,
      // 'candle' là XẤP XỈ. Cờ này đi kèm ra tới giao diện.
      approximate: source === 'candle',
      rows: rows,
      step: step,
      total: total,
      poc: rows[pocIdx].price,
      pocVol: rows[pocIdx].vol,
      val: rows[lo].price,
      vah: rows[hi].price,
      vaVolume: acc,
      vaShare: acc / total,
      lvn: lvn,
      lvnRatio: LVN_RATIO,
      valueArea: VALUE_AREA,
      max: rows[pocIdx].vol,
    };
  }

  /* ------------------------ đối chiếu với vùng S&R ---------------------- */

  /*
   * Một mức giá nằm gần POC / VAH / VAL hay nằm trong vùng LVN?
   *
   * `tolPct` là bán kính coi là "trùng", tính theo % giá. Không có tham số này
   * thì "trùng POC" là một phát biểu cảm tính.
   *
   * Trả về MỘT trong ba trạng thái, không trộn:
   *   'hvn'  — trùng POC hoặc biên Value Area: vùng đông người giao dịch.
   *   'lvn'  — nằm trong vùng thưa: giá thường đi xuyên nhanh.
   *   null   — không rơi vào đâu cả.
   */
  function classifyLevel(profile, price, tolPct) {
    var p = num(price);
    if (!profile || p == null) return null;
    var tol = num(tolPct);
    if (tol == null || tol <= 0) tol = 0.35;
    var r = p * tol / 100;

    if (Math.abs(p - profile.poc) <= r) {
      return { kind: 'hvn', at: 'poc', price: profile.poc, source: profile.source };
    }
    if (Math.abs(p - profile.vah) <= r) {
      return { kind: 'hvn', at: 'vah', price: profile.vah, source: profile.source };
    }
    if (Math.abs(p - profile.val) <= r) {
      return { kind: 'hvn', at: 'val', price: profile.val, source: profile.source };
    }
    for (var i = 0; i < profile.lvn.length; i++) {
      if (Math.abs(p - profile.lvn[i]) <= r) {
        return { kind: 'lvn', at: 'lvn', price: profile.lvn[i], source: profile.source };
      }
    }
    return null;
  }

  /*
   * BẬC TIN CẬY từ Volume Profile.
   *
   * Đây KHÔNG phải điều kiện hội tụ thứ sáu. Thang hội tụ hiện tại đếm 5 điều
   * kiện và mọi con số winrate lịch sử đều dựng trên thang 5 đó; thêm một điều
   * kiện vào phép đếm là âm thầm đổi ý nghĩa của cả thang cũ, và bảng thống kê
   * ở /stats sẽ nói về một chiến lược không còn tồn tại.
   *
   * Thay vào đó nó là một BẬC RIÊNG, đọc kèm chứ không cộng vào:
   *   +1 vùng S&R trùng POC/VAH/VAL  -> giá đã dừng ở đó nhiều lần
   *   −1 vùng S&R nằm trong LVN      -> giá thường đi xuyên nhanh, đặt SL ở
   *                                     đây dễ bị quét mà không có ai đỡ
   *    0 không rơi vào đâu cả
   */
  function confidenceTier(profile, levels, tolPct) {
    if (!profile || !levels || !levels.length) {
      return { tier: 0, hits: [], reason: 'no-data', source: profile ? profile.source : null };
    }
    var hits = [];
    var score = 0;
    for (var i = 0; i < levels.length; i++) {
      var c = classifyLevel(profile, levels[i], tolPct);
      if (!c) continue;
      hits.push({ price: levels[i], kind: c.kind, at: c.at });
      score += c.kind === 'hvn' ? 1 : -1;
    }
    return {
      tier: score > 0 ? 1 : score < 0 ? -1 : 0,
      score: score,
      hits: hits,
      source: profile.source,
      approximate: !!profile.approximate,
      // Không bao giờ cộng vào `confluence`. Trường này chỉ để giao diện đọc.
      separateFromConfluence: true,
    };
  }

  root.VdearVP = {
    VALUE_AREA: VALUE_AREA,
    LVN_RATIO: LVN_RATIO,
    fromTape: fromTape,
    fromCandles: fromCandles,
    classifyLevel: classifyLevel,
    confidenceTier: confidenceTier,
    _build: build,
  };
})(typeof self !== 'undefined' ? self : this);
