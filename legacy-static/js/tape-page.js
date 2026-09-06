/*
 * Vdearypto — nối tầng dữ liệu lệnh khớp vào trang coin.
 *
 * Luồng: WebSocket aggTrade -> js/tape.js (bucket 1 phút) -> Web Worker (CVD,
 * phân kỳ, Volume Profile) -> js/chart.js vẽ.
 *
 * MỘT ĐIỀU PHẢI NÓI THẲNG VỚI NGƯỜI ĐỌC
 * -------------------------------------
 * Luồng lệnh khớp chỉ bắt đầu từ lúc MỞ TRANG. Không sàn nào cho tải miễn phí
 * toàn bộ lịch sử lệnh khớp, nên CVD ở đây là chuỗi cộng dồn kể từ khi bạn mở
 * trang, không phải từ đầu biểu đồ. Trang bù ngược tối đa 15 phút qua REST và
 * hiện rõ khoảng thời gian mình thật sự có.
 *
 * Volume Profile thì có hai nguồn và giao diện phải nói rõ đang xem cái nào:
 * dựng từ lệnh khớp thật (chính xác, nhưng chỉ từ lúc mở trang) hay dựng từ
 * nến (phủ hết biểu đồ, nhưng là XẤP XỈ vì phải rải đều khối lượng trên dải
 * mỗi nến).
 */
(function () {
  var T = function (k, v) { return window.VdearI18n ? window.VdearI18n.t(k, v) : k; };
  var $ = function (id) { return document.getElementById(id); };
  if (!$('cvdCanvas')) return;

  var BACKFILL_MIN = 15;

  var state = {
    symbol: null,
    tape: null,
    stream: null,
    worker: null,
    reqId: 0,
    pending: false,
    tickSize: null,
    profileMode: 'visible',   // 'visible' | 'session'
    levels: [],
    lastResult: null,
  };

  function num(x) { var n = Number(x); return Number.isFinite(n) ? n : null; }

  /* --------------------------- tick size thật --------------------------- */

  /*
   * Bước giá của bản đồ khối lượng phải suy từ tickSize THẬT của cặp, không
   * gõ cứng. Lấy từ exchangeInfo và nhớ lại trong phiên.
   */
  var tickCache = {};
  function loadTickSize(sym) {
    if (tickCache[sym] != null) return Promise.resolve(tickCache[sym]);
    return fetch('https://fapi.binance.com/fapi/v1/exchangeInfo')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var rows = (j && j.symbols) || [];
        for (var i = 0; i < rows.length; i++) {
          var f = (rows[i].filters || []).find(function (x) { return x.filterType === 'PRICE_FILTER'; });
          if (f) tickCache[rows[i].symbol] = num(f.tickSize);
        }
        return tickCache[sym] || null;
      })
      .catch(function () { return null; });
  }

  /* ------------------------------- worker ------------------------------- */

  function ensureWorker() {
    if (state.worker) return state.worker;
    try { state.worker = new Worker('js/tape-worker.js'); }
    catch (e) { state.worker = null; return null; }
    state.worker.onmessage = function (e) {
      var d = e.data || {};
      if (d.type !== 'result') return;
      state.pending = false;
      if (!d.ok) return;
      state.lastResult = d;
      apply(d);
    };
    state.worker.onerror = function () { state.pending = false; };
    return state.worker;
  }

  function apply(d) {
    var chart = window.__vdearChart;
    if (!chart) return;
    if (d.cvd) chart.setCVD(d.cvd.rows, { approximate: false });
    if (d.divergences) chart.setDivergences(d.divergences);
    if (d.profile) chart.setProfile(d.profile);
    renderInfo(d);
    renderTier(d.profile);
  }

  var AT_KEY = { poc: 'vp.poc', vah: 'vp.vah', val: 'vp.val' };

  /*
   * Bậc tin cậy Volume Profile, viết thành câu tiếng Việt nói rõ VÌ SAO tăng
   * hay giảm. Câu chữ luôn kết thúc bằng lời nhắc rằng đây là bậc RIÊNG, không
   * cộng vào thang hội tụ 5 điều kiện — nếu không, người đọc sẽ tự cộng.
   */
  function renderTier(profile) {
    var box = $('vpTier');
    if (!box) return;
    if (!profile || !state.levels || !state.levels.length) { box.innerHTML = ''; return; }
    var t = window.VdearVP.confidenceTier(profile, state.levels, 0.35);
    if (!t || t.tier === 0) {
      box.innerHTML = '<span class="vp-tier">' + T('vp.tier.none') + '</span>';
      return;
    }
    var at = t.hits.length ? (AT_KEY[t.hits[0].at] || 'vp.poc') : 'vp.poc';
    box.innerHTML = '<span class="vp-tier ' + (t.tier > 0 ? 'up' : 'down') + '">'
      + T(t.tier > 0 ? 'vp.tier.up' : 'vp.tier.down', { at: T(at) })
      + (t.approximate ? ' ' + T('vp.srcCandle') : '')
      + '</span>';
  }

  function compute() {
    var w = ensureWorker();
    var chart = window.__vdearChart;
    if (!w || !chart || state.pending) return;
    var buckets = state.tape ? state.tape.all() : [];
    var candles = chart.candles || [];
    if (!candles.length) return;

    var stepMs = candles.length > 1
      ? (candles[1].time - candles[0].time) * 1000 : 60000;

    state.pending = true;
    state.reqId++;
    w.postMessage({
      type: 'compute', id: state.reqId,
      buckets: buckets.map(function (b) {
        // Chỉ gửi phần worker cần. Gửi cả object bucket kéo theo mọi trường
        // phụ qua ranh giới luồng mỗi lần kéo biểu đồ.
        return {
          t: b.t, buyVol: b.buyVol, sellVol: b.sellVol,
          buyQuote: b.buyQuote, sellQuote: b.sellQuote,
          open: b.open, high: b.high, low: b.low, close: b.close,
          trades: b.trades, levels: b.levels,
        };
      }),
      candles: candles.map(function (c) {
        return { time: c.time, high: c.high, low: c.low, close: c.close, volume: c.volume };
      }),
      targetMs: stepMs,
      tickSize: state.tickSize,
      vpBuckets: 90,
    });
  }

  /* ------------------------------ khối chữ ------------------------------ */

  function renderInfo(d) {
    var box = $('tapeInfo');
    if (!box) return;
    var st = state.stream ? state.stream.stats() : null;
    var tp = state.tape ? state.tape.stats() : null;
    var prof = d && d.profile;

    var parts = [];
    parts.push('<span class="tape-dot ' + (st && st.state === 'open' ? 'on' : 'off') + '"></span>'
      + T(st && st.state === 'open' ? 'tape.live' : 'tape.off'));
    if (tp && tp.from != null) {
      // "71760 phút" là một con số không ai đọc nổi. Đổi đơn vị theo độ lớn.
      var mins = Math.max(0, Math.round((tp.to - tp.from) / 60000));
      if (mins >= 2880) parts.push(T('tape.windowDays', { n: (mins / 1440).toFixed(1) }));
      else if (mins >= 120) parts.push(T('tape.windowHours', { n: (mins / 60).toFixed(1) }));
      else parts.push(T('tape.window', { n: mins }));
    }
    if (st && st.partialGaps) parts.push(T('tape.gap', { n: BACKFILL_MIN }));
    if (prof) {
      parts.push(T(prof.approximate ? 'vp.srcCandle' : 'vp.srcTape'));
    }
    box.innerHTML = parts.join(' · ');
  }

  /* ------------------------------ khởi động ----------------------------- */

  function attach(symbolBase) {
    var sym = String(symbolBase || 'BTC').toUpperCase() + 'USDT';
    if (state.symbol === sym) { compute(); return; }
    state.symbol = sym;

    if (state.stream) { state.stream.stop(); state.stream = null; }

    loadTickSize(sym).then(function (tick) {
      state.tickSize = tick;
      state.tape = window.VdearTape.createTape({ tickSize: tick });
      state.stream = window.VdearTapeStream.createStream({
        symbols: [sym],
        tapeOf: function () { return state.tape; },
        onStatus: function () { renderInfo(state.lastResult); },
      });
      state.stream.start();
      // Tính lại theo nhịp, không tính mỗi lệnh khớp: BTC có hàng chục lệnh
      // mỗi giây và tính lại từng lệnh là đốt CPU không để làm gì.
      setInterval(function () {
        if (!document.hidden) compute();
      }, 4000);
      compute();
    });
  }

  function wire() {
    var t = $('vpToggle');
    if (t) t.addEventListener('click', function () {
      var chart = window.__vdearChart;
      if (!chart) return;
      chart.toggleProfile();
      t.classList.toggle('on', chart.showProfile);
      t.setAttribute('aria-pressed', chart.showProfile ? 'true' : 'false');
    });
    window.addEventListener('vdear:langchange', function () { renderInfo(state.lastResult); });
    // Trang coin phát sự kiện này mỗi khi đổi coin hoặc khung thời gian.
    window.addEventListener('vdear:coinchange', function (e) {
      var d = (e && e.detail) || {};
      state.levels = d.levels || [];
      renderTier(state.lastResult && state.lastResult.profile);
      attach(d.base);
    });
  }

  function boot() {
    wire();
    var base = new URLSearchParams(location.search).get('c') || 'BTC';
    attach(base);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
