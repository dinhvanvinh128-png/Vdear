/*
 * Vdearypto — kết nối luồng lệnh khớp (aggTrade) của Binance Futures.
 *
 * Đối chiếu tài liệu chính thức trước khi viết:
 *   · Luồng:  wss://fstream.binance.com/stream?streams=<sym>@aggTrade/...
 *     Gói tin: { e:"aggTrade", E, s, a, p, q, f, l, T, m }
 *     `m` = người MUA có phải maker không -> m=true là lệnh BÁN chủ động.
 *   · Bù dữ liệu: GET /fapi/v1/aggTrades?symbol=&startTime=&endTime=&limit=
 *     Mỗi lượt tối đa 1000 bản ghi và cửa sổ tối đa 1 giờ.
 *
 * Tệp này CHỈ lo kết nối và đưa lệnh khớp vào js/tape.js. Không tính toán,
 * không vẽ.
 *
 * BA THỨ PHẢI ĐÚNG, KHÔNG THÌ DỮ LIỆU SAI MÀ KHÔNG AI BIẾT
 * --------------------------------------------------------
 * 1. Mất kết nối rồi nối lại phải BÙ đoạn đứt, và bù bằng REST theo khoảng
 *    thời gian. Không bù thì CVD có một bậc nhảy vô hình.
 * 2. Chờ lại phải TĂNG DẦN có ngẫu nhiên hoá. Nối lại ngay lập tức trong vòng
 *    lặp là tự tấn công sàn và sẽ bị chặn IP.
 * 3. Trang ẩn đi thì NGẮT kết nối. Mở mười tab và để đó là mười kết nối chạy
 *    suốt đêm, mỗi cái vài chục nghìn gói tin.
 */
(function () {
  'use strict';

  var WS_BASE = 'wss://fstream.binance.com/stream?streams=';
  var REST = 'https://fapi.binance.com';

  // Tài liệu: mỗi kết nối tối đa 1024 luồng. Giữ xa trần cho an toàn.
  var MAX_STREAMS = 100;

  // Chờ lại: 1s, 2s, 4s … tối đa 30s, cộng nhiễu để nhiều tab không cùng nối
  // lại một lúc.
  var BACKOFF_BASE = 1000;
  var BACKOFF_MAX = 30000;

  // Cửa sổ tối đa mỗi lượt gọi aggTrades theo tài liệu.
  var BACKFILL_WINDOW_MS = 55 * 60 * 1000;
  var BACKFILL_LIMIT = 1000;
  var BACKFILL_MAX_CALLS = 12;

  function num(x) {
    if (x == null || x === '') return null;
    var n = Number(x);
    return Number.isFinite(n) ? n : null;
  }

  /*
   * opts: {
   *   symbols: ['BTCUSDT'], tapeOf(symbol) -> Tape,
   *   onTrade(symbol, trade), onStatus(state), maxStreams
   * }
   */
  function createStream(opts) {
    var o = opts || {};
    var symbols = (o.symbols || []).map(function (s) { return String(s).toUpperCase(); })
      .slice(0, num(o.maxStreams) || MAX_STREAMS);
    var ws = null;
    var attempt = 0;
    var timer = null;
    var stopped = false;
    var lastSeen = {};      // symbol -> thời điểm lệnh khớp cuối cùng
    var state = 'idle';
    var stats = { messages: 0, reconnects: 0, backfilled: 0, partialGaps: 0 };

    function setState(s, detail) {
      state = s;
      if (o.onStatus) {
        try { o.onStatus(s, detail || null); } catch (e) { /* giao diện hỏng không được giết luồng */ }
      }
    }

    function url() {
      return WS_BASE + symbols.map(function (s) { return s.toLowerCase() + '@aggTrade'; }).join('/');
    }

    function handle(msg) {
      var d = msg && msg.data ? msg.data : msg;
      if (!d || d.e !== 'aggTrade') return;
      var sym = String(d.s || '').toUpperCase();
      var t = num(d.T);
      if (!sym || t == null) return;
      stats.messages++;
      if (lastSeen[sym] == null || t > lastSeen[sym]) lastSeen[sym] = t;
      var tape = o.tapeOf ? o.tapeOf(sym) : null;
      if (tape) tape.push(d);
      if (o.onTrade) {
        try { o.onTrade(sym, d); } catch (e) { /* như trên */ }
      }
    }

    /* ---------------------------- bù dữ liệu --------------------------- */

    /*
     * Bù đoạn đứt cho một cặp bằng REST.
     *
     * Chia theo cửa sổ 55 phút vì tài liệu giới hạn khoảng thời gian mỗi lượt
     * gọi. Có trần số lượt gọi: mất mạng nửa ngày thì không bù nổi và cũng
     * KHÔNG NÊN bù — chuỗi vá víu nửa vời tệ hơn chuỗi có ghi rõ chỗ đứt.
     */
    function backfill(sym) {
      var Tape = window.VdearTape;
      var tape = o.tapeOf ? o.tapeOf(sym) : null;
      if (!Tape || !tape) return Promise.resolve(null);
      var plan = Tape.backfillPlan(lastSeen[sym], Date.now());
      if (!plan.needed) return Promise.resolve(null);
      if (plan.partial) stats.partialGaps++;

      var from = plan.startMs;
      var calls = 0;

      function step() {
        if (stopped || calls >= BACKFILL_MAX_CALLS || from >= Date.now()) {
          return Promise.resolve(plan);
        }
        calls++;
        var to = Math.min(Date.now(), from + BACKFILL_WINDOW_MS);
        var u = REST + '/fapi/v1/aggTrades?symbol=' + sym
          + '&startTime=' + from + '&endTime=' + to + '&limit=' + BACKFILL_LIMIT;
        return fetch(u, { headers: { Accept: 'application/json' } })
          .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
          })
          .then(function (rows) {
            if (!Array.isArray(rows) || !rows.length) { from = to; return step(); }
            for (var i = 0; i < rows.length; i++) {
              // Khử trùng nằm trong tape (theo aggTradeId), nên chồng lấn với
              // luồng WebSocket là an toàn.
              if (tape.push(rows[i])) stats.backfilled++;
            }
            var lastT = num(rows[rows.length - 1].T);
            if (lastT != null && lastT > from) {
              if (lastSeen[sym] == null || lastT > lastSeen[sym]) lastSeen[sym] = lastT;
              // Trả về đủ `limit` bản ghi nghĩa là còn nữa trong cửa sổ này.
              from = rows.length >= BACKFILL_LIMIT ? lastT + 1 : to;
            } else {
              from = to;
            }
            return step();
          })
          .catch(function () { return plan; });
      }
      return step();
    }

    function backfillAll() {
      return Promise.all(symbols.map(function (s) { return backfill(s); }));
    }

    /* ---------------------------- kết nối ------------------------------ */

    function connect() {
      if (stopped || !symbols.length) return;
      clearTimeout(timer);
      setState('connecting');
      try { ws = new WebSocket(url()); }
      catch (e) { scheduleReconnect(); return; }

      ws.onopen = function () {
        attempt = 0;
        setState('open');
        // Nối lại xong mới bù, để đoạn bù không bị hụt phần vừa nhận qua WS.
        backfillAll().then(function () { setState('open'); });
      };
      ws.onmessage = function (ev) {
        var d;
        try { d = JSON.parse(ev.data); } catch (e) { return; }
        handle(d);
      };
      ws.onerror = function () { /* onclose sẽ chạy ngay sau */ };
      ws.onclose = function () {
        if (stopped) return;
        stats.reconnects++;
        scheduleReconnect();
      };
    }

    function scheduleReconnect() {
      if (stopped) return;
      setState('reconnecting', { attempt: attempt + 1 });
      // Tăng dần + ngẫu nhiên hoá. Không có phần ngẫu nhiên thì mọi tab đang
      // mở sẽ cùng nối lại đúng một thời điểm.
      var wait = Math.min(BACKOFF_MAX, BACKOFF_BASE * Math.pow(2, attempt));
      wait = wait * (0.7 + Math.random() * 0.6);
      attempt++;
      clearTimeout(timer);
      timer = setTimeout(connect, wait);
    }

    function close() {
      clearTimeout(timer);
      if (ws) {
        try { ws.onclose = null; ws.close(); } catch (e) { /* đã đóng */ }
        ws = null;
      }
      setState('closed');
    }

    function start() {
      stopped = false;
      connect();
    }
    function stop() {
      stopped = true;
      close();
    }

    // Trang ẩn thì ngắt, hiện lại thì nối và bù. Mười tab để qua đêm là mười
    // kết nối và vài trăm nghìn gói tin không ai đọc.
    function onVisibility() {
      if (document.hidden) { close(); }
      else if (!stopped) { attempt = 0; connect(); }
    }

    document.addEventListener('visibilitychange', onVisibility);

    return {
      start: start,
      stop: function () {
        stop();
        document.removeEventListener('visibilitychange', onVisibility);
      },
      state: function () { return state; },
      stats: function () {
        return {
          messages: stats.messages, reconnects: stats.reconnects,
          backfilled: stats.backfilled, partialGaps: stats.partialGaps,
          symbols: symbols.length, state: state,
        };
      },
      lastSeen: function (s) { return lastSeen[String(s).toUpperCase()] || null; },
      _backfill: backfill,
      _url: url,
    };
  }

  window.VdearTapeStream = {
    createStream: createStream,
    MAX_STREAMS: MAX_STREAMS,
    BACKOFF_BASE: BACKOFF_BASE,
    BACKOFF_MAX: BACKOFF_MAX,
    BACKFILL_WINDOW_MS: BACKFILL_WINDOW_MS,
  };
})();
