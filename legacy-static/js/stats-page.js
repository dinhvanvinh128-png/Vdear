/*
 * Vdearypto — trang /stats: winrate theo (chiến lược × chế độ thị trường).
 *
 * Toàn bộ phần nặng chạy trong js/stats-worker.js. Luồng chính chỉ tải nến rồi
 * vẽ, nên cuộn trang không khựng trong lúc backtest chạy.
 *
 * QUY TẮC KHÔNG NHÂN NHƯỢNG CỦA TRANG NÀY: ô dưới 30 tín hiệu KHÔNG hiện con
 * số winrate. Hiện "67%" rồi ghi chú nhỏ "mẫu ít" là vô ích — người đọc nhớ
 * con số, quên ghi chú. Ô như vậy hiện chữ "mẫu quá nhỏ" và hết.
 */
(function () {
  var T = function (k, v) { return window.VdearI18n ? window.VdearI18n.t(k, v) : k; };
  var $ = function (id) { return document.getElementById(id); };
  if (!$('stMatrix')) return;

  var TF = '4h';
  var COINS = 24;
  var KLINES = 400;

  var state = { loading: true, error: null, res: null, coins: 0, tf: TF };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ------------------------------ tải nến ------------------------------- */

  function load() {
    state.loading = true; state.error = null;
    render();
    return window.VdearAPI.getMarket().then(function (market) {
      var rows = (market || []).filter(function (r) { return r.venues && r.venues.binance; })
        .slice(0, COINS);
      if (!rows.length) throw new Error('no market');
      return window.VdearAPI.pool(rows, function (r) {
        return window.VdearAPI.binanceKlines(r.base + 'USDT', '4h', KLINES)
          .then(function (c) { return { base: r.base, candles: c }; })
          .catch(function () { return { base: r.base, candles: [] }; });
      }, 6);
    }).then(function (coins) {
      var usable = coins.filter(function (c) { return c.candles.length >= 80; });
      state.coins = usable.length;
      if (!usable.length) throw new Error('no candles');
      return runWorker(usable);
    }).then(function (res) {
      state.res = res; state.loading = false; render();
    }).catch(function (e) {
      state.error = String((e && e.message) || e);
      state.loading = false; render();
    });
  }

  function runWorker(coins) {
    return new Promise(function (resolve, reject) {
      var w;
      try { w = new Worker('js/stats-worker.js'); }
      catch (e) { reject(new Error('worker')); return; }
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true; w.terminate(); reject(new Error('timeout'));
      }, 60000);
      w.onmessage = function (e) {
        if (done) return;
        done = true; clearTimeout(timer); w.terminate();
        resolve(e.data);
      };
      w.onerror = function (err) {
        if (done) return;
        done = true; clearTimeout(timer); w.terminate();
        reject(new Error('worker: ' + (err && err.message ? err.message : 'lỗi')));
      };
      w.postMessage({ type: 'run', coins: coins });
    });
  }

  /* ------------------------------- vẽ ----------------------------------- */

  var REG_KEY = {
    trend_up: 'reg.trendUp', trend_down: 'reg.trendDown',
    range: 'reg.range', volatile: 'reg.volatile',
  };
  var STRAT_KEY = { combat: 'st.strat.combat', rsi: 'st.strat.rsi' };

  /*
   * Màu ô theo winrate. Neo ở 33%: với R:R = 2 (TP +100% ký quỹ, SL −50%) thì
   * 33,3% là điểm hoà vốn. Dưới mức đó là thua dài hạn dù nhìn "một phần ba
   * số lệnh thắng" nghe không tệ. Neo màu vào điểm hoà vốn THẬT chứ không vào
   * 50% là điều duy nhất khiến bảng này đọc được.
   */
  function cellColor(winRate, breakEven) {
    if (winRate == null) return '';
    var d = (winRate - breakEven) / Math.max(1, 100 - breakEven);
    if (winRate < breakEven) {
      var k = Math.min(1, (breakEven - winRate) / breakEven);
      return 'background:color-mix(in srgb,var(--down) ' + (10 + k * 42).toFixed(0) + '%,transparent)';
    }
    return 'background:color-mix(in srgb,var(--up) ' + (10 + Math.min(1, d) * 42).toFixed(0) + '%,transparent)';
  }

  function renderMatrix() {
    var box = $('stMatrix');
    if (state.loading) {
      box.innerHTML = '<p class="ls-empty">' + T('st.loading', { n: state.coins || COINS }) + '</p>';
      return;
    }
    if (state.error || !state.res) {
      box.innerHTML = '<p class="ls-empty">' + T('st.failed') + '</p>';
      return;
    }
    var res = state.res;
    var mx = res.matrix;
    var breakEven = res.rr ? 100 / (1 + res.rr) : 50;
    var regimes = window.VdearRegime ? window.VdearRegime.KEYS : mx.regimes;

    var head = '<tr><th>' + T('st.th.strategy') + '</th>'
      + regimes.map(function (r) { return '<th>' + T(REG_KEY[r]) + '</th>'; }).join('')
      + '</tr>';

    var body = res.strategies.map(function (s) {
      return '<tr><td class="st-strat">' + T(STRAT_KEY[s] || s) + '</td>'
        + regimes.map(function (r) {
          var c = mx.cells[s + '|' + r];
          if (!c || !c.trades) {
            return '<td class="st-cell empty"><span class="st-none">' + T('st.noTrade') + '</span></td>';
          }
          if (!c.enough) {
            // Mẫu nhỏ: KHÔNG in winrate. Chỉ nói còn thiếu bao nhiêu mẫu.
            return '<td class="st-cell small"><span class="st-none">' + T('st.tooFew') + '</span>'
              + '<span class="st-n">' + T('st.nOf', { n: c.trades, need: c.need }) + '</span></td>';
          }
          return '<td class="st-cell" style="' + cellColor(c.winRate, breakEven) + '">'
            + '<b>' + c.winRate.toFixed(0) + '%</b>'
            + '<span class="st-n">' + T('st.n', { n: c.trades }) + '</span>'
            + '<span class="st-r ' + (c.expectancyR >= 0 ? 'up' : 'down') + '">'
            + (c.expectancyR >= 0 ? '+' : '') + c.expectancyR.toFixed(2) + 'R</span>'
            + '</td>';
        }).join('') + '</tr>';
    }).join('');

    box.innerHTML = '<div class="st-scroll"><table class="st-table">'
      + '<thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>'
      + '<p class="hint">' + T('st.breakEven', {
        rr: res.rr ? res.rr.toFixed(1) : '—', be: breakEven.toFixed(1),
      }) + '</p>'
      + '<p class="hint">' + T('st.basis', {
        coins: state.coins, tf: state.tf, trades: res.totalTrades, min: mx.minSample,
      }) + '</p>'
      + (res.skipped && res.skipped.length
        ? '<p class="hint">' + T('st.skipped', { n: res.skipped.length }) + '</p>' : '');
  }

  function renderNow() {
    var box = $('stNow');
    if (!box) return;
    if (!state.res || !state.res.current) { box.innerHTML = ''; return; }
    var cur = state.res.current;
    var keys = Object.keys(cur);
    if (!keys.length) { box.innerHTML = '<p class="ls-empty">' + T('st.noRegime') + '</p>'; return; }

    var counts = {};
    keys.forEach(function (k) {
      var g = cur[k].key || 'unknown';
      counts[g] = (counts[g] || 0) + 1;
    });
    var order = (window.VdearRegime ? window.VdearRegime.KEYS : []).concat(['unknown']);
    box.innerHTML = '<div class="st-now">'
      + order.filter(function (g) { return counts[g]; }).map(function (g) {
        return '<div class="st-now-cell reg-' + g + '">'
          + '<b>' + counts[g] + '</b>'
          + '<span>' + T(REG_KEY[g] || 'reg.unknown') + '</span></div>';
      }).join('')
      + '</div>'
      + '<p class="hint">' + T('st.nowHint', { n: keys.length }) + '</p>';
  }

  function render() { renderMatrix(); renderNow(); }

  function boot() {
    render();
    load();
    var again = $('stReload');
    if (again) again.addEventListener('click', function () { if (!state.loading) load(); });
    window.addEventListener('vdear:langchange', render);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
