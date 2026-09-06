/*
 * Vdearypto — trang Quản trị vốn.
 *
 * Phần tính nằm trong js/money.js. Tệp này lấy dữ liệu và vẽ.
 *
 * RÀNG BUỘC ĐẠO ĐỨC, ÁP DỤNG CHO CẢ TỆP NÀY
 * -----------------------------------------
 * Không in ra một số tiền tuyệt đối nào. Đơn vị hiển thị chỉ có hai: R (bội số
 * rủi ro) và % tài khoản. Không có ô "vốn của bạn", không có ô "lãi dự kiến".
 * Người dùng muốn ra số hợp đồng thì tự nhân với vốn của họ — phép nhân đó cố
 * ý nằm ngoài trang này.
 *
 * Cũng không có câu nào hứa hẹn. Chỗ nào không đủ dữ liệu thì nói "chưa đủ
 * mẫu", không đưa ra một con số cho có.
 */
(function () {
  var T = function (k, v) { return window.VdearI18n ? window.VdearI18n.t(k, v) : k; };
  var $ = function (id) { return document.getElementById(id); };
  if (!$('mnKelly')) return;

  var M = window.VdearMoney;
  var CORR_DAYS = 30;

  var state = {
    riskPct: 1,
    atrMult: 2,
    fixedStopPct: 2,
    kellyFraction: 0.25,
    dca: { entry: 100, side: 'LONG', steps: 3, spacingPct: 5, leverage: 10, marginPctPerStep: 1 },
    stats: null,      // bảng winrate theo chế độ
    trades: [],       // lệnh đang mở từ nhật ký
    corr: null,
    atrByCoin: {},
    liqMap: null,
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pct(v, d) {
    if (v == null || !Number.isFinite(v)) return '—';
    return v.toFixed(d == null ? 2 : d) + '%';
  }
  function signedPct(v, d) {
    if (v == null || !Number.isFinite(v)) return '—';
    return (v >= 0 ? '+' : '') + v.toFixed(d == null ? 2 : d) + '%';
  }
  function px(v) {
    if (v == null || !Number.isFinite(v)) return '—';
    var a = Math.abs(v);
    return v.toLocaleString('en-US', {
      minimumFractionDigits: 2, maximumFractionDigits: a >= 1000 ? 2 : a >= 1 ? 4 : 8,
    });
  }
  function num(v) { var n = Number(v); return Number.isFinite(n) ? n : null; }

  /* ============================== 1. KELLY ============================= */

  var REG_KEY = {
    trend_up: 'reg.trendUp', trend_down: 'reg.trendDown',
    range: 'reg.range', volatile: 'reg.volatile',
  };

  function renderKelly() {
    var box = $('mnKelly');
    if (!box) return;
    var st = state.stats;
    if (!st || !st.matrix) {
      box.innerHTML = '<p class="ls-empty">' + T('mn.k.noStats') + '</p>';
      return;
    }
    var regimes = window.VdearRegime ? window.VdearRegime.KEYS : [];
    var rows = regimes.map(function (r) {
      var c = st.matrix.cells['combat|' + r];
      if (!c || !c.enough) {
        // Chưa đủ mẫu thì KHÔNG tính Kelly. Kelly trên 12 lệnh là một con số
        // chính xác về mặt số học và vô nghĩa về mặt thống kê.
        return '<tr><td>' + T(REG_KEY[r]) + '</td>'
          + '<td colspan="4" class="mn-none">' + T('mn.k.tooFew', {
            n: c ? c.trades : 0, need: st.matrix.minSample,
          }) + '</td></tr>';
      }
      var k = M.kelly(c.winRate, st.rr, state.kellyFraction);
      if (!k) return '';
      if (k.noEdge) {
        return '<tr class="mn-noedge"><td>' + T(REG_KEY[r]) + '</td>'
          + '<td>' + pct(c.winRate, 0) + '</td>'
          + '<td>' + st.rr.toFixed(1) + '</td>'
          + '<td colspan="2" class="mn-warn-cell">' + T('mn.k.noEdge') + '</td></tr>';
      }
      return '<tr><td>' + T(REG_KEY[r]) + '</td>'
        + '<td>' + pct(c.winRate, 0) + '</td>'
        + '<td>' + st.rr.toFixed(1) + '</td>'
        + '<td class="muted">' + pct(k.full) + '</td>'
        + '<td><b>' + pct(k.suggestedPct) + '</b></td></tr>';
    }).join('');

    box.innerHTML = '<div class="mn-scroll"><table class="jr-dim-table mn-table"><thead><tr>'
      + '<th>' + T('mn.k.th.regime') + '</th><th>' + T('mn.k.th.win') + '</th>'
      + '<th>' + T('mn.k.th.rr') + '</th><th>' + T('mn.k.th.full') + '</th>'
      + '<th>' + T('mn.k.th.suggest', { f: Math.round(1 / state.kellyFraction) }) + '</th>'
      + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  /* ========================= 2. KHỐI LƯỢNG ATR ======================== */

  function renderSizing() {
    var box = $('mnSizing');
    if (!box) return;
    var coins = Object.keys(state.atrByCoin);
    if (!coins.length) {
      box.innerHTML = '<p class="ls-empty">' + T('mn.s.noAtr') + '</p>';
      return;
    }
    var rows = coins.map(function (c) {
      var a = state.atrByCoin[c];
      var cmp = M.compareSizing(state.riskPct, a.price, a.atr, state.atrMult, state.fixedStopPct);
      if (!cmp || !cmp.byAtr) return '';
      return '<tr><td>' + esc(c) + '</td>'
        + '<td>' + pct(a.atr / a.price * 100) + '</td>'
        + '<td>' + pct(cmp.byAtr.stopPct) + '</td>'
        + '<td><b>' + pct(cmp.byAtr.notionalPct, 0) + '</b></td>'
        + '<td class="muted">' + (cmp.fixed ? pct(cmp.fixed.notionalPct, 0) : '—') + '</td>'
        + '<td class="' + (cmp.ratio > 1.2 ? 'down' : cmp.ratio < 0.83 ? 'up' : 'muted') + '">'
        + (cmp.ratio == null ? '—' : '×' + cmp.ratio.toFixed(2)) + '</td></tr>';
    }).join('');
    box.innerHTML = '<div class="mn-scroll"><table class="jr-dim-table mn-table"><thead><tr>'
      + '<th>Coin</th><th>' + T('mn.s.th.atr') + '</th><th>' + T('mn.s.th.stop') + '</th>'
      + '<th>' + T('mn.s.th.byAtr') + '</th><th>' + T('mn.s.th.fixed') + '</th>'
      + '<th>' + T('mn.s.th.ratio') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      + '<p class="hint">' + T('mn.s.note', { risk: state.riskPct }) + '</p>';
  }

  /* ========================== 3. NHIỆT DANH MỤC ======================= */

  /*
   * Rủi ro mỗi lệnh theo % tài khoản.
   *
   * Nhật ký không lưu quy mô tài khoản (cố ý — xem ràng buộc đầu tệp), nên ta
   * dùng mức rủi ro mặc định người dùng đặt ở trên. Điều đó CHỈ đúng nếu mọi
   * lệnh vào cùng cỡ rủi ro, và giao diện phải nói thẳng điều đó chứ không im.
   */
  function riskPctOf() { return state.riskPct; }

  function renderHeat() {
    var box = $('mnHeat');
    if (!box) return;
    var open = state.trades.filter(function (t) { return t.status === 'open'; });
    var h = M.portfolioHeat(open, riskPctOf);
    var maxShow = Math.max(h.red * 1.6, h.heatPct || 0);
    var fill = h.heatPct == null ? 0 : Math.min(100, h.heatPct / maxShow * 100);

    box.innerHTML = '<div class="mn-gauge ' + h.level + '">'
      + '<div class="mn-gauge-bar"><i style="width:' + fill.toFixed(1) + '%"></i>'
      + '<span class="mn-gauge-red" style="left:' + (h.red / maxShow * 100).toFixed(1) + '%"></span>'
      + '</div>'
      + '<div class="mn-gauge-num"><b>' + (h.heatPct == null ? '—' : pct(h.heatPct, 1)) + '</b>'
      + '<span>' + T('mn.h.of', { n: h.n }) + '</span></div>'
      + '</div>'
      + '<p class="' + (h.level === 'red' ? 'mn-alert' : 'hint') + '">'
      + T(h.level === 'red' ? 'mn.h.red' : h.level === 'warn' ? 'mn.h.warn'
        : h.level === 'unknown' ? 'mn.h.unknown' : 'mn.h.ok', { red: h.red })
      + '</p>'
      + '<p class="hint">' + T('mn.h.assume', { risk: state.riskPct }) + '</p>'
      + (h.unknown ? '<p class="hint">' + T('mn.h.someUnknown', { n: h.unknown }) + '</p>' : '');
  }

  /* ========================= 4. TƯƠNG QUAN =========================== */

  function corrColor(v) {
    if (v == null) return '';
    var a = Math.min(1, Math.abs(v));
    var c = v >= 0 ? 'var(--down)' : 'var(--up)';
    return 'background:color-mix(in srgb,' + c + ' ' + (a * 46).toFixed(0) + '%,transparent)';
  }

  function renderCorr() {
    var box = $('mnCorr');
    if (!box) return;
    var c = state.corr;
    if (!c || !c.matrix || c.matrix.coins.length < 2) {
      box.innerHTML = '<p class="ls-empty">' + T('mn.c.need2') + '</p>';
      return;
    }
    var mx = c.matrix, coins = mx.coins;
    var head = '<tr><th></th>' + coins.map(function (x) { return '<th>' + esc(x) + '</th>'; }).join('') + '</tr>';
    var body = coins.map(function (a) {
      return '<tr><td class="mn-corr-lbl">' + esc(a) + '</td>'
        + coins.map(function (b) {
          var v = mx.m[a][b];
          return '<td class="mn-corr" style="' + corrColor(v) + '">'
            + (v == null ? '—' : v.toFixed(2)) + '</td>';
        }).join('') + '</tr>';
    }).join('');

    var eff = c.effective;
    var groups = c.clusters || [];
    box.innerHTML = '<div class="mn-scroll"><table class="mn-corr-table">'
      + '<thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>'
      + '<div class="mn-eff">'
      + '<div><span>' + T('mn.c.positions') + '</span><b>' + mx.coins.length + '</b></div>'
      + '<div><span>' + T('mn.c.effective') + '</span><b>'
      + (eff && eff.effective != null ? eff.effective.toFixed(2) : '—') + '</b></div>'
      + '</div>'
      + (groups.length
        ? groups.map(function (g) {
          return '<p class="mn-alert">' + T('mn.c.cluster', {
            n: g.coins.length, coins: esc(g.coins.join(', ')), side: g.side || '—',
          }) + '</p>';
        }).join('')
        : '<p class="hint">' + T('mn.c.noCluster', { thr: M.CORR_HIGH }) + '</p>')
      + (eff && eff.missingPairs
        ? '<p class="hint">' + T('mn.c.missing', { n: eff.missingPairs }) + '</p>' : '')
      + '<p class="hint">' + T('mn.c.days', { n: CORR_DAYS }) + '</p>';
  }

  /* ============================ 5. THANG DCA ========================== */

  function renderDca() {
    var box = $('mnDca');
    if (!box) return;
    var d = state.dca;
    var l = M.dcaLadder(d);
    if (!l) { box.innerHTML = '<p class="ls-empty">' + T('mn.d.bad') + '</p>'; return; }

    var rows = l.rows.map(function (r) {
      var cr = state.liqMap ? M.clusterRisk(state.liqMap, r.liqPrice) : null;
      return '<tr' + (cr && cr.inCluster ? ' class="mn-in-cluster"' : '') + '>'
        + '<td>' + r.step + '</td>'
        + '<td>' + px(r.price) + ' <span class="muted small">' + signedPct(r.fromEntryPct, 1) + '</span></td>'
        + '<td>' + px(r.avgEntry) + '</td>'
        + '<td class="down">' + px(r.liqPrice) + ' <span class="muted small">'
        + signedPct(r.liqFromNowPct, 1) + '</span>'
        + (cr && cr.inCluster ? ' <span class="jr-thin-tag">' + T('mn.d.cluster') + '</span>' : '')
        + '</td>'
        + '<td>' + pct(r.cumMarginPct, 1) + '</td></tr>';
    }).join('');

    box.innerHTML = '<div class="mn-scroll"><table class="jr-dim-table mn-table"><thead><tr>'
      + '<th>' + T('mn.d.th.step') + '</th><th>' + T('mn.d.th.price') + '</th>'
      + '<th>' + T('mn.d.th.avg') + '</th><th>' + T('mn.d.th.liq') + '</th>'
      + '<th>' + T('mn.d.th.risk') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      + '<p class="' + (l.totalMarginPct >= M.HEAT_RED ? 'mn-alert' : 'hint') + '">'
      + T('mn.d.total', { pct: pct(l.totalMarginPct, 1), steps: l.rows.length }) + '</p>'
      + '<p class="hint">' + T('mn.d.tradeoff') + '</p>'
      + (state.liqMap ? '' : '<p class="hint">' + T('mn.d.noMap') + '</p>');
  }

  /* ============================== dữ liệu ============================= */

  function loadStats() {
    var RS = window.VdearRegimeStats;
    if (!RS) return Promise.resolve();
    var c = RS.cached();
    if (c) { state.stats = c; return Promise.resolve(); }
    // Trang này KHÔNG tự chạy backtest: bảng winrate là của trang /stats và
    // radar. Chưa có thì nói rõ và mời sang đó, không âm thầm tải 24 coin nữa.
    return Promise.resolve();
  }

  function loadJournal() {
    if (!window.VdearJournal) return Promise.resolve();
    return window.VdearJournal.list().then(function (list) {
      state.trades = list || [];
    }).catch(function () { state.trades = []; });
  }

  // Nến ngày của các coin đang mở lệnh -> ma trận tương quan + ATR.
  function loadSeries() {
    var open = state.trades.filter(function (t) { return t.status === 'open' && t.coin; });
    var coins = [];
    open.forEach(function (t) {
      if (coins.indexOf(t.coin) < 0) coins.push(t.coin);
    });
    if (!coins.length || !window.VdearAPI) return Promise.resolve();

    return window.VdearAPI.pool(coins, function (base) {
      return window.VdearAPI.binanceKlines(base + 'USDT', '1d', CORR_DAYS + 5)
        .then(function (c) { return { base: base, candles: c }; })
        .catch(function () { return { base: base, candles: [] }; });
    }, 4).then(function (res) {
      var closesByCoin = {};
      res.forEach(function (r) {
        if (!r.candles || r.candles.length < 12) return;
        closesByCoin[r.base] = r.candles.map(function (c) { return c.close; });
        if (window.VdearTA) {
          state.atrByCoin[r.base] = {
            price: r.candles[r.candles.length - 1].close,
            atr: window.VdearTA.averageTrueRange(r.candles, 14),
          };
        }
      });
      var keys = Object.keys(closesByCoin);
      if (keys.length < 2) { state.corr = null; return; }
      var matrix = M.correlationMatrix(closesByCoin);
      var sides = {};
      open.forEach(function (t) { if (!sides[t.coin]) sides[t.coin] = t.side; });
      state.corr = {
        matrix: matrix,
        effective: M.effectiveN(matrix),
        clusters: M.clusters(matrix, sides, M.CORR_HIGH),
      };
    });
  }

  function loadLiqMap() {
    // Bản đồ cụm thanh lý của chính coin đang tính DCA, để cảnh báo giá thanh
    // lý rơi vào vùng dày. Hỏng thì bỏ qua, không chặn cả trang.
    var base = String(($('mnDcaCoin') || {}).value || 'BTC').toUpperCase();
    if (!window.VdearLiq || !window.VdearAPI) return Promise.resolve();
    var sym = base + 'USDT';
    var H = 'https://fapi.binance.com';
    return Promise.all([
      fetch(H + '/fapi/v1/openInterest?symbol=' + sym).then(function (r) { return r.json(); }).catch(function () { return null; }),
      fetch(H + '/fapi/v1/premiumIndex?symbol=' + sym).then(function (r) { return r.json(); }).catch(function () { return null; }),
      window.VdearAPI.binanceKlines(sym, '1h', 300).catch(function () { return []; }),
    ]).then(function (r) {
      var oi = r[0] && num(r[0].openInterest);
      var price = r[1] && num(r[1].markPrice);
      if (oi == null || price == null || !r[2].length) { state.liqMap = null; return; }
      state.liqMap = window.VdearLiq.clusterMap({
        oiUsd: oi * price, price: price, candles: r[2],
      });
      // Lấy luôn giá thật làm giá vào mặc định của thang DCA, thay cho số 100.
      if (!state.dcaTouched) {
        state.dca.entry = price;
        var el = $('mnDcaEntry');
        if (el) el.value = price;
      }
    }).catch(function () { state.liqMap = null; });
  }

  function renderAll() {
    renderKelly(); renderSizing(); renderHeat(); renderCorr(); renderDca();
  }

  /* ============================== tương tác =========================== */

  function bindNum(id, apply) {
    var el = $(id);
    if (!el) return;
    el.addEventListener('input', function () {
      var v = num(el.value);
      if (v == null) return;
      apply(v);
      renderAll();
    });
  }

  function wire() {
    bindNum('mnRisk', function (v) { if (v > 0 && v <= 20) state.riskPct = v; });
    bindNum('mnAtrMult', function (v) { if (v > 0 && v <= 10) state.atrMult = v; });
    bindNum('mnFixedStop', function (v) { if (v > 0 && v <= 50) state.fixedStopPct = v; });
    bindNum('mnDcaEntry', function (v) { if (v > 0) { state.dca.entry = v; state.dcaTouched = true; } });
    bindNum('mnDcaSteps', function (v) { if (v >= 1 && v <= 20) state.dca.steps = Math.round(v); });
    bindNum('mnDcaSpacing', function (v) { if (v > 0 && v <= 50) state.dca.spacingPct = v; });
    bindNum('mnDcaLev', function (v) { if (v > 1 && v <= 125) state.dca.leverage = v; });
    bindNum('mnDcaMargin', function (v) { if (v > 0 && v <= 50) state.dca.marginPctPerStep = v; });

    var kf = $('mnKellyFrac');
    if (kf) kf.addEventListener('change', function () {
      var v = num(kf.value);
      if (v && v > 0 && v <= 1) { state.kellyFraction = v; renderAll(); }
    });
    var side = $('mnDcaSide');
    if (side) side.addEventListener('change', function () {
      state.dca.side = side.value; renderAll();
    });
    var coin = $('mnDcaCoin');
    if (coin) coin.addEventListener('change', function () {
      loadLiqMap().then(renderAll);
    });
    window.addEventListener('vdear:langchange', renderAll);
  }

  function fillInputs() {
    var set = function (id, v) { var e = $(id); if (e) e.value = v; };
    set('mnRisk', state.riskPct);
    set('mnAtrMult', state.atrMult);
    set('mnFixedStop', state.fixedStopPct);
    set('mnDcaEntry', state.dca.entry);
    set('mnDcaSteps', state.dca.steps);
    set('mnDcaSpacing', state.dca.spacingPct);
    set('mnDcaLev', state.dca.leverage);
    set('mnDcaMargin', state.dca.marginPctPerStep);
    var coin = $('mnDcaCoin');
    if (coin && !coin.options.length) {
      ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE'].forEach(function (c) {
        var o = document.createElement('option');
        o.value = c; o.textContent = c;
        coin.appendChild(o);
      });
    }
  }

  function boot() {
    fillInputs();
    wire();
    renderAll();
    loadStats().then(renderAll);
    loadJournal()
      .then(function () { renderAll(); return loadSeries(); })
      .then(renderAll);
    loadLiqMap().then(renderAll);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
