/*
 * Vdearypto — trang Bản đồ thanh lý (ước tính).
 *
 * Phần tính nằm trong js/liq.js. Tệp này chỉ lấy dữ liệu và vẽ.
 *
 * NGUYÊN TẮC CỦA TRANG NÀY: cảnh báo "đây là ƯỚC TÍNH" phải nằm NGAY CẠNH
 * biểu đồ, cùng tầm mắt, không nằm trong tooltip và không nằm cuối trang. Ai
 * nhìn thấy biểu đồ thì cùng lúc phải nhìn thấy dòng cảnh báo. Nếu về sau có
 * ai dời khối #liqWarn đi chỗ khác thì bài kiểm tra vị trí sẽ hỏng — đó là chủ
 * ý, không phải bài kiểm tra khó tính.
 */
(function () {
  var T = function (k, v) { return window.VdearI18n ? window.VdearI18n.t(k, v) : k; };
  var $ = function (id) { return document.getElementById(id); };
  if (!$('liqCanvas')) return;

  var HOST = 'https://fapi.binance.com';
  var CANDLES = 300;
  var DEPTH_LIMIT = 1000;

  var state = {
    base: 'BTC',
    tf: '1h',
    leverage: window.VdearLiq.LEVERAGE_DEFAULT.map(function (r) {
      return { lev: r.lev, share: r.share * 100 };
    }),
    mmr: window.VdearLiq.MMR_DEFAULT * 100,
    bandPct: window.VdearLiq.BAND_PCT_DEFAULT,
    data: null,
    loading: false,
    error: null,
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function usd(v) {
    if (v == null || !Number.isFinite(v)) return '—';
    var a = Math.abs(v);
    if (a >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
    return '$' + v.toFixed(0);
  }
  function px(v) {
    if (v == null || !Number.isFinite(v)) return '—';
    var a = Math.abs(v);
    var d = a >= 1000 ? 2 : a >= 1 ? 4 : 8;
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: d });
  }
  function pctS(v, d) {
    if (v == null || !Number.isFinite(v)) return '—';
    return (v >= 0 ? '+' : '') + v.toFixed(d == null ? 2 : d) + '%';
  }

  /* ------------------------------ lấy dữ liệu ---------------------------- */

  function getJSON(url) {
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
      return r.json();
    });
  }

  function load() {
    var base = state.base;
    var sym = base + 'USDT';
    state.loading = true; state.error = null;
    render();

    // Bốn nguồn, mỗi nguồn hỏng riêng. Thiếu sổ lệnh vẫn vẽ được bản đồ cụm,
    // chỉ là không mô phỏng được chuỗi — nên đừng để một lỗi giết cả trang.
    var pOi = getJSON(HOST + '/fapi/v1/openInterest?symbol=' + sym).catch(function () { return null; });
    var pMark = getJSON(HOST + '/fapi/v1/premiumIndex?symbol=' + sym).catch(function () { return null; });
    var pK = window.VdearAPI.binanceKlines(sym, tfBinance(state.tf), CANDLES).catch(function () { return []; });
    var pBook = getJSON(HOST + '/fapi/v1/depth?symbol=' + sym + '&limit=' + DEPTH_LIMIT)
      .catch(function () { return null; });
    var pLs = window.VdearOI
      ? window.VdearOI.latestRatio(base, 'top', state.tf).catch(function () { return null; })
      : Promise.resolve(null);

    return Promise.all([pOi, pMark, pK, pBook, pLs]).then(function (r) {
      var oiRaw = r[0], mark = r[1], candles = r[2], bookRaw = r[3], ls = r[4];
      var contracts = oiRaw ? Number(oiRaw.openInterest) : NaN;
      var price = mark ? Number(mark.markPrice) : NaN;
      if (!Number.isFinite(contracts) || !Number.isFinite(price) || !candles.length) {
        state.loading = false;
        state.error = 'source';
        state.data = null;
        render();
        return;
      }
      var oiUsd = contracts * price;
      var lev = state.leverage.map(function (x) { return { lev: x.lev, share: x.share }; });
      var map = window.VdearLiq.clusterMap({
        oiUsd: oiUsd, price: price, candles: candles,
        // Tỉ lệ vị thế long/short của nhóm tài khoản lớn. Không có thì để
        // undefined để clusterMap tự bật cờ "đã giả định 50/50".
        longShare: ls && Number.isFinite(ls.long) ? ls.long : undefined,
        leverage: lev, mmr: state.mmr / 100, bandPct: state.bandPct,
      });
      var book = window.VdearLiq.normBook(bookRaw);
      state.data = {
        base: base, price: price, oiUsd: oiUsd, contracts: contracts,
        candles: candles, map: map, book: book,
        pressure: map ? window.VdearLiq.netPressure(map) : null,
        down: map ? window.VdearLiq.dangerLevel(map, book, -1) : null,
        up: map ? window.VdearLiq.dangerLevel(map, book, 1) : null,
        lsFromSource: !!(ls && Number.isFinite(ls.long)),
        at: Date.now(),
      };
      state.loading = false;
      render();
    });
  }

  function tfBinance(id) {
    var cfg = window.VDEAR_CONFIG;
    var row = cfg && cfg.timeframes.find(function (t) { return t.id === id; });
    return row ? row.binance : '1h';
  }

  /* -------------------------------- vẽ ---------------------------------- */

  /*
   * Một canvas duy nhất: heatmap cụm thanh lý nằm DƯỚI, đường giá nằm TRÊN,
   * dùng chung một trục giá. Vẽ riêng hai khung rồi đặt cạnh nhau thì mắt phải
   * tự bắc cầu giữa hai trục — đúng lúc dễ đọc nhầm nhất.
   */
  function draw() {
    var cv = $('liqCanvas');
    if (!cv) return;
    var d = state.data;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = cv.clientWidth || 900;
    var h = cv.clientHeight || 380;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    var g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    var css = getComputedStyle(document.documentElement);
    var COL = {
      grid: (css.getPropertyValue('--line') || 'rgba(216,163,43,.12)').trim(),
      text: (css.getPropertyValue('--muted') || '#9A9078').trim(),
      line: (css.getPropertyValue('--accent') || '#D8A32B').trim(),
      up: (css.getPropertyValue('--up') || '#4FB477').trim(),
      down: (css.getPropertyValue('--down') || '#E0574F').trim(),
    };

    if (!d || !d.map) {
      g.fillStyle = COL.text; g.font = '13px Inter, system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(state.loading ? T('liq.loading') : T('liq.noData'), w / 2, h / 2);
      return;
    }

    var padL = 8, padR = 74, padT = 10, padB = 20;
    var plotW = w - padL - padR, plotH = h - padT - padB;
    var map = d.map;
    var yOf = function (p) { return padT + (1 - (p - map.lo) / (map.hi - map.lo)) * plotH; };

    // 1. heatmap: mỗi ô một dải ngang, độ đục theo mật độ USD.
    var mx = window.VdearLiq.peak(map) || 1;
    for (var i = 0; i < map.bins.length; i++) {
      var b = map.bins[i];
      var y0 = yOf(b.hi), y1 = yOf(b.lo);
      var hh = Math.max(1, y1 - y0);
      if (b.longUsd > 0) {
        g.fillStyle = rgba(COL.down, 0.06 + 0.62 * Math.sqrt(b.longUsd / mx));
        g.fillRect(padL, y0, plotW, hh);
      }
      if (b.shortUsd > 0) {
        g.fillStyle = rgba(COL.up, 0.06 + 0.62 * Math.sqrt(b.shortUsd / mx));
        g.fillRect(padL, y0, plotW, hh);
      }
    }

    // 2. đường giá của chính khoảng nến đã dùng để suy giá vào lệnh.
    var cs = d.candles;
    g.beginPath();
    for (var k = 0; k < cs.length; k++) {
      var x = padL + (k / Math.max(1, cs.length - 1)) * plotW;
      var y = yOf(cs[k].close);
      if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokeStyle = COL.line; g.lineWidth = 1.6; g.stroke();

    // 3. giá hiện tại
    var yp = yOf(map.price);
    g.strokeStyle = COL.text; g.globalAlpha = 0.75;
    g.setLineDash([4, 3]); g.beginPath();
    g.moveTo(padL, yp); g.lineTo(w - padR, yp); g.stroke();
    g.setLineDash([]); g.globalAlpha = 1;

    // 4. ngưỡng nguy hiểm
    [[d.down, COL.down], [d.up, COL.up]].forEach(function (pair) {
      if (!pair[0]) return;
      var yy = yOf(pair[0].price);
      g.strokeStyle = pair[1]; g.lineWidth = 2;
      g.setLineDash([2, 4]); g.beginPath();
      g.moveTo(padL, yy); g.lineTo(w - padR, yy); g.stroke();
      g.setLineDash([]);
    });

    // 5. thang giá bên phải
    g.fillStyle = COL.text;
    g.font = '10px "JetBrains Mono", ui-monospace, monospace';
    g.textAlign = 'left';
    for (var s = 0; s <= 4; s++) {
      var pv = map.lo + (map.hi - map.lo) * (s / 4);
      var yy2 = yOf(pv);
      g.globalAlpha = 0.28;
      g.beginPath(); g.moveTo(padL, yy2); g.lineTo(w - padR, yy2);
      g.strokeStyle = COL.grid; g.lineWidth = 1; g.stroke();
      g.globalAlpha = 1;
      g.fillText(short(pv), w - padR + 6, yy2 + 3);
    }
    g.fillStyle = COL.line;
    g.fillText(short(map.price) + ' ←', w - padR + 6, yp + 3);
  }
  function short(v) {
    if (v >= 1000) return v.toFixed(0);
    if (v >= 1) return v.toFixed(2);
    return v.toPrecision(4);
  }
  function rgba(hex, a) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex).trim());
    if (!m) return 'rgba(224,87,79,' + a + ')';
    return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ','
      + parseInt(m[3], 16) + ',' + a + ')';
  }

  /* ------------------------------ khối chữ ------------------------------- */

  function renderPressure() {
    var el = $('liqPressure');
    if (!el) return;
    var p = state.data && state.data.pressure;
    if (!p || p.skew == null) {
      el.innerHTML = '<p class="ls-empty">' + T('liq.pressure.none') + '</p>';
      return;
    }
    var leftPct = (1 - (p.skew + 1) / 2) * 100;   // phần short ở bên phải
    el.innerHTML = '<div class="liq-bal" role="img" aria-label="'
      + esc(T('liq.pressure.aria', { down: usd(p.belowUsd), up: usd(p.aboveUsd) })) + '">'
      + '<i class="down" style="width:' + (100 - leftPct).toFixed(1) + '%"></i>'
      + '<i class="up" style="width:' + leftPct.toFixed(1) + '%"></i>'
      + '</div>'
      + '<div class="liq-bal-legend">'
      + '<span class="down">' + T('liq.pressure.below') + ' <b>' + usd(p.belowUsd) + '</b></span>'
      + '<span class="up">' + T('liq.pressure.above') + ' <b>' + usd(p.aboveUsd) + '</b></span>'
      + '</div>';
  }

  function dangerBlock(d, dir) {
    if (!d) {
      return '<div class="liq-danger empty"><b>' + T(dir < 0 ? 'liq.danger.down' : 'liq.danger.up')
        + '</b><p class="hint">' + T('liq.danger.none', {
          pct: window.VdearLiq.CHAIN_MIN_PCT, rounds: window.VdearLiq.CHAIN_MIN_ROUNDS,
        }) + '</p></div>';
    }
    var c = d.cascade;
    // Chuỗi ăn hết sổ lệnh nhìn thấy được: con số độ trượt lúc này là CHẶN
    // DƯỚI. In "$87,80 (−12,09%)" như một đích đến là nói quá thứ ta biết —
    // thứ ta biết chỉ là "ít nhất tới mép sổ".
    var body = c.exhausted
      ? T('liq.danger.bodyMin', {
        rounds: c.rounds, usd: usd(c.totalLiquidatedUsd),
        move: pctS(c.movePct),
      })
      : T('liq.danger.body', {
        rounds: c.rounds, usd: usd(c.totalLiquidatedUsd),
        to: px(c.finalPrice), move: pctS(c.movePct),
      });
    return '<div class="liq-danger ' + (dir < 0 ? 'down' : 'up') + '">'
      + '<b>' + T(dir < 0 ? 'liq.danger.down' : 'liq.danger.up') + '</b>'
      + '<div class="liq-danger-price">' + px(d.price)
      + ' <span class="muted small">' + pctS(d.fromCurrentPct) + '</span></div>'
      + '<p class="hint">' + body + '</p>'
      + (c.exhausted
        ? '<p class="hint liq-warn-inline">' + T('liq.exhausted') + '</p>' : '')
      + '</div>';
  }

  function renderNumbers() {
    var el = $('liqNumbers');
    if (!el) return;
    var d = state.data;
    if (!d || !d.map) {
      el.innerHTML = '<p class="ls-empty">'
        + T(state.loading ? 'liq.loading' : state.error ? 'liq.loadFailed' : 'liq.noData') + '</p>';
      return;
    }
    var a = d.map.assumptions;
    var outPct = d.oiUsd > 0 ? d.map.outsideBandUsd / d.oiUsd * 100 : null;
    el.innerHTML = '<div class="liq-grid">'
      + cell(T('liq.n.oi'), usd(d.oiUsd))
      + cell(T('liq.n.price'), px(d.price))
      + cell(T('liq.n.longSide'), usd(d.map.totalLongUsd))
      + cell(T('liq.n.shortSide'), usd(d.map.totalShortUsd))
      + '</div>'
      + '<p class="hint">' + T('liq.n.split', {
        long: (a.longShare * 100).toFixed(0), short: ((1 - a.longShare) * 100).toFixed(0),
      }) + ' ' + T(a.longShareAssumed ? 'liq.n.splitAssumed' : 'liq.n.splitSource') + '</p>'
      + (outPct != null && outPct > 1
        ? '<p class="hint">' + T('liq.n.outside', {
          pct: outPct.toFixed(1), band: d.map.bandPct,
        }) + '</p>' : '')
      + (a.vwapApprox > 0
        ? '<p class="hint">' + T('liq.n.vwapApprox', { n: a.vwapApprox, all: a.entryCandles }) + '</p>'
        : '')
      + (d.book ? '' : '<p class="hint liq-warn-inline">' + T('liq.noBook') + '</p>');
  }
  function cell(label, value) {
    return '<div class="liq-cell"><span>' + label + '</span><b>' + value + '</b></div>';
  }

  function renderDanger() {
    var el = $('liqDanger');
    if (!el) return;
    if (!state.data || !state.data.map) { el.innerHTML = ''; return; }
    el.innerHTML = dangerBlock(state.data.down, -1) + dangerBlock(state.data.up, 1);
  }

  function renderControls() {
    var box = $('liqLev');
    if (!box) return;
    box.innerHTML = state.leverage.map(function (r, i) {
      return '<label class="liq-lev"><span>' + r.lev + 'x</span>'
        + '<input type="number" min="0" max="100" step="1" value="' + r.share
        + '" data-lev="' + i + '" aria-label="' + esc(T('liq.lev.aria', { lev: r.lev })) + '">'
        + '<span class="liq-unit">%</span></label>';
    }).join('');
    var sum = state.leverage.reduce(function (a, r) { return a + (Number(r.share) || 0); }, 0);
    var note = $('liqLevSum');
    if (note) {
      note.textContent = T('liq.lev.sum', { n: sum.toFixed(0) });
      note.classList.toggle('warn', Math.abs(sum - 100) > 0.5);
    }
    var m = $('liqMmr');
    if (m && document.activeElement !== m) m.value = state.mmr;
    var b = $('liqBand');
    if (b && document.activeElement !== b) b.value = state.bandPct;
  }

  function renderMeta() {
    var el = $('liqMeta');
    if (!el) return;
    var d = state.data;
    if (!d) { el.textContent = ''; return; }
    el.textContent = T('liq.meta', {
      coin: d.base,
      tf: (window.VDEAR_CONFIG.timeframes.find(function (t) { return t.id === state.tf; }) || {}).label || state.tf,
      n: d.candles.length,
    });
  }

  function render() {
    renderNumbers(); renderPressure(); renderDanger(); renderControls(); renderMeta();
    draw();
  }

  /* ------------------------------ tương tác ------------------------------ */

  function recompute() {
    // Đổi giả định thì KHÔNG gọi lại mạng: dữ liệu thật không đổi, chỉ mô hình
    // đổi. Gọi lại là tự đốt hạn mức IP của người dùng vì một con số họ gõ.
    var d = state.data;
    if (!d) return;
    var map = window.VdearLiq.clusterMap({
      oiUsd: d.oiUsd, price: d.price, candles: d.candles,
      longShare: d.lsFromSource ? d.map.assumptions.longShare : undefined,
      leverage: state.leverage.map(function (x) { return { lev: x.lev, share: x.share }; }),
      mmr: state.mmr / 100, bandPct: state.bandPct,
    });
    d.map = map;
    d.pressure = map ? window.VdearLiq.netPressure(map) : null;
    d.down = map ? window.VdearLiq.dangerLevel(map, d.book, -1) : null;
    d.up = map ? window.VdearLiq.dangerLevel(map, d.book, 1) : null;
    render();
  }

  function wire() {
    var box = $('liqLev');
    if (box) {
      box.addEventListener('input', function (e) {
        var i = e.target && e.target.getAttribute('data-lev');
        if (i == null) return;
        var v = Number(e.target.value);
        state.leverage[Number(i)].share = Number.isFinite(v) && v >= 0 ? v : 0;
        recompute();
      });
    }
    var m = $('liqMmr');
    if (m) m.addEventListener('input', function () {
      var v = Number(m.value);
      if (Number.isFinite(v) && v > 0 && v < 50) { state.mmr = v; recompute(); }
    });
    var b = $('liqBand');
    if (b) b.addEventListener('input', function () {
      var v = Number(b.value);
      if (Number.isFinite(v) && v >= 1 && v <= 90) { state.bandPct = v; recompute(); }
    });
    var reset = $('liqReset');
    if (reset) reset.addEventListener('click', function () {
      state.leverage = window.VdearLiq.LEVERAGE_DEFAULT.map(function (r) {
        return { lev: r.lev, share: r.share * 100 };
      });
      state.mmr = window.VdearLiq.MMR_DEFAULT * 100;
      state.bandPct = window.VdearLiq.BAND_PCT_DEFAULT;
      recompute();
    });
    var coin = $('liqCoin');
    if (coin) coin.addEventListener('change', function () {
      state.base = String(coin.value || 'BTC').toUpperCase();
      load();
    });
    var tf = $('liqTf');
    if (tf) tf.addEventListener('change', function () { state.tf = tf.value; load(); });

    window.addEventListener('resize', draw);
    window.addEventListener('vdear:langchange', render);
  }

  function fillSelects() {
    var tf = $('liqTf');
    if (tf && window.VDEAR_CONFIG) {
      tf.innerHTML = window.VDEAR_CONFIG.timeframes
        .filter(function (t) { return ['15m', '1h', '4h', '1d'].indexOf(t.id) >= 0; })
        .map(function (t) {
          return '<option value="' + t.id + '"' + (t.id === state.tf ? ' selected' : '') + '>'
            + esc(t.label) + '</option>';
        }).join('');
    }
    var coin = $('liqCoin');
    if (coin && !coin.options.length) {
      ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE'].forEach(function (c) {
        var o = document.createElement('option');
        o.value = c; o.textContent = c;
        if (c === state.base) o.selected = true;
        coin.appendChild(o);
      });
    }
  }

  function boot() {
    var q = new URLSearchParams(location.search).get('c');
    if (q) state.base = q.toUpperCase();
    fillSelects();
    wire();
    render();
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
