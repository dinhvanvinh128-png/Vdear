/*
 * Vdearypto — TẦNG DỮ LIỆU THEO LỆNH KHỚP (trade-level tape).
 *
 * Đây là phần thuần tính của docs/TRADE-DATA-ARCHITECTURE.md. Không WebSocket,
 * không DOM, không mạng — để chạy được cả trong Web Worker và kiểm được bằng
 * node:test.
 *
 * BỐN QUYẾT ĐỊNH THIẾT KẾ, MỖI CÁI CHỐNG MỘT LOẠI LỖI IM LẶNG
 * -----------------------------------------------------------
 * 1. `delta` và `totalVol` là SỐ DẪN XUẤT, không lưu. Lưu cả ba (buy, sell,
 *    delta) thì sớm muộn sẽ có lúc delta ≠ buy − sell sau một lần sửa nào đó,
 *    và không ai phát hiện ra vì cả ba đều "có vẻ đúng".
 *
 * 2. Bước giá suy từ TICK SIZE của chính cặp đó, có trần MAX_LEVELS. Gõ cứng
 *    một bước giá thì BTC (tick 0,1) và một memecoin (tick 0,0000001) không thể
 *    dùng chung. Trần số mức là để một coin tick nhỏ không sinh ra hàng triệu ô.
 *
 * 3. Gộp bucket lên khung lớn phải LƯỢNG TỬ HOÁ LẠI các mức giá. Cộng thẳng
 *    map của các bucket 1 phút cho ra một map có bước giá của khung 1 phút
 *    nhưng mang nhãn khung 1 giờ — nhìn thì vẫn ra hình, mà mọi mức POC/VAH/VAL
 *    tính trên đó đều lệch.
 *
 * 4. Khử trùng theo `aggTradeId`, KHÔNG theo thời gian. Nhiều lệnh khớp trong
 *    cùng một mili giây là chuyện bình thường; lọc theo thời gian sẽ ăn mất
 *    lệnh thật. Bù dữ liệu sau khi mất kết nối chồng lấn là chuyện chắc chắn
 *    xảy ra, nên khử trùng phải đúng.
 */
(function (root) {
  'use strict';

  // Trần bộ nhớ: số bucket 1 phút giữ lại cho mỗi cặp. 1440 = một ngày.
  // Vượt trần thì bucket cũ nhất bị dọn, không chờ ai gọi.
  var MAX_BUCKETS = 1440;

  // Trần số mức giá trong một bucket. Coin tick nhỏ mà giá chạy rộng có thể
  // sinh ra hàng trăm nghìn mức; gộp thô lại còn chừng này.
  var MAX_LEVELS = 600;

  function num(x) {
    if (x == null || x === '') return null;
    var n = Number(x);
    return Number.isFinite(n) ? n : null;
  }

  /* ------------------------------ bước giá ------------------------------ */

  /*
   * Bước giá của bản đồ khối lượng.
   *
   * Xuất phát từ tickSize của cặp, rồi nhân lên theo luỹ thừa 10 cho tới khi
   * số mức trong dải giá nằm dưới trần. Chỉ nhân theo 1 / 2 / 5 / 10 để bước
   * giá luôn là một con số người đọc nhận ra được (0,1 · 0,2 · 0,5 · 1 …),
   * không phải 0,37.
   */
  var STEP_MULTIPLIERS = [1, 2, 5];

  function priceStep(tickSize, priceRange, maxLevels) {
    var tick = num(tickSize), range = num(priceRange);
    var cap = num(maxLevels) || MAX_LEVELS;
    if (tick == null || tick <= 0) return null;
    if (range == null || range <= 0) return tick;
    var step = tick;
    var guard = 0;
    while (range / step > cap && guard < 60) {
      // 1 -> 2 -> 5 -> 10 -> 20 -> 50 …
      var exp = Math.floor(Math.log10(step / tick) + 1e-9);
      var mantissa = step / (tick * Math.pow(10, exp));
      var idx = STEP_MULTIPLIERS.indexOf(Math.round(mantissa));
      if (idx < 0) { step = tick * Math.pow(10, exp + 1); }
      else if (idx === STEP_MULTIPLIERS.length - 1) {
        step = tick * Math.pow(10, exp + 1);
      } else {
        step = tick * Math.pow(10, exp) * STEP_MULTIPLIERS[idx + 1];
      }
      guard++;
    }
    return step;
  }

  // Quy một mức giá về đáy ô chứa nó. Dùng chỉ số nguyên rồi nhân lại để hai
  // giá bằng nhau luôn ra cùng một khoá, không phụ thuộc thứ tự phép tính.
  function quantize(price, step) {
    var p = num(price), s = num(step);
    if (p == null || s == null || s <= 0) return null;
    return Math.round(Math.floor(p / s + 1e-9) * s * 1e12) / 1e12;
  }

  /* ------------------------------- bucket ------------------------------- */

  function newBucket(t) {
    return {
      t: t,
      buyVol: 0,          // khối lượng bên MUA CHỦ ĐỘNG (taker buy)
      sellVol: 0,         // khối lượng bên BÁN CHỦ ĐỘNG (taker sell)
      buyQuote: 0,        // quy ra USDT, để tính VWAP của chính bucket
      sellQuote: 0,
      trades: 0,
      levels: {},         // giá đã lượng tử -> khối lượng
      step: null,
      open: null, high: null, low: null, close: null,
      firstId: null, lastId: null,
    };
  }

  // delta và tổng khối lượng KHÔNG lưu trong bucket — tính khi cần.
  function delta(b) { return b ? b.buyVol - b.sellVol : null; }
  function totalVol(b) { return b ? b.buyVol + b.sellVol : null; }
  function vwap(b) {
    if (!b) return null;
    var v = b.buyVol + b.sellVol;
    if (!(v > 0)) return null;
    return (b.buyQuote + b.sellQuote) / v;
  }

  /*
   * Một lệnh khớp aggTrade của Binance:
   *   a = aggTradeId, p = giá, q = khối lượng, T = thời điểm, m = buyer là maker
   *
   * m = true  -> người MUA là maker -> lệnh thị trường là lệnh BÁN -> taker sell
   * m = false -> người BÁN là maker -> lệnh thị trường là lệnh MUA -> taker buy
   *
   * Đảo hai chiều này là lỗi kinh điển và nó không hề lộ ra: CVD vẫn vẽ ra một
   * đường đẹp, chỉ là ngược dấu hoàn toàn.
   */
  function isTakerBuy(trade) { return !(trade && trade.m); }

  /* ------------------------------ chuỗi tape ---------------------------- */

  /*
   * `Tape` giữ các bucket 1 phút của MỘT cặp.
   *
   * opts: { tickSize, maxBuckets, maxLevels, bucketMs }
   */
  function createTape(opts) {
    var o = opts || {};
    var bucketMs = num(o.bucketMs) || 60000;
    var maxBuckets = num(o.maxBuckets) || MAX_BUCKETS;
    var maxLevels = num(o.maxLevels) || MAX_LEVELS;
    var tickSize = num(o.tickSize);

    var buckets = [];              // tăng dần theo thời gian
    var byTime = {};
    var seen = {};                 // aggTradeId đã nhận -> chống trùng
    var seenOrder = [];
    var SEEN_CAP = 20000;
    var dropped = 0;               // số lệnh trùng đã bỏ
    var outOfOrder = 0;

    function floorT(ms) { return Math.floor(ms / bucketMs) * bucketMs; }

    function trim() {
      while (buckets.length > maxBuckets) {
        var b = buckets.shift();
        delete byTime[b.t];
      }
    }

    function rememberId(id) {
      seen[id] = 1;
      seenOrder.push(id);
      if (seenOrder.length > SEEN_CAP) {
        var old = seenOrder.splice(0, seenOrder.length - SEEN_CAP);
        for (var i = 0; i < old.length; i++) delete seen[old[i]];
      }
    }

    /*
     * Nạp một lệnh khớp. Trả về true nếu đã tính, false nếu bị bỏ (trùng hoặc
     * dữ liệu hỏng). Bỏ IM LẶNG là không được — số lần bỏ được đếm và trả ra
     * ở stats() để giao diện nói được "đã bỏ N lệnh trùng".
     */
    function push(trade) {
      var p = num(trade && trade.p);
      var q = num(trade && trade.q);
      var t = num(trade && trade.T);
      if (p == null || q == null || t == null || q <= 0 || p <= 0) return false;

      var id = trade.a;
      if (id != null) {
        // Khử trùng theo aggTradeId, KHÔNG theo thời gian: nhiều lệnh trong
        // cùng một mili giây là bình thường.
        if (seen[id]) { dropped++; return false; }
        rememberId(id);
      }

      var key = floorT(t);
      var b = byTime[key];
      if (!b) {
        b = newBucket(key);
        byTime[key] = b;
        if (buckets.length && key < buckets[buckets.length - 1].t) {
          // Lệnh về muộn (hay gặp khi bù dữ liệu). Chèn đúng chỗ thay vì nối
          // vào cuối — nối vào cuối làm chuỗi hết tăng dần và mọi phép cộng
          // dồn phía sau sai thứ tự.
          outOfOrder++;
          var i = buckets.length - 1;
          while (i >= 0 && buckets[i].t > key) i--;
          buckets.splice(i + 1, 0, b);
        } else {
          buckets.push(b);
        }
        trim();
      }

      if (isTakerBuy(trade)) { b.buyVol += q; b.buyQuote += p * q; }
      else { b.sellVol += q; b.sellQuote += p * q; }
      b.trades++;

      if (b.open == null) { b.open = p; b.high = p; b.low = p; }
      if (p > b.high) b.high = p;
      if (p < b.low) b.low = p;
      b.close = p;

      if (b.firstId == null || (id != null && id < b.firstId)) b.firstId = id;
      if (b.lastId == null || (id != null && id > b.lastId)) b.lastId = id;

      // Bước giá của bucket suy từ tick size và dải giá của CHÍNH bucket đó.
      var step = b.step;
      if (step == null) {
        step = priceStep(tickSize, Math.max(b.high - b.low, tickSize || 0), maxLevels) || tickSize;
        b.step = step;
      }
      if (step != null && step > 0) {
        var k = quantize(p, step);
        b.levels[k] = (b.levels[k] || 0) + q;
      }
      return true;
    }

    function stats() {
      return {
        buckets: buckets.length,
        maxBuckets: maxBuckets,
        droppedDuplicates: dropped,
        outOfOrder: outOfOrder,
        from: buckets.length ? buckets[0].t : null,
        to: buckets.length ? buckets[buckets.length - 1].t : null,
      };
    }

    return {
      push: push,
      all: function () { return buckets; },
      at: function (t) { return byTime[floorT(t)] || null; },
      stats: stats,
      bucketMs: bucketMs,
      tickSize: tickSize,
      reset: function () {
        buckets = []; byTime = {}; seen = {}; seenOrder = [];
        dropped = 0; outOfOrder = 0;
      },
    };
  }

  /* ------------------------------- gộp khung ---------------------------- */

  /*
   * Gộp các bucket nhỏ thành bucket khung lớn.
   *
   * `levels` được LƯỢNG TỬ HOÁ LẠI theo bước giá mới, không cộng thẳng. Cộng
   * thẳng cho ra một bản đồ có độ mịn của khung nhỏ nhưng mang nhãn khung lớn:
   * hình vẽ vẫn ra, mà POC/VAH/VAL tính trên đó thì lệch.
   */
  function rollup(buckets, targetMs, opts) {
    var o = opts || {};
    var maxLevels = num(o.maxLevels) || MAX_LEVELS;
    var tickSize = num(o.tickSize);
    var ms = num(targetMs);
    if (!ms || ms <= 0 || !buckets || !buckets.length) return [];

    var out = [], byT = {};
    for (var i = 0; i < buckets.length; i++) {
      var b = buckets[i];
      var key = Math.floor(b.t / ms) * ms;
      var g = byT[key];
      if (!g) {
        g = newBucket(key);
        g.srcLevels = [];
        byT[key] = g;
        out.push(g);
      }
      g.buyVol += b.buyVol; g.sellVol += b.sellVol;
      g.buyQuote += b.buyQuote; g.sellQuote += b.sellQuote;
      g.trades += b.trades;
      if (g.open == null) g.open = b.open;
      if (b.high != null && (g.high == null || b.high > g.high)) g.high = b.high;
      if (b.low != null && (g.low == null || b.low < g.low)) g.low = b.low;
      if (b.close != null) g.close = b.close;
      if (b.firstId != null && (g.firstId == null || b.firstId < g.firstId)) g.firstId = b.firstId;
      if (b.lastId != null && (g.lastId == null || b.lastId > g.lastId)) g.lastId = b.lastId;
      g.srcLevels.push(b.levels);
    }

    out.sort(function (a, c) { return a.t - c.t; });
    for (var k = 0; k < out.length; k++) {
      var gg = out[k];
      var range = (gg.high != null && gg.low != null) ? gg.high - gg.low : 0;
      var step = priceStep(tickSize, Math.max(range, tickSize || 0), maxLevels) || tickSize;
      gg.step = step;
      gg.levels = {};
      if (step != null && step > 0) {
        for (var s = 0; s < gg.srcLevels.length; s++) {
          var src = gg.srcLevels[s];
          for (var price in src) {
            if (!Object.prototype.hasOwnProperty.call(src, price)) continue;
            var qk = quantize(Number(price), step);
            gg.levels[qk] = (gg.levels[qk] || 0) + src[price];
          }
        }
      }
      delete gg.srcLevels;
    }
    return out;
  }

  /* ------------------------------ bù dữ liệu ---------------------------- */

  // Quá ngần này thì không bù nữa mà ĐÁNH DẤU đoạn đó là thiếu. Bù mười tiếng
  // dữ liệu bằng REST là hàng nghìn request, và một chuỗi CVD vá víu nửa vời
  // còn tệ hơn một chuỗi có ghi rõ chỗ đứt.
  var MAX_BACKFILL_MS = 15 * 60 * 1000;

  function backfillPlan(lastSeenMs, nowMs, maxMs) {
    var last = num(lastSeenMs), now = num(nowMs);
    var cap = num(maxMs) || MAX_BACKFILL_MS;
    if (last == null || now == null || now <= last) {
      return { needed: false, gapMs: 0, partial: false };
    }
    var gap = now - last;
    return {
      needed: true,
      gapMs: gap,
      fromMs: last,
      // Quá trần: vẫn bù phần gần nhất, nhưng CÓ CỜ để giao diện nói rõ chuỗi
      // bị thiếu một đoạn thay vì im lặng nối liền hai đầu.
      partial: gap > cap,
      startMs: gap > cap ? now - cap : last,
    };
  }

  root.VdearTape = {
    MAX_BUCKETS: MAX_BUCKETS,
    MAX_LEVELS: MAX_LEVELS,
    MAX_BACKFILL_MS: MAX_BACKFILL_MS,
    priceStep: priceStep,
    quantize: quantize,
    isTakerBuy: isTakerBuy,
    delta: delta,
    totalVol: totalVol,
    vwap: vwap,
    createTape: createTape,
    rollup: rollup,
    backfillPlan: backfillPlan,
    _newBucket: newBucket,
  };
})(typeof self !== 'undefined' ? self : this);
