/*
 * Vdearypto — QUẢN TRỊ VỐN.
 *
 * RÀNG BUỘC ĐẠO ĐỨC CỦA CẢ TỆP NÀY
 * --------------------------------
 * Mọi thứ tính bằng R (bội số rủi ro) và % TÀI KHOẢN. Không có hàm nào ở đây
 * trả về một số tiền lãi tuyệt đối, và không được thêm. Lý do: một trang hiện
 * "lãi 4.200 USD" biến thành công cụ khoe lãi, và người đọc bắt đầu chọn lệnh
 * theo con số to nhất thay vì theo rủi ro.
 *
 * Cũng không có từ nào hứa hẹn: không "chắc thắng", không "tối ưu", không
 * "khuyến nghị vào lệnh". Hàm ở đây trả về con số và điều kiện; câu chữ nằm ở
 * i18n và đều là mô tả trạng thái.
 *
 * Tệp thuần tính toán: không đọc DOM, không gọi mạng.
 */
(function (root) {
  'use strict';

  function num(x) {
    if (x == null || x === '') return null;
    var n = Number(x);
    return Number.isFinite(n) ? n : null;
  }

  /* ============================ 1. KELLY ============================== */

  /*
   * Kelly cho cược nhị phân có tỉ lệ trả R:
   *
   *     f* = W − (1 − W) / R
   *
   * W = tỉ lệ thắng, R = tỉ lệ lãi/lỗ trung bình. f* là PHẦN TÀI KHOẢN đem ra
   * rủi ro, không phải kích thước vị thế.
   *
   * VÌ SAO MẶC ĐỊNH 1/4
   * -------------------
   * Kelly đầy đủ tối đa hoá tốc độ tăng trưởng dài hạn NẾU W và R đúng tuyệt
   * đối. Ở đây W và R là ước lượng từ vài trăm lệnh backtest, sai số không nhỏ.
   * Kelly rất nhạy với sai số W: ước lượng W cao hơn thực tế vài điểm phần trăm
   * là đủ để f* đội lên và chuỗi thua bình thường trở thành cháy tài khoản.
   * Dùng một phần Kelly làm biên an toàn cho chính sai số đó.
   *
   * f* âm nghĩa là kỳ vọng âm: đặt cược cỡ nào cũng thua dài hạn, không có
   * "cỡ nhỏ cho an toàn".
   */
  var KELLY_FRACTION = 0.25;

  function kelly(winRatePct, rr, fraction) {
    var w = num(winRatePct), r = num(rr);
    if (w == null || r == null || r <= 0 || w < 0 || w > 100) return null;
    var W = w / 100;
    var full = W - (1 - W) / r;
    var f = num(fraction);
    if (f == null || f <= 0 || f > 1) f = KELLY_FRACTION;
    return {
      full: full * 100,              // % tài khoản, Kelly đầy đủ
      fraction: f,
      suggestedPct: full > 0 ? full * f * 100 : 0,
      // Kỳ vọng theo R của chính bộ (W, R) này. Âm thì f* cũng âm.
      expectancyR: W * r - (1 - W),
      noEdge: full <= 0,
      winRate: w, rr: r,
    };
  }

  /* ====================== 2. KHỐI LƯỢNG THEO ATR ====================== */

  /*
   * Cùng một mức rủi ro % tài khoản, khoảng cách dừng lỗ càng RỘNG thì vị thế
   * càng NHỎ. Đó là toàn bộ ý tưởng.
   *
   *   rủi ro tiền = notional × (khoảng dừng / giá vào)
   *   -> notional (tính bằng % tài khoản) = riskPct / (khoảng dừng / giá vào)
   *
   * Trả về notional theo % TÀI KHOẢN, không phải số tiền. Muốn ra số hợp đồng
   * thì nhân với vốn của bạn — phép nhân đó cố ý để ngoài module này.
   *
   * `atrMult` là số lần ATR đặt dừng lỗ. Coin có ATR gấp ba thì khoảng dừng
   * gấp ba và notional nhỏ đi ba lần.
   */
  function sizeByStop(riskPct, entry, stopDistance) {
    var risk = num(riskPct), e = num(entry), d = num(stopDistance);
    if (risk == null || e == null || d == null || e <= 0 || d <= 0 || risk <= 0) return null;
    var stopFrac = d / e;
    return {
      stopPct: stopFrac * 100,
      notionalPct: risk / stopFrac,
      riskPct: risk,
    };
  }

  function sizeByAtr(riskPct, entry, atr, atrMult) {
    var m = num(atrMult);
    if (m == null || m <= 0) m = 2;
    var a = num(atr);
    if (a == null || a <= 0) return null;
    var r = sizeByStop(riskPct, entry, a * m);
    if (!r) return null;
    r.atr = a; r.atrMult = m;
    return r;
  }

  /*
   * So sánh hai cách tính trên CÙNG một mức rủi ro. Điều đáng nhìn không phải
   * hai con số, mà là tỉ lệ giữa chúng: nó cho biết cách cố định đang sai bao
   * nhiêu lần trên coin này.
   */
  function compareSizing(riskPct, entry, atr, atrMult, fixedStopPct) {
    var byAtr = sizeByAtr(riskPct, entry, atr, atrMult);
    var fs = num(fixedStopPct);
    var e = num(entry);
    var fixed = (fs != null && fs > 0 && e != null)
      ? sizeByStop(riskPct, e, e * fs / 100) : null;
    if (!byAtr || !fixed) return { byAtr: byAtr, fixed: fixed, ratio: null };
    return {
      byAtr: byAtr, fixed: fixed,
      // >1 nghĩa là cách cố định đang cho vị thế TO HƠN mức biến động cho phép.
      ratio: fixed.notionalPct / byAtr.notionalPct,
    };
  }

  /* ======================= 3. NHIỆT DANH MỤC ========================== */

  // Ngưỡng đỏ theo yêu cầu. Đây là ngưỡng CẢNH BÁO, không phải giới hạn hệ
  // thống áp đặt — người dùng vẫn thấy đủ số để tự quyết.
  var HEAT_RED = 6;
  var HEAT_WARN = 4;

  /*
   * Tổng % tài khoản mất đi nếu MỌI lệnh đang mở đều chạm dừng lỗ cùng lúc.
   *
   * `riskPctOf(trade)` trả về rủi ro của một lệnh theo % tài khoản. Lệnh nào
   * không xác định được thì ĐẾM RIÊNG chứ không coi là 0 — coi là 0 sẽ báo
   * "nhiệt 2%" trong khi thực tế có ba lệnh chưa biết rủi ro bao nhiêu.
   */
  function portfolioHeat(openTrades, riskPctOf) {
    var rows = [], total = 0, unknown = 0;
    for (var i = 0; i < (openTrades || []).length; i++) {
      var t = openTrades[i];
      var r = num(riskPctOf ? riskPctOf(t) : null);
      if (r == null || r < 0) { unknown++; rows.push({ trade: t, riskPct: null }); continue; }
      total += r;
      rows.push({ trade: t, riskPct: r });
    }
    // Danh mục RỖNG có nhiệt đúng bằng 0 — đó là một phát biểu đúng, không
    // phải "không biết". Chỉ khi CÓ lệnh mà không lệnh nào xác định được rủi
    // ro thì mới là không biết.
    var blind = rows.length > 0 && rows.length === unknown;
    return {
      heatPct: blind ? null : total,
      n: rows.length,
      unknown: unknown,
      rows: rows,
      level: blind ? 'unknown'
        : total >= HEAT_RED ? 'red' : total >= HEAT_WARN ? 'warn' : 'ok',
      red: HEAT_RED, warn: HEAT_WARN,
    };
  }

  /* ====================== 4. TƯƠNG QUAN DANH MỤC ====================== */

  // Lợi suất theo ngày. Dùng lợi suất chứ không dùng giá: hai coin cùng đi lên
  // trong 30 ngày sẽ có tương quan giá gần 1 dù chúng đi lên vào những ngày
  // khác nhau hoàn toàn.
  function returns(closes) {
    var out = [];
    for (var i = 1; i < (closes || []).length; i++) {
      var a = num(closes[i - 1]), b = num(closes[i]);
      if (a == null || b == null || a <= 0) { out.push(null); continue; }
      out.push((b - a) / a);
    }
    return out;
  }

  // Pearson trên các cặp điểm CÙNG CÓ giá trị ở cả hai chuỗi.
  function pearson(a, b) {
    var xs = [], ys = [];
    var n = Math.min((a || []).length, (b || []).length);
    for (var i = 0; i < n; i++) {
      var x = num(a[i]), y = num(b[i]);
      if (x == null || y == null) continue;
      xs.push(x); ys.push(y);
    }
    if (xs.length < 10) return null;      // dưới 10 điểm thì hệ số là nhiễu
    var mx = 0, my = 0, k;
    for (k = 0; k < xs.length; k++) { mx += xs[k]; my += ys[k]; }
    mx /= xs.length; my /= ys.length;
    var sxy = 0, sxx = 0, syy = 0;
    for (k = 0; k < xs.length; k++) {
      var dx = xs[k] - mx, dy = ys[k] - my;
      sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
    }
    if (sxx <= 0 || syy <= 0) return null;
    return sxy / Math.sqrt(sxx * syy);
  }

  /*
   * Ma trận tương quan giữa các coin đang mở lệnh.
   * `closesByCoin` = { BTC: [...], ETH: [...] } — giá đóng cửa ngày, cùng mốc.
   */
  function correlationMatrix(closesByCoin) {
    var coins = Object.keys(closesByCoin || {});
    var rets = {};
    coins.forEach(function (c) { rets[c] = returns(closesByCoin[c]); });
    var m = {};
    coins.forEach(function (a) {
      m[a] = {};
      coins.forEach(function (b) {
        m[a][b] = a === b ? 1 : pearson(rets[a], rets[b]);
      });
    });
    return { coins: coins, m: m };
  }

  /*
   * SỐ LỆNH ĐỘC LẬP HIỆU DỤNG.
   *
   *     N_eff = (Σ wᵢ)² / ΣᵢΣⱼ wᵢwⱼ ρᵢⱼ
   *
   * Với trọng số bằng nhau và tương quan trung bình ρ̄ thì rút gọn thành
   * N / (1 + (N−1)ρ̄): năm lệnh tương quan 1.0 cho N_eff = 1, đúng nghĩa
   * "năm lệnh này thực chất là một lệnh".
   *
   * Cặp thiếu hệ số bị BỎ khỏi tổng và được đếm riêng — thay bằng 0 là ngầm
   * khẳng định hai coin đó không liên quan, một phát biểu ta không có.
   */
  function effectiveN(matrix, weights) {
    var coins = (matrix && matrix.coins) || [];
    var n = coins.length;
    if (!n) return null;
    var w = {};
    var sumW = 0;
    coins.forEach(function (c) {
      var v = weights && num(weights[c]) != null ? num(weights[c]) : 1;
      w[c] = v; sumW += v;
    });
    if (!(sumW > 0)) return null;

    var denom = 0, missing = 0, pairs = 0;
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        var rho = matrix.m[coins[i]][coins[j]];
        if (rho == null) { missing++; continue; }
        if (i !== j) pairs++;
        denom += w[coins[i]] * w[coins[j]] * rho;
      }
    }
    if (!(denom > 0)) return { n: n, effective: null, missingPairs: missing };
    return {
      n: n,
      effective: (sumW * sumW) / denom,
      missingPairs: missing,
      comparedPairs: pairs / 2,
    };
  }

  // Ngưỡng "thực chất là cùng một lệnh" theo yêu cầu.
  var CORR_HIGH = 0.8;

  /*
   * Các cụm coin dính nhau trên ngưỡng, CHỈ tính những lệnh CÙNG HƯỚNG.
   * Long BTC và short ETH khi hai coin tương quan 0.9 là hai lệnh ngược nhau,
   * gộp chúng vào một cụm rủi ro là sai dấu.
   */
  function clusters(matrix, sides, threshold) {
    var thr = num(threshold);
    if (thr == null) thr = CORR_HIGH;
    var coins = (matrix && matrix.coins) || [];
    var seen = {}, out = [];
    coins.forEach(function (a) {
      if (seen[a]) return;
      var group = [a];
      seen[a] = 1;
      coins.forEach(function (b) {
        if (seen[b] || b === a) return;
        if ((sides && sides[a]) !== (sides && sides[b])) return;
        var rho = matrix.m[a][b];
        if (rho != null && rho >= thr) { group.push(b); seen[b] = 1; }
      });
      if (group.length > 1) out.push({ coins: group, side: sides ? sides[a] : null });
    });
    return out;
  }

  /* ========================= 5. THANG DCA ============================= */

  /*
   * Thang DCA: vào `steps` lần, mỗi lần cách nhau `spacingPct` phần trăm theo
   * hướng BẤT LỢI cho lệnh.
   *
   * Sau mỗi lần vào:
   *   · giá vào trung bình = trung bình có trọng số theo vốn của các lần đã vào
   *   · giá thanh lý tính trên giá trung bình đó với cùng đòn bẩy
   *   · rủi ro cộng dồn = tổng vốn đã bỏ vào, theo % TÀI KHOẢN
   *
   * Mọi lần vào dùng cùng đòn bẩy nên đòn bẩy hiệu dụng của vị thế gộp vẫn là
   * L, và công thức thanh lý áp thẳng lên giá trung bình.
   *
   * KHÔNG có trường nào là số tiền. `marginPctPerStep` là % tài khoản.
   */
  function dcaLadder(opts) {
    var o = opts || {};
    var entry = num(o.entry), steps = num(o.steps), spacing = num(o.spacingPct);
    var lev = num(o.leverage), marginPct = num(o.marginPctPerStep);
    var mmr = num(o.mmr);
    if (mmr == null) mmr = 0.005;
    if (entry == null || steps == null || spacing == null || lev == null
      || entry <= 0 || steps < 1 || spacing <= 0 || lev <= 1) return null;
    if (marginPct == null || marginPct <= 0) marginPct = 1;
    var long = o.side !== 'SHORT';

    var rows = [];
    var sumMargin = 0, sumNotional = 0, sumCost = 0;
    for (var i = 0; i < Math.min(20, Math.round(steps)); i++) {
      var price = long
        ? entry * (1 - spacing / 100 * i)
        : entry * (1 + spacing / 100 * i);
      var margin = marginPct;                 // % tài khoản mỗi lần
      var notional = margin * lev;            // % tài khoản, quy theo đòn bẩy
      sumMargin += margin;
      sumNotional += notional;
      sumCost += notional * price;            // để tính giá trung bình có trọng số
      var avg = sumNotional > 0 ? sumCost / sumNotional : price;
      var liq = long
        ? avg * (1 - 1 / lev) / (1 - mmr)
        : avg * (1 + 1 / lev) / (1 + mmr);
      rows.push({
        step: i + 1,
        price: price,
        fromEntryPct: (price - entry) / entry * 100,
        avgEntry: avg,
        liqPrice: liq,
        liqFromNowPct: (liq - price) / price * 100,
        cumMarginPct: sumMargin,
        cumNotionalPct: sumNotional,
      });
    }
    return {
      rows: rows,
      side: long ? 'LONG' : 'SHORT',
      leverage: lev, mmr: mmr,
      // Tổng rủi ro nếu bị thanh lý sau khi đã vào hết thang: mất toàn bộ vốn
      // đã bỏ vào, tính bằng % tài khoản.
      totalMarginPct: sumMargin,
      finalLiqPrice: rows.length ? rows[rows.length - 1].liqPrice : null,
      finalAvgEntry: rows.length ? rows[rows.length - 1].avgEntry : null,
    };
  }

  /*
   * Giá thanh lý có rơi vào vùng cụm thanh lý dày không (bản đồ từ js/liq.js).
   *
   * "Dày" định nghĩa là: ô chứa giá đó có USD nằm trong nhóm `topPct` phần trăm
   * đậm nhất của bản đồ. Không có định nghĩa này thì "rơi vào cụm" là một câu
   * cảm tính.
   */
  function clusterRisk(map, price, topPct) {
    var p = num(price);
    if (!map || !map.bins || p == null) return null;
    var vals = [];
    for (var i = 0; i < map.bins.length; i++) {
      var u = map.bins[i].longUsd + map.bins[i].shortUsd;
      if (u > 0) vals.push(u);
    }
    if (!vals.length) return null;
    var top = num(topPct);
    if (top == null || top <= 0 || top >= 100) top = 20;

    var hit = null;
    for (var k = 0; k < map.bins.length; k++) {
      var b = map.bins[k];
      if (p >= b.lo && p < b.hi) { hit = b; break; }
    }
    if (!hit) return { inMap: false, inCluster: false };
    var usd = hit.longUsd + hit.shortUsd;

    /*
     * Xếp theo HẠNG, không theo ngưỡng giá trị. Bản đồ thanh lý thật có rất
     * nhiều ô gần bằng nhau; cắt theo giá trị thì một ngưỡng rơi trúng đám ô
     * bằng nhau ấy sẽ kéo cả đám vào "nhóm đậm nhất", và gần như ô nào cũng
     * bị gọi là cụm. Đếm xem có bao nhiêu ô ĐẬM HƠN ô này thì không bị vậy.
     */
    var greater = 0;
    for (var j = 0; j < vals.length; j++) if (vals[j] > usd) greater++;
    var rank = greater / vals.length;

    return {
      inMap: true,
      inCluster: usd > 0 && rank < top / 100,
      usd: usd, rankPct: rank * 100, topPct: top,
      binLo: hit.lo, binHi: hit.hi,
    };
  }

  root.VdearMoney = {
    KELLY_FRACTION: KELLY_FRACTION,
    HEAT_RED: HEAT_RED,
    HEAT_WARN: HEAT_WARN,
    CORR_HIGH: CORR_HIGH,
    kelly: kelly,
    sizeByStop: sizeByStop,
    sizeByAtr: sizeByAtr,
    compareSizing: compareSizing,
    portfolioHeat: portfolioHeat,
    returns: returns,
    pearson: pearson,
    correlationMatrix: correlationMatrix,
    effectiveN: effectiveN,
    clusters: clusters,
    dcaLadder: dcaLadder,
    clusterRisk: clusterRisk,
  };
})(typeof self !== 'undefined' ? self : this);
