/*
 * Vdear — Open Interest & tỉ lệ Long/Short (Binance USDⓈ-M Futures).
 *
 * ĐÃ ĐỐI CHIẾU TÀI LIỆU CHÍNH THỨC trước khi viết (không tin sẵn endpoint được
 * đưa cho). Bốn endpoint dùng ở đây:
 *
 *   GET /fapi/v1/openInterest?symbol=            -> OI hiện tại, weight 1
 *   GET /futures/data/openInterestHist           -> OI theo chuỗi thời gian
 *   GET /futures/data/topLongShortPositionRatio  -> tỉ lệ VỊ THẾ của top trader
 *   GET /futures/data/globalLongShortAccountRatio-> tỉ lệ TÀI KHOẢN toàn thị trường
 *
 * Ba endpoint /futures/data/* có weight 0 nhưng bị chặn theo IP ở mức
 * 1000 request / 5 phút, và chỉ giữ dữ liệu 30 ngày gần nhất. `period` chỉ
 * nhận 5m 15m 30m 1h 2h 4h 6h 12h 1d — KHÔNG có 1w và 1M, nên hai khung đó
 * trả về null để giao diện hiện "—" thay vì nội suy ra một con số không có
 * thật.
 *
 * Kiểu dữ liệu: mọi số trong phản hồi là CHUỖI ("34085.00000000"), phải tự
 * ép sang số. Trường trả về:
 *   openInterest      -> { openInterest, symbol, time }
 *   openInterestHist  -> [{ symbol, sumOpenInterest, sumOpenInterestValue, timestamp }]
 *   *LongShort*       -> [{ symbol, longShortRatio, longAccount, shortAccount, timestamp }]
 *
 * Nguyên tắc của tệp này: KHÔNG BAO GIỜ NÉM LỖI RA NGOÀI. Coin không có hợp
 * đồng futures trên Binance sẽ nhận 400; mạng có thể rớt; nguồn có thể đổi
 * hình dạng phản hồi. Mọi trường hợp đó đều trả về null, và phía giao diện
 * hiển thị "—". Một cột thiếu dữ liệu không được phép làm vỡ cả bảng.
 */
(function () {
  var HOST = 'https://fapi.binance.com';

  /* --------------------------- khung thời gian ------------------------- */

  // Binance chỉ nhận đúng các giá trị này cho tham số `period`.
  var PERIODS = ['5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d'];

  // Khung của trang -> khung Binance. Khung nào nguồn không có thì để trống:
  // thà hiện "—" còn hơn lấy khung gần nhất rồi ngầm đổi ý nghĩa con số.
  var TF_TO_PERIOD = {
    '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1h', '2h': '2h',
    '4h': '4h', '6h': '6h', '10h': '12h', '12h': '12h', '1d': '1d',
    '1w': null, '1M': null,
  };

  function periodFor(tfId) {
    var p = TF_TO_PERIOD[tfId];
    return p && PERIODS.indexOf(p) >= 0 ? p : null;
  }

  /* ------------------------------ bộ đệm -------------------------------- */

  var TTL_CURRENT = 60 * 1000;        // OI hiện tại: 60 giây
  var TTL_HIST = 5 * 60 * 1000;       // chuỗi lịch sử: 5 phút

  var cache = Object.create(null);    // key -> { at, val }
  var inflight = Object.create(null); // key -> Promise (gộp request trùng)

  function fresh(key, ttl) {
    var c = cache[key];
    return c && (Date.now() - c.at) < ttl ? c : null;
  }

  /*
   * Gộp lời gọi trùng. Quét 600 coin thì nhiều module cùng hỏi một symbol
   * trong cùng một khoảnh khắc; không gộp thì mỗi lần mở trang bắn ra vài trăm
   * request y hệt nhau và đốt sạch hạn mức 1000/5 phút.
   *
   * Kết quả null CŨNG được đệm (với TTL ngắn hơn): coin không có futures thì
   * lần nào hỏi cũng 400, hỏi lại mỗi 30 giây là tự phá hạn mức của chính mình.
   */
  var TTL_NULL = 2 * 60 * 1000;

  function once(key, ttl, work) {
    var c = cache[key];
    // Kết quả null đệm theo TTL riêng, ngắn hơn lịch sử và dài hơn OI hiện tại.
    var use = c && c.val === null ? TTL_NULL : ttl;
    if (c && (Date.now() - c.at) < use) return Promise.resolve(c.val);
    if (inflight[key]) return inflight[key];

    inflight[key] = work()
      .then(function (v) {
        cache[key] = { at: Date.now(), val: v };
        return v;
      })
      .catch(function (e) {
        // Hết hạn mức là trạng thái TẠM THỜI của cả trang, không phải kết luận
        // "coin này không có dữ liệu". Đệm null ở đây thì hai phút sau vẫn
        // trống dù hạn mức đã hồi — trả null cho lần này thôi, không ghi đệm.
        if (!(e && e.rateLimited)) cache[key] = { at: Date.now(), val: null };
        return null;
      })
      .then(function (v) { delete inflight[key]; return v; });
    return inflight[key];
  }

  /* ---------------------------- hạn mức IP ------------------------------ */

  /*
   * Gáo token trượt theo cửa sổ 5 phút. Hạn mức thật là 1000 request/5 phút
   * cho mỗi IP; để trần ở 700 vì trang còn gọi các endpoint khác từ cùng IP
   * (ticker 24h, klines), và vượt hạn mức thì Binance trả 418 rồi CẤM IP một
   * lúc — mất luôn cả biểu đồ chứ không riêng cột OI.
   *
   * Quá hạn mức thì TỪ CHỐI ngay chứ không xếp hàng chờ: một cột trong bảng
   * hiện "—" thì đọc được ngay, còn xếp hàng vài phút là người dùng ngồi nhìn
   * ô trống mà không hiểu vì sao.
   */
  var LIMIT = 700, WINDOW = 5 * 60 * 1000;
  var stamps = [];

  function allow() {
    var now = Date.now();
    while (stamps.length && now - stamps[0] > WINDOW) stamps.shift();
    if (stamps.length >= LIMIT) return false;
    stamps.push(now);
    return true;
  }

  function budget() {
    var now = Date.now();
    while (stamps.length && now - stamps[0] > WINDOW) stamps.shift();
    return LIMIT - stamps.length;
  }

  /* ------------------------------ tải về -------------------------------- */

  function num(x) { var n = parseFloat(x); return Number.isFinite(n) ? n : null; }

  function getJSON(url, timeout) {
    if (!allow()) {
      var e = new Error('rate-limit');
      e.rateLimited = true;
      return Promise.reject(e);
    }
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeout || 10000) : 0;
    return fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (j) { if (timer) clearTimeout(timer); return j; })
      .catch(function (e) { if (timer) clearTimeout(timer); throw e; });
  }

  function symbolOf(base) {
    return String(base).toUpperCase().replace(/[-_/]/g, '').replace(/USDT$/, '') + 'USDT';
  }

  /* ----------------------------- API công khai -------------------------- */

  // OI HIỆN TẠI. Trả { symbol, oi, at } hoặc null.
  function current(base) {
    var sym = symbolOf(base);
    return once('cur:' + sym, TTL_CURRENT, function () {
      return getJSON(HOST + '/fapi/v1/openInterest?symbol=' + encodeURIComponent(sym))
        .then(function (j) {
          var oi = num(j && j.openInterest);
          if (oi == null) return null;
          return { symbol: sym, oi: oi, at: Number(j.time) || Date.now() };
        });
    });
  }

  // Chuỗi OI theo thời gian. Trả mảng [{ t, oi, value }] cũ -> mới, hoặc null.
  function hist(base, tfId, limit) {
    var period = periodFor(tfId);
    if (!period) return Promise.resolve(null);   // 1W/1M: nguồn không có
    var sym = symbolOf(base);
    var n = Math.max(1, Math.min(500, limit || 200));
    var key = 'hist:' + sym + ':' + period + ':' + n;
    return once(key, TTL_HIST, function () {
      return getJSON(HOST + '/futures/data/openInterestHist?symbol=' + encodeURIComponent(sym)
        + '&period=' + period + '&limit=' + n).then(function (a) { return rows(a); });
    });
  }

  function rows(a) {
    if (!Array.isArray(a) || !a.length) return null;
    var out = [];
    for (var i = 0; i < a.length; i++) {
      var r = a[i];
      var oi = num(r && r.sumOpenInterest);
      var t = Number(r && r.timestamp);
      if (oi == null || !Number.isFinite(t)) continue;
      out.push({ t: t, oi: oi, value: num(r.sumOpenInterestValue) });
    }
    if (!out.length) return null;
    out.sort(function (x, y) { return x.t - y.t; });
    return out;
  }

  // Tỉ lệ long/short. `which` = 'top' (vị thế của top trader) hoặc
  // 'global' (tài khoản toàn thị trường). Hai con số này KHÁC NHAU về ý nghĩa
  // nên không được trộn: 'top' đo tiền, 'global' đo đầu người.
  var PATHS = {
    top: '/futures/data/topLongShortPositionRatio',
    global: '/futures/data/globalLongShortAccountRatio',
  };

  function ratio(base, which, tfId, limit) {
    var path = PATHS[which];
    var period = periodFor(tfId);
    if (!path || !period) return Promise.resolve(null);
    var sym = symbolOf(base);
    var n = Math.max(1, Math.min(500, limit || 30));
    var key = 'ls:' + which + ':' + sym + ':' + period + ':' + n;
    return once(key, TTL_HIST, function () {
      return getJSON(HOST + path + '?symbol=' + encodeURIComponent(sym)
        + '&period=' + period + '&limit=' + n).then(function (a) { return lsRows(a); });
    });
  }

  function lsRows(a) {
    if (!Array.isArray(a) || !a.length) return null;
    var out = [];
    for (var i = 0; i < a.length; i++) {
      var r = a[i];
      var lo = num(r && r.longAccount), sh = num(r && r.shortAccount);
      var t = Number(r && r.timestamp);
      if (lo == null || sh == null || !Number.isFinite(t)) continue;
      // Nguồn trả tỉ trọng 0..1. Tự tính lại tỉ lệ thay vì tin longShortRatio:
      // một dòng thiếu trường đó vẫn dùng được, và số hiện ra luôn khớp với
      // đúng hai tỉ trọng đang vẽ trên thanh.
      out.push({ t: t, long: lo, short: sh, ratio: sh > 0 ? lo / sh : null });
    }
    if (!out.length) return null;
    out.sort(function (x, y) { return x.t - y.t; });
    return out;
  }

  function latestRatio(base, which, tfId) {
    return ratio(base, which, tfId, 30).then(function (a) {
      return a && a.length ? a[a.length - 1] : null;
    });
  }

  /* ------------------------- OI delta + phân loại ----------------------- */

  /*
   * Bốn trạng thái kinh điển của cặp giá/OI. Đây là cách đọc phổ biến trong
   * giao dịch phái sinh, KHÔNG phải một chỉ báo tự nghĩ ra:
   *   giá ↑ / OI ↑  tiền mới vào long, xu hướng khoẻ
   *   giá ↑ / OI ↓  short cover, đà yếu
   *   giá ↓ / OI ↑  tiền mới vào short
   *   giá ↓ / OI ↓  long thanh lý xong, lực bán có thể đang cạn
   *
   * Ngưỡng chết (dead zone): dưới ±0.35% thì coi là ĐI NGANG chứ không gán
   * hướng. Không có ngưỡng thì một nhiễu 0.02% cũng bị đọc thành "tiền mới
   * vào long" — tức là bịa ra một phát biểu về thị trường từ nhiễu làm tròn.
   */
  var DEAD = 0.35;

  function pct(from, to) {
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
    return ((to - from) / Math.abs(from)) * 100;
  }

  // series: mảng do hist() trả về. candles: mảng nến {close} của cùng khung.
  // Trả { oiPct, pricePct, state, priceUp, oiUp } hoặc null nếu thiếu dữ liệu.
  function classify(series, candles, bars) {
    if (!series || series.length < 2 || !candles || candles.length < 2) return null;
    var n = Math.max(1, bars || 1);

    var oiA = series[Math.max(0, series.length - 1 - n)].oi;
    var oiB = series[series.length - 1].oi;
    var pA = candles[Math.max(0, candles.length - 1 - n)].close;
    var pB = candles[candles.length - 1].close;

    var oiPct = pct(oiA, oiB), pricePct = pct(pA, pB);
    if (oiPct == null || pricePct == null) return null;

    var priceUp = pricePct > DEAD ? 1 : pricePct < -DEAD ? -1 : 0;
    var oiUp = oiPct > DEAD ? 1 : oiPct < -DEAD ? -1 : 0;

    var state = 'flat';
    if (priceUp > 0 && oiUp > 0) state = 'longsIn';
    else if (priceUp > 0 && oiUp < 0) state = 'shortCover';
    else if (priceUp < 0 && oiUp > 0) state = 'shortsIn';
    else if (priceUp < 0 && oiUp < 0) state = 'longsOut';

    return { oiPct: oiPct, pricePct: pricePct, state: state, priceUp: priceUp, oiUp: oiUp };
  }

  // Khoá i18n cho từng trạng thái — chữ nằm ở js/i18n.js, tệp này không giữ
  // câu tiếng Việt nào để khỏi phải sửa hai chỗ khi đổi cách diễn đạt.
  var STATE_KEY = {
    longsIn: 'oi.st.longsIn',
    shortCover: 'oi.st.shortCover',
    shortsIn: 'oi.st.shortsIn',
    longsOut: 'oi.st.longsOut',
    flat: 'oi.st.flat',
  };

  function reset() {
    cache = Object.create(null);
    inflight = Object.create(null);
    stamps = [];
  }

  window.VdearOI = {
    PERIODS: PERIODS,
    periodFor: periodFor,
    supports: function (tfId) { return periodFor(tfId) != null; },
    symbolOf: symbolOf,
    current: current,
    hist: hist,
    ratio: ratio,
    latestRatio: latestRatio,
    classify: classify,
    stateKey: function (s) { return STATE_KEY[s] || STATE_KEY.flat; },
    DEAD: DEAD,
    budget: budget,
    _reset: reset,
    _rows: rows,
    _lsRows: lsRows,
  };
})();
