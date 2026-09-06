/*
 * Vdearypto — bảng winrate theo chế độ, dùng chung cho radar.
 *
 * Trang /stats tự chạy backtest của riêng nó. Radar ở trang chủ thì KHÔNG tải
 * thêm gì cả: nó đã có sẵn nến của cả rổ coin vừa quét, nên chỉ việc đưa đúng
 * đống nến đó sang worker. Bắt người dùng tải lại vài chục lần klines chỉ để
 * biết một con số winrate là tự đốt hạn mức IP của họ.
 *
 * Kết quả cache trong localStorage: bảng chỉ có 8 ô, và winrate lịch sử không
 * đổi ý sau mỗi lần bấm F5.
 *
 * MỘT QUY TẮC PHẢI GIỮ
 * --------------------
 * Ô "chưa đủ mẫu" KHÔNG phải ô "winrate thấp". Bộ lọc ngưỡng chỉ được loại tín
 * hiệu khi ô tương ứng ĐỦ MẪU và thật sự dưới ngưỡng. Loại luôn cả những ô
 * chưa đủ mẫu là âm thầm coi "không biết" thành "xấu".
 */
(function () {
  'use strict';

  var KEY = 'vdear_regime_matrix';
  var TTL_MS = 6 * 3600 * 1000;
  var THRESHOLD_KEY = 'vdear_winrate_min';
  var MAX_COINS = 30;

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var j = JSON.parse(raw);
      if (!j || !j.at || Date.now() - j.at > TTL_MS) return null;
      return j;
    } catch (e) { return null; }
  }
  function write(payload) {
    try { localStorage.setItem(KEY, JSON.stringify(payload)); } catch (e) { /* chế độ riêng tư */ }
  }

  var cache = read();
  var running = null;

  function runWorker(coins) {
    return new Promise(function (resolve, reject) {
      var w;
      try { w = new Worker('js/stats-worker.js'); } catch (e) { reject(e); return; }
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true; w.terminate(); reject(new Error('timeout'));
      }, 45000);
      w.onmessage = function (e) {
        if (done) return;
        done = true; clearTimeout(timer); w.terminate(); resolve(e.data);
      };
      w.onerror = function () {
        if (done) return;
        done = true; clearTimeout(timer); w.terminate(); reject(new Error('worker'));
      };
      w.postMessage({ type: 'run', coins: coins });
    });
  }

  /*
   * `coins` = [{ base, candles }]. Trả về bảng đã cache nếu còn hạn; nếu không
   * thì chạy worker rồi cache lại. Hỏng thì trả null — radar vẫn chạy bình
   * thường, chỉ là không có huy hiệu hạ hạng nào.
   */
  function build(coins) {
    if (cache) return Promise.resolve(cache);
    if (running) return running;
    var usable = (coins || []).filter(function (c) {
      return c && c.candles && c.candles.length >= 80;
    }).slice(0, MAX_COINS);
    if (!usable.length) return Promise.resolve(null);

    running = runWorker(usable).then(function (res) {
      if (!res || !res.matrix) return null;
      var payload = {
        at: Date.now(), matrix: res.matrix, rr: res.rr,
        totalTrades: res.totalTrades, coins: usable.length,
      };
      cache = payload;
      write(payload);
      running = null;
      return payload;
    }).catch(function () { running = null; return null; });
    return running;
  }

  function cell(payload, strategy, regime) {
    if (!payload || !payload.matrix || !regime) return null;
    return payload.matrix.cells[(strategy || 'combat') + '|' + regime] || null;
  }

  /*
   * Đánh giá một tín hiệu trong chế độ hiện tại của chính coin đó.
   *
   * Trả về một trong ba trạng thái, không bao giờ trộn:
   *   'unknown' — chưa đủ mẫu để nói gì. KHÔNG phải "xấu".
   *   'weak'    — đủ mẫu VÀ winrate dưới ngưỡng người dùng đặt.
   *   'ok'      — đủ mẫu và đạt ngưỡng.
   */
  function judge(payload, regime, threshold, strategy) {
    var c = cell(payload, strategy, regime);
    if (!c || !c.enough || c.winRate == null) {
      return { state: 'unknown', cell: c || null };
    }
    var thr = Number(threshold);
    if (!Number.isFinite(thr)) thr = defaultThreshold(payload);
    return {
      state: c.winRate < thr ? 'weak' : 'ok',
      cell: c, winRate: c.winRate, threshold: thr,
    };
  }

  /*
   * Ngưỡng mặc định = ĐIỂM HOÀ VỐN theo R:R đang cấu hình, không phải 50%.
   * Với TP +100% ký quỹ và SL −50% thì hoà vốn ở 33,3%: một chiến lược thắng
   * 40% vẫn có lãi, gắn cờ đỏ nó là sai.
   */
  function defaultThreshold(payload) {
    var rr = payload && payload.rr;
    return (rr && rr > 0) ? 100 / (1 + rr) : 50;
  }

  function getThreshold(payload) {
    try {
      var raw = localStorage.getItem(THRESHOLD_KEY);
      // Number(null) === 0 và Number('') === 0. Không chặn ở đây thì "chưa đặt
      // ngưỡng" biến thành "ngưỡng 0%", và bộ lọc im lặng không lọc gì cả —
      // đúng cái bẫy mà AGENTS.md đã ghi, và nó vừa xảy ra lần nữa.
      if (raw == null || raw === '') return defaultThreshold(payload);
      var v = Number(raw);
      if (Number.isFinite(v) && v >= 0 && v <= 100) return v;
    } catch (e) { /* chế độ riêng tư */ }
    return defaultThreshold(payload);
  }
  function setThreshold(v) {
    try {
      if (v == null) localStorage.removeItem(THRESHOLD_KEY);
      else localStorage.setItem(THRESHOLD_KEY, String(v));
    } catch (e) { /* chế độ riêng tư */ }
  }

  function clear() {
    cache = null;
    try { localStorage.removeItem(KEY); } catch (e) { /* chế độ riêng tư */ }
  }

  window.VdearRegimeStats = {
    build: build,
    cached: function () { return cache; },
    cell: cell,
    judge: judge,
    defaultThreshold: defaultThreshold,
    getThreshold: getThreshold,
    setThreshold: setThreshold,
    clear: clear,
    MAX_COINS: MAX_COINS,
    TTL_MS: TTL_MS,
  };
})();
