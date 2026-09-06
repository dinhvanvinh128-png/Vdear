/*
 * Vdearypto — MÔ PHỎNG CHUỖI THANH LÝ.
 *
 * ĐỌC KỸ ĐOẠN NÀY TRƯỚC KHI SỬA
 * -----------------------------
 * Module này KHÔNG có dữ liệu thanh lý thật. Không sàn nào công bố miễn phí
 * vị thế của từng người dùng, nên không ai — kể cả các trang bản đồ thanh lý
 * nổi tiếng — biết thật sự có bao nhiêu USD sẽ bị thanh lý ở mức giá nào.
 * Thứ tính được ở đây là HỆ QUẢ CỦA MỘT MÔ HÌNH GIẢ ĐỊNH:
 *
 *   "nếu Open Interest hiện tại được mở ra theo phân bố khối lượng của N nến
 *    gần nhất, và nếu đòn bẩy phân bố theo tỉ lệ người dùng đặt, thì các mức
 *    giá thanh lý sẽ rơi vào đâu"
 *
 * Ba chữ "nếu" đó là toàn bộ mô hình. Đổi giả định thì kết quả đổi theo. Vì
 * vậy mọi thứ module này trả ra đều mang kèm `assumptions`, và giao diện có
 * nghĩa vụ in cảnh báo NGAY CẠNH biểu đồ chứ không giấu trong tooltip.
 *
 * Ba con số duy nhất trong đây là dữ liệu thật, không phải mô hình:
 *   · Open Interest (Binance /fapi/v1/openInterest)
 *   · giá và khối lượng từng nến (dùng để suy giá vào lệnh)
 *   · sổ lệnh (Binance /fapi/v1/depth) — dùng để ước tính giá bị đẩy đi bao xa
 * Phần còn lại là suy diễn. Tên hàm và tên trường cố gắng nói rõ chỗ nào là
 * dữ liệu, chỗ nào là giả định.
 */
(function () {
  'use strict';

  /* --------------------------- giả định mặc định ------------------------ */

  // Phân bố đòn bẩy mặc định theo yêu cầu. Đây là CON SỐ GIẢ ĐỊNH, không phải
  // thống kê đo được từ sàn — giao diện cho người dùng chỉnh.
  var LEVERAGE_DEFAULT = [
    { lev: 10, share: 0.40 },
    { lev: 20, share: 0.30 },
    { lev: 50, share: 0.20 },
    { lev: 100, share: 0.10 },
  ];

  // Tỉ lệ ký quỹ duy trì. Binance chia theo bậc giá trị vị thế (0.4% ở bậc
  // thấp nhất của BTC, cao dần theo quy mô). Một số duy nhất là xấp xỉ, nên
  // để chỉnh được và luôn báo ra ngoài trong `assumptions`.
  var MMR_DEFAULT = 0.005;

  // Cửa sổ giá quanh giá hiện tại mà bản đồ cụm bao phủ. Ngoài ±25% thì các
  // cụm gần như chỉ còn đòn bẩy thấp và không ai giao dịch theo chúng.
  var BAND_PCT_DEFAULT = 25;

  // Độ rộng mỗi ô của bản đồ, tính theo phần trăm giá. 0.25% cho ra 200 ô
  // trong dải ±25% — đủ mịn để thấy cụm, đủ thô để không thành nhiễu.
  var BIN_PCT_DEFAULT = 0.25;

  // Một mức giá bị coi là "ngưỡng nguy hiểm" khi chuỗi thanh lý nó châm ngòi
  // đẩy giá đi thêm ít nhất ngần này phần trăm SO VỚI CHÍNH NÓ, qua ít nhất
  // hai vòng (vòng đầu phải kích hoạt được vòng sau).
  var CHAIN_MIN_PCT = 1.0;
  var CHAIN_MIN_ROUNDS = 2;

  var MAX_ROUNDS = 40;

  function num(x) {
    if (x == null || x === '') return null;
    var n = Number(x);
    return Number.isFinite(n) ? n : null;
  }

  /* ---------------------------- giá thanh lý ---------------------------- */

  /*
   * Vị thế linear USDT, ký quỹ cô lập, BỎ QUA phí và phí funding đã trả.
   *
   *   long:  ký quỹ + (P − E)·Q = mmr·P·Q  ->  P = E(1 − 1/L) / (1 − mmr)
   *   short: ký quỹ + (E − P)·Q = mmr·P·Q  ->  P = E(1 + 1/L) / (1 + mmr)
   *
   * Bỏ phí ra ngoài làm con số hơi LẠC QUAN: thanh lý thật xảy ra sớm hơn một
   * chút. Ghi ở đây để không ai đọc kết quả như một mức giá chính xác.
   */
  function liqPrice(entry, lev, side, mmr) {
    var e = num(entry), l = num(lev);
    var m = num(mmr);
    if (m == null) m = MMR_DEFAULT;
    if (e == null || l == null || e <= 0 || l <= 1) return null;
    if (side === 'short') return e * (1 + 1 / l) / (1 + m);
    return e * (1 - 1 / l) / (1 - m);
  }

  /* ------------------- giá vào lệnh suy từ khối lượng -------------------- */

  /*
   * Không ai biết vị thế đang mở được vào ở giá nào. Giả định dùng ở đây:
   * lượng vị thế mở ra ở mỗi nến TỈ LỆ với khối lượng giao dịch của nến đó, và
   * giá vào lệnh của phần ấy là VWAP của chính nến đó.
   *
   * VWAP lấy từ quoteVolume/volume khi sàn có trả — đó là số THẬT. Thiếu thì
   * mới rơi về giá điển hình (H+L+C)/3, và bản ghi được đánh dấu `approx` để
   * giao diện biết mà nói.
   */
  function entryBuckets(candles) {
    var rows = [];
    var total = 0;
    var approx = 0;
    for (var i = 0; i < (candles || []).length; i++) {
      var c = candles[i];
      var v = num(c && c.volume);
      if (v == null || v <= 0) continue;
      var q = num(c && c.quote);
      var price;
      if (q != null && q > 0) {
        price = q / v;
      } else {
        var h = num(c.high), l = num(c.low), cl = num(c.close);
        if (h == null || l == null || cl == null) continue;
        price = (h + l + cl) / 3;
        approx++;
      }
      if (!(price > 0)) continue;
      rows.push({ price: price, volume: v, t: num(c.time) });
      total += v;
    }
    if (!rows.length || total <= 0) return { rows: [], approx: 0, exact: 0 };
    for (var j = 0; j < rows.length; j++) rows[j].weight = rows[j].volume / total;
    return { rows: rows, approx: approx, exact: rows.length - approx };
  }

  /* ---------------------------- bản đồ cụm ------------------------------ */

  function normLeverage(list) {
    var out = [];
    var sum = 0;
    for (var i = 0; i < (list || []).length; i++) {
      var lev = num(list[i] && list[i].lev);
      var share = num(list[i] && list[i].share);
      if (lev == null || share == null || lev <= 1 || share <= 0) continue;
      out.push({ lev: lev, share: share });
      sum += share;
    }
    if (!out.length) return null;
    // Chuẩn hoá về tổng 1: người dùng gõ 40/30/20/10 hay 0.4/0.3/0.2/0.1 đều
    // ra cùng kết quả, và tổng lệch 97% không âm thầm làm hụt 3% Open Interest.
    for (var j = 0; j < out.length; j++) out[j].share = out[j].share / sum;
    return { rows: out, rawSum: sum };
  }

  /*
   * Bản đồ cụm thanh lý.
   *
   * opts: { oiUsd, price, candles, longShare, leverage, mmr, bandPct, binPct }
   *
   * `longShare` là tỉ trọng Open Interest thuộc phía long (0..1). Nếu không
   * truyền thì KHÔNG mặc định 0.5 âm thầm — hàm vẫn dùng 0.5 nhưng bật cờ
   * `assumptions.longShareAssumed` để giao diện nói rõ.
   */
  function clusterMap(opts) {
    var o = opts || {};
    var oiUsd = num(o.oiUsd);
    var price = num(o.price);
    if (oiUsd == null || price == null || oiUsd <= 0 || price <= 0) return null;

    var lev = normLeverage(o.leverage || LEVERAGE_DEFAULT);
    if (!lev) return null;

    var entries = entryBuckets(o.candles);
    if (!entries.rows.length) return null;

    var mmr = num(o.mmr);
    if (mmr == null) mmr = MMR_DEFAULT;
    var bandPct = num(o.bandPct) || BAND_PCT_DEFAULT;
    var binPct = num(o.binPct) || BIN_PCT_DEFAULT;

    var longShareGiven = num(o.longShare);
    var longShare = longShareGiven == null ? 0.5 : Math.max(0, Math.min(1, longShareGiven));

    var lo = price * (1 - bandPct / 100);
    var hi = price * (1 + bandPct / 100);
    var step = price * (binPct / 100);
    var n = Math.max(1, Math.ceil((hi - lo) / step));

    var bins = new Array(n);
    for (var b = 0; b < n; b++) {
      bins[b] = {
        lo: lo + b * step, hi: lo + (b + 1) * step,
        mid: lo + (b + 0.5) * step,
        longUsd: 0, shortUsd: 0,
      };
    }
    function put(p, usd, side) {
      if (p == null || !(p > 0) || !(usd > 0)) return 0;
      var idx = Math.floor((p - lo) / step);
      if (idx < 0 || idx >= n) return 0;         // ngoài dải: bỏ, có đếm riêng
      if (side === 'short') bins[idx].shortUsd += usd; else bins[idx].longUsd += usd;
      return usd;
    }

    var placedLong = 0, placedShort = 0, outside = 0;
    for (var i = 0; i < entries.rows.length; i++) {
      var e = entries.rows[i];
      for (var k = 0; k < lev.rows.length; k++) {
        var L = lev.rows[k];
        var longUsd = oiUsd * longShare * e.weight * L.share;
        var shortUsd = oiUsd * (1 - longShare) * e.weight * L.share;
        var pl = put(liqPrice(e.price, L.lev, 'long', mmr), longUsd, 'long');
        var ps = put(liqPrice(e.price, L.lev, 'short', mmr), shortUsd, 'short');
        placedLong += pl; placedShort += ps;
        outside += (longUsd - pl) + (shortUsd - ps);
      }
    }

    return {
      bins: bins,
      price: price, lo: lo, hi: hi, step: step, binPct: binPct, bandPct: bandPct,
      totalLongUsd: placedLong,
      totalShortUsd: placedShort,
      // USD rơi ra ngoài dải hiển thị. Không im lặng nuốt mất: nếu con số này
      // lớn thì bản đồ đang bỏ sót phần lớn vị thế và người đọc phải biết.
      outsideBandUsd: outside,
      assumptions: {
        oiUsd: oiUsd,
        longShare: longShare,
        longShareAssumed: longShareGiven == null,
        leverage: lev.rows,
        mmr: mmr,
        entryCandles: entries.rows.length,
        vwapExact: entries.exact,
        vwapApprox: entries.approx,
        feesIgnored: true,
      },
    };
  }

  /* ----------------------- áp lực thanh lý ròng ------------------------- */

  /*
   * So tổng USD cụm LONG nằm DƯỚI giá hiện tại với tổng USD cụm SHORT nằm TRÊN
   * giá hiện tại — đó là hai phía có thể bị quét. Cụm long nằm trên giá hiện
   * tại là vị thế đã lỗ quá mức lẽ ra bị thanh lý rồi, nên không tính.
   *
   * skew ∈ [−1, 1]: dương = nhiều USD long chờ bị quét phía dưới hơn.
   */
  function netPressure(map, withinPct) {
    if (!map || !map.bins) return null;
    var band = num(withinPct);
    var price = map.price;
    var below = 0, above = 0;
    for (var i = 0; i < map.bins.length; i++) {
      var b = map.bins[i];
      if (band != null) {
        var d = Math.abs(b.mid - price) / price * 100;
        if (d > band) continue;
      }
      if (b.mid < price) below += b.longUsd;
      else if (b.mid > price) above += b.shortUsd;
    }
    var sum = below + above;
    return {
      belowUsd: below, aboveUsd: above,
      // Tổng bằng 0 thì KHÔNG trả skew 0: "cân bằng" và "không có dữ liệu" là
      // hai phát biểu khác nhau.
      skew: sum > 0 ? (below - above) / sum : null,
      withinPct: band,
    };
  }

  /* ----------------------------- sổ lệnh -------------------------------- */

  /*
   * Chuẩn hoá sổ lệnh Binance: bids giảm dần, asks tăng dần, mỗi mức là
   * [giá, số lượng] dạng CHUỖI. Quy ra USD ngay tại đây (giá × số lượng) vì
   * mọi thứ phía sau tính bằng USD.
   */
  function normBook(raw) {
    function side(rows, dir) {
      var out = [];
      for (var i = 0; i < (rows || []).length; i++) {
        var p = num(rows[i] && rows[i][0]);
        var q = num(rows[i] && rows[i][1]);
        if (p == null || q == null || p <= 0 || q <= 0) continue;
        out.push({ price: p, qty: q, usd: p * q });
      }
      out.sort(function (a, b) { return dir > 0 ? a.price - b.price : b.price - a.price; });
      return out;
    }
    var bids = side(raw && raw.bids, -1);
    var asks = side(raw && raw.asks, 1);
    if (!bids.length && !asks.length) return null;
    return { bids: bids, asks: asks };
  }

  /*
   * Đẩy `usd` lệnh thị trường vào một phía sổ lệnh, trả về giá dừng lại.
   *
   * KHÔNG NGOẠI SUY QUÁ SỔ LỆNH. Sổ lệnh công khai chỉ sâu vài phần trăm.
   * Khi lượng bán ăn hết sổ, thứ duy nhất biết chắc là "giá ít nhất xuống tới
   * đáy sổ nhìn thấy được"; đi tiếp bao xa thì dữ liệu công khai không trả lời
   * được. Bản trước ngoại suy tuyến tính theo mật độ đo được và cho ra những
   * con số như +438%/năm — đúng phép chia, vô nghĩa với thị trường, và đủ để
   * người đọc mất tin vào cả trang. Nên bây giờ: dừng ở mép sổ, bật cờ
   * `exhausted`, và để giao diện nói "ít nhất chừng này, xa hơn thì không ước
   * tính được".
   */
  function absorb(levels, fromPrice, usd, dir) {
    var need = num(usd);
    var start = num(fromPrice);
    if (!levels || !levels.length || need == null || start == null || need <= 0) {
      return { price: start, filledUsd: 0, exhausted: false };
    }
    var filled = 0, last = start, i = 0;
    for (; i < levels.length; i++) {
      var lv = levels[i];
      // Chỉ tính các mức nằm đúng phía so với giá bắt đầu.
      if (dir < 0 && lv.price > start) continue;
      if (dir > 0 && lv.price < start) continue;
      if (filled + lv.usd >= need) {
        // Khớp một phần mức này: nội suy tuyến tính trong lòng mức.
        var frac = (need - filled) / lv.usd;
        var prev = last;
        last = prev + (lv.price - prev) * frac;
        return { price: last, filledUsd: need, exhausted: false };
      }
      filled += lv.usd;
      last = lv.price;
    }
    // Hết sổ nhìn thấy được. Dừng ở đây và nói ra.
    return { price: last, filledUsd: filled, exhausted: true };
  }

  /* -------------------------- vòng lặp dây chuyền ----------------------- */

  /*
   * Bắt đầu từ `startPrice`, đi theo hướng `dir` (−1 xuống / +1 lên):
   *   1. thu mọi cụm bị vượt qua trên đường đi -> tổng USD bị thanh lý,
   *   2. đẩy chừng ấy USD vào sổ lệnh -> giá mới,
   *   3. nếu giá mới lại vượt thêm cụm nữa thì lặp.
   * Dừng khi một vòng không kích hoạt thêm cụm nào, hoặc chạm MAX_ROUNDS.
   *
   * Mỗi cụm chỉ được tính MỘT LẦN (đánh dấu đã dùng). Không có chỗ này thì
   * vòng lặp tự nuôi chính nó và ra con số vô hạn.
   */
  function cascade(map, book, opts) {
    if (!map || !map.bins) return null;
    var o = opts || {};
    var dir = o.dir === 1 ? 1 : -1;
    var start = num(o.startPrice);
    if (start == null) start = map.price;
    var maxRounds = num(o.maxRounds) || MAX_ROUNDS;
    var levels = dir < 0 ? (book && book.bids) : (book && book.asks);

    // `frontier` là mức xa nhất giá đã tới. Mỗi vòng chỉ thu các cụm nằm giữa
    // frontier cũ và mức mới — nhờ vậy một cụm không bao giờ bị tính hai lần,
    // thứ mà nếu thiếu sẽ khiến vòng lặp tự nuôi mình và ra số vô hạn.
    // Cửa sổ [frontier, target] của hai vòng liên tiếp DÙNG CHUNG mức biên, nên
    // riêng frontier không đủ: ô nằm đúng ở biên sẽ bị thu hai lần và tổng USD
    // thanh lý phình lên gấp đôi. `used` là thứ chặn điều đó.
    var used = {};
    var frontier = map.price;
    var price = map.price;
    var steps = [];
    var totalUsd = 0;
    var exhausted = false;
    var stop = 'no-more';
    var target = start;

    for (var round = 0; round < maxRounds; round++) {
      var hit = 0;
      for (var i = 0; i < map.bins.length; i++) {
        if (used[i]) continue;
        var mid = map.bins[i].mid;
        var inWindow = dir < 0
          ? (mid <= frontier && mid >= target)
          : (mid >= frontier && mid <= target);
        if (!inWindow) continue;
        var usd = dir < 0 ? map.bins[i].longUsd : map.bins[i].shortUsd;
        used[i] = 1;
        if (usd > 0) hit += usd;
      }
      frontier = target;
      price = target;
      if (!(hit > 0)) { stop = round === 0 ? 'no-trigger' : 'no-more'; break; }

      var res = absorb(levels, price, hit, dir);
      totalUsd += hit;
      var next = res.price;
      if (res.exhausted) exhausted = true;

      if (next == null || !(next > 0) || (dir < 0 ? next >= price : next <= price)) {
        steps.push({ round: round + 1, liquidatedUsd: hit, from: price, to: price,
          exhausted: !!res.exhausted });
        stop = 'no-depth';
        break;
      }
      steps.push({ round: round + 1, liquidatedUsd: hit, from: price, to: next,
        exhausted: !!res.exhausted });
      target = next;
      if (round === maxRounds - 1) { price = next; stop = 'max-rounds'; }
    }

    return {
      dir: dir, startPrice: start, finalPrice: price,
      // Đi thêm bao nhiêu SO VỚI mức châm ngòi — không phải so với giá hiện
      // tại. Đây là con số trả lời "chạm vào đây thì trượt thêm bao xa".
      movePct: start > 0 ? (price - start) / start * 100 : null,
      totalLiquidatedUsd: totalUsd,
      rounds: steps.length, steps: steps, stop: stop,
      // `exhausted` = lượng bán ăn hết sổ lệnh nhìn thấy được. Độ trượt báo ra
      // lúc đó là CHẶN DƯỚI, không phải ước lượng.
      exhausted: exhausted,
      // Không có sổ lệnh thì nói thẳng, đừng vẽ ra một chuỗi bịa.
      hasBook: !!(levels && levels.length),
    };
  }


  /* -------------------------- ngưỡng nguy hiểm -------------------------- */

  /*
   * ĐỊNH NGHĨA (bắt buộc phải có công thức, không được là một con số cảm tính):
   *
   *   Một mức giá P là "ngưỡng nguy hiểm" khi chuỗi thanh lý bắt đầu từ P
   *   chạy được ít nhất CHAIN_MIN_ROUNDS vòng VÀ đẩy giá đi thêm ít nhất
   *   CHAIN_MIN_PCT phần trăm so với chính P.
   *
   * Quét từ giá hiện tại đi ra, mỗi ô một lần, trả về ô gần nhất thoả điều
   * kiện cho mỗi phía. Không tìm thấy thì trả null — KHÔNG hạ ngưỡng xuống cho
   * bằng được để lúc nào cũng có một con số hiện ra.
   */
  function dangerLevel(map, book, dir, opts) {
    if (!map || !map.bins) return null;
    var o = opts || {};
    var minPct = num(o.minPct);
    if (minPct == null) minPct = CHAIN_MIN_PCT;
    var minRounds = num(o.minRounds) || CHAIN_MIN_ROUNDS;

    var idxs = [];
    for (var i = 0; i < map.bins.length; i++) {
      var b = map.bins[i];
      var usd = dir < 0 ? b.longUsd : b.shortUsd;
      if (!(usd > 0)) continue;
      if (dir < 0 && b.mid >= map.price) continue;
      if (dir > 0 && b.mid <= map.price) continue;
      idxs.push(i);
    }
    // Gần giá hiện tại trước: cú chạm đầu tiên mới là cú đáng lo.
    idxs.sort(function (x, y) {
      return Math.abs(map.bins[x].mid - map.price) - Math.abs(map.bins[y].mid - map.price);
    });

    for (var k = 0; k < idxs.length; k++) {
      var mid = map.bins[idxs[k]].mid;
      var c = cascade(map, book, { dir: dir, startPrice: mid, maxRounds: MAX_ROUNDS });
      if (!c || c.rounds < minRounds) continue;
      var extra = Math.abs(c.movePct == null ? 0 : c.movePct);
      if (extra + 1e-9 < minPct) continue;
      return {
        price: mid,
        fromCurrentPct: (mid - map.price) / map.price * 100,
        cascade: c,
        minPct: minPct, minRounds: minRounds,
      };
    }
    return null;
  }

  /* ------------------------------ mật độ -------------------------------- */

  // Ô đậm nhất để giao diện chuẩn hoá gradient. Trả cả hai phía riêng.
  function peak(map) {
    if (!map || !map.bins) return null;
    var mx = 0;
    for (var i = 0; i < map.bins.length; i++) {
      var b = map.bins[i];
      if (b.longUsd > mx) mx = b.longUsd;
      if (b.shortUsd > mx) mx = b.shortUsd;
    }
    return mx > 0 ? mx : null;
  }

  window.VdearLiq = {
    LEVERAGE_DEFAULT: LEVERAGE_DEFAULT,
    MMR_DEFAULT: MMR_DEFAULT,
    BAND_PCT_DEFAULT: BAND_PCT_DEFAULT,
    BIN_PCT_DEFAULT: BIN_PCT_DEFAULT,
    CHAIN_MIN_PCT: CHAIN_MIN_PCT,
    CHAIN_MIN_ROUNDS: CHAIN_MIN_ROUNDS,
    liqPrice: liqPrice,
    entryBuckets: entryBuckets,
    normLeverage: normLeverage,
    clusterMap: clusterMap,
    netPressure: netPressure,
    normBook: normBook,
    absorb: absorb,
    cascade: cascade,
    dangerLevel: dangerLevel,
    peak: peak,
  };
})();
