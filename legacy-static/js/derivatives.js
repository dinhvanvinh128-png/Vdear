/*
 * Vdear — trang Phái sinh: cấu trúc kỳ hạn, basis quy về năm, funding gộp 4 sàn.
 *
 * Trang này KHÔNG tính gì cả. Mọi con số đến từ /api/term-structure (một máy
 * gọi, CDN phục vụ tất cả — xem đầu api/term-structure.js để biết vì sao không
 * gọi thẳng từ trình duyệt).
 *
 * Vẽ bằng SVG như sparkline và đường vốn sẵn có. Không thêm thư viện.
 */
(function () {
  var T = function (k, v) { return window.VdearI18n ? window.VdearI18n.t(k, v) : k; };
  var $ = function (id) { return document.getElementById(id); };
  if (!$('drvTerm')) return;

  var data = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pct(v, d) {
    if (v == null || !Number.isFinite(v)) return '—';
    return (v >= 0 ? '+' : '') + v.toFixed(d == null ? 2 : d) + '%';
  }
  function money(v) {
    if (v == null || !Number.isFinite(v)) return '—';
    var a = Math.abs(v);
    var d = a >= 1000 ? 2 : a >= 1 ? 4 : 8;
    return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: d });
  }
  function shortUsd(v) {
    if (v == null || !Number.isFinite(v)) return '—';
    var a = Math.abs(v);
    if (a >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
    return '$' + v.toFixed(0);
  }
  function cls(v) { return v == null ? 'muted' : v >= 0 ? 'up' : 'down'; }

  /* --------------------------- cấu trúc kỳ hạn --------------------------- */

  var LEVEL_KEY = {
    hot: 'drv.level.hot', high: 'drv.level.high',
    normal: 'drv.level.normal', low: 'drv.level.low', unknown: 'drv.level.unknown',
  };
  var LEVEL_CLS = { hot: 'down', high: 'warn', normal: '', low: 'up', unknown: 'muted' };

  /*
   * Đường basis. Hai đường ngang p20/p80 vẽ đứt nét, vùng giữa tô rất nhạt.
   * Mốc 0 LUÔN nằm trong khung: contango và backwardation là hai trạng thái
   * khác hẳn nhau, thiếu mốc 0 thì hai chuỗi đó vẽ ra trông giống hệt nhau.
   */
  function basisSvg(p) {
    var s = p.series || [];
    var W = 720, H = 190, pad = 16;
    if (s.length < 2) return '<p class="ls-empty">' + T('drv.chart.empty') + '</p>';
    var vals = s.map(function (r) { return r.annualizedPct; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var bp = p.basisPct || {};
    [bp.p20, bp.p80, bp.p90, 0].forEach(function (v) {
      if (v == null) return;
      if (v < lo) lo = v; if (v > hi) hi = v;
    });
    if (hi === lo) hi = lo + 1;
    var span = hi - lo;
    var x = function (i) { return pad + (i / (s.length - 1)) * (W - pad * 2); };
    var y = function (v) { return pad + (1 - (v - lo) / span) * (H - pad * 2); };

    var d = s.map(function (r, i) {
      return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(r.annualizedPct).toFixed(1);
    }).join(' ');
    var zero = y(0).toFixed(1);
    var last = vals[vals.length - 1];
    var col = (p.basisPct && p.basisPct.level === 'hot') ? 'var(--down)'
      : last >= 0 ? 'var(--accent)' : 'var(--down)';
    var lastY = y(last);

    var band = '';
    if (bp.p20 != null && bp.p80 != null) {
      var yTop = y(bp.p80), yBot = y(bp.p20);
      band = '<rect x="' + pad + '" y="' + Math.min(yTop, yBot).toFixed(1)
        + '" width="' + (W - pad * 2) + '" height="' + Math.abs(yBot - yTop).toFixed(1)
        + '" fill="currentColor" fill-opacity="0.10"/>'
        + line(pad, W - pad, yTop, 'currentColor', 0.3, '4 3')
        + line(pad, W - pad, yBot, 'currentColor', 0.3, '4 3');
    }
    var p90line = bp.p90 == null ? ''
      : line(pad, W - pad, y(bp.p90), 'var(--down)', 0.55, '2 4');

    return '<svg class="drv-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"'
      + ' role="img" aria-label="' + esc(T('drv.chart.aria')) + '">'
      + band + p90line
      + line(pad, W - pad, zero, 'currentColor', 0.45, '3 3')
      + '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2" vector-effect="non-scaling-stroke"/>'
      + '<line x1="' + (W - pad) + '" x2="' + (W - pad) + '" y1="' + (lastY - 4).toFixed(1)
      + '" y2="' + (lastY + 4).toFixed(1) + '" stroke="' + col
      + '" stroke-width="5" vector-effect="non-scaling-stroke" stroke-linecap="round"/>'
      + '</svg>';
  }
  function line(x1, x2, yy, stroke, op, dash) {
    return '<line x1="' + x1 + '" x2="' + x2 + '" y1="' + yy + '" y2="' + yy
      + '" stroke="' + stroke + '" stroke-opacity="' + op + '" stroke-dasharray="' + dash
      + '" vector-effect="non-scaling-stroke"/>';
  }

  function contractRows(p) {
    if (!p.contracts || !p.contracts.length) {
      return '<p class="ls-empty">' + T('drv.noQuarter') + '</p>';
    }
    return '<div class="drv-scroll"><table class="jr-dim-table drv-table"><thead><tr>'
      + '<th>' + T('drv.th.contract') + '</th><th>' + T('drv.th.price') + '</th>'
      + '<th>' + T('drv.th.days') + '</th><th>' + T('drv.th.basis') + '</th>'
      + '</tr></thead><tbody>'
      + p.contracts.map(function (c) {
        return '<tr><td>' + esc(c.symbol)
          + (c.nearExpiry ? ' <span class="jr-thin-tag">' + T('drv.nearExpiry') + '</span>' : '')
          + '</td>'
          + '<td>' + money(c.price) + '</td>'
          + '<td>' + (c.daysToDelivery == null ? '—' : c.daysToDelivery.toFixed(1)) + '</td>'
          + '<td class="' + cls(c.annualizedPct) + '">' + pct(c.annualizedPct) + '</td></tr>';
      }).join('')
      + '</tbody></table></div>';
  }

  function renderTerm() {
    var box = $('drvTerm');
    if (!data || !data.pairs) { box.innerHTML = '<p class="ls-empty">' + T('drv.loadFailed') + '</p>'; return; }
    var keys = Object.keys(data.pairs);
    if (!keys.length) { box.innerHTML = '<p class="ls-empty">' + T('drv.loadFailed') + '</p>'; return; }

    box.innerHTML = keys.map(function (k) {
      var p = data.pairs[k];
      var bp = p.basisPct || {};
      var lvl = bp.level || 'unknown';
      var hasSeries = !!(p.series && p.series.length >= 2);
      return '<div class="drv-pair">'
        + '<div class="drv-pair-head">'
        + '  <b>' + esc(p.base || k) + '</b>'
        + '  <span class="muted small">' + T('drv.perp') + ' ' + money(p.perpPrice) + '</span>'
        + '  <span class="oi-badge ' + (LEVEL_CLS[lvl] || '') + '"><i></i>'
        + T(LEVEL_KEY[lvl]) + ' <b>' + pct(bp.current) + '</b></span>'
        + '</div>'
        + contractRows(p)
        // Không có hợp đồng quý thì không có gì để vẽ và không có mẫu để mô tả.
        // Vẫn dựng khung 150px rỗng và một dòng "p20 — · p80 —" chỉ tổ làm
        // người đọc tưởng dữ liệu hỏng.
        + (hasSeries ? basisSvg(p) : '')
        + (hasSeries ? '<p class="hint drv-legend">' + T('drv.legend', {
          n: bp.samples || 0,
          lo: pct(Math.min.apply(null, p.series.map(function (r) { return r.annualizedPct; }))),
          hi: pct(Math.max.apply(null, p.series.map(function (r) { return r.annualizedPct; }))),
          p20: bp.p20 == null ? '—' : pct(bp.p20),
          p80: bp.p80 == null ? '—' : pct(bp.p80),
          p90: bp.p90 == null ? '—' : pct(bp.p90),
        }) + '</p>' : '')
        + '</div>';
    }).join('');
  }

  /* ------------------------------- funding ------------------------------- */

  var VENUE_LABEL = { binance: 'Binance', bybit: 'Bybit', okx: 'OKX', bitget: 'Bitget' };

  function venueRows(f) {
    return '<div class="drv-scroll"><table class="jr-dim-table drv-table"><thead><tr>'
      + '<th>' + T('drv.th.venue') + '</th><th>' + T('drv.th.rate') + '</th>'
      + '<th>' + T('drv.th.interval') + '</th><th>' + T('drv.th.apr') + '</th>'
      + '<th>' + T('drv.th.oi') + '</th></tr></thead><tbody>'
      + (f.venues || []).map(function (v) {
        var off = v.aprPct == null || v.oiUsd == null;
        return '<tr' + (off ? ' class="jr-thin"' : '') + '>'
          + '<td>' + esc(VENUE_LABEL[v.id] || v.id)
          + (v.why ? ' <span class="jr-thin-tag">' + esc(v.why) + '</span>' : '')
          + '</td>'
          + '<td>' + (v.ratePct == null ? '—' : pct(v.ratePct, 4)) + '</td>'
          + '<td>' + (v.intervalHours == null ? '—' : v.intervalHours + 'h'
            + (v.intervalAssumed ? ' <span class="jr-thin-tag">' + T('drv.assumed') + '</span>' : ''))
          + '</td>'
          + '<td class="' + cls(v.aprPct) + '">' + pct(v.aprPct) + '</td>'
          + '<td>' + shortUsd(v.oiUsd) + '</td></tr>';
      }).join('')
      + '</tbody></table></div>';
  }

  /*
   * Thanh chi phí: 0%/năm ở giữa, dương sang phải (LONG trả phí), âm sang trái.
   * Trần ±100%/năm để một giá trị cực đoan không nén phần còn lại thành vạch.
   */
  function costBar(apr) {
    if (apr == null) return '<p class="ls-empty">' + T('drv.noFunding') + '</p>';
    var cap = 100;
    var v = Math.max(-cap, Math.min(cap, apr));
    var half = Math.abs(v) / cap * 50;
    var side = v >= 0 ? 'left:50%' : 'right:50%';
    var color = v >= 0 ? 'var(--down)' : 'var(--up)';
    return '<div class="drv-bar" role="img" aria-label="'
      + esc(T('drv.costAria', { v: pct(apr) })) + '">'
      + '<i style="' + side + ';width:' + half.toFixed(2) + '%;background:' + color + '"></i>'
      + '</div>'
      + '<div class="drv-bar-scale"><span>−' + cap + '%</span><span>0</span><span>+' + cap + '%</span></div>';
  }

  function extremeNote(f) {
    var e = f.extreme || {};
    if (!e.enough) {
      return '<p class="hint">' + T('drv.extreme.needMore', { have: e.have || 0, need: e.need || 30 }) + '</p>';
    }
    if (e.extreme) {
      return '<p class="drv-alert">' + T('drv.extreme.on', {
        p: e.percentile, days: (e.streakDays || 0).toFixed(1),
        thr: pct(e.threshold), cur: pct(e.current),
      }) + '</p>';
    }
    return '<p class="hint">' + T('drv.extreme.off', {
      p: e.percentile, thr: pct(e.threshold), cur: pct(e.current),
      streak: (e.streakDays || 0).toFixed(1),
    }) + '</p>';
  }

  function renderFunding() {
    var box = $('drvFunding');
    if (!data || !data.pairs) { box.innerHTML = '<p class="ls-empty">' + T('drv.loadFailed') + '</p>'; return; }
    box.innerHTML = Object.keys(data.pairs).map(function (k) {
      var p = data.pairs[k], f = p.funding || {};
      var cov = f.coverage == null ? 0 : Math.round(f.coverage * 100);
      return '<div class="drv-pair">'
        + '<div class="drv-pair-head"><b>' + esc(p.base || k) + '</b>'
        + '<span class="muted small">' + T('drv.coverage', { n: cov }) + '</span>'
        + '<span class="oi-badge ' + cls(f.weightedAprPct) + '"><i></i>'
        + T('drv.cost') + ' <b>' + pct(f.weightedAprPct) + '</b></span></div>'
        + costBar(f.weightedAprPct)
        + '<p class="hint">' + T(f.weightedAprPct == null ? 'drv.cost.none'
          : f.weightedAprPct >= 0 ? 'drv.cost.longPays' : 'drv.cost.shortPays') + '</p>'
        + venueRows(f)
        + extremeNote(f)
        + '</div>';
    }).join('');
  }

  /* ------------------------------- khởi động ----------------------------- */

  function renderAge() {
    var el = $('drvAge');
    if (!el || !data || !data.generatedAt) return;
    var age = Math.max(0, Math.round((Date.now() - new Date(data.generatedAt).getTime()) / 1000));
    // Nói rõ dữ liệu bao nhiêu giây tuổi. Người đọc phải biết mình đang xem số
    // vừa lấy hay số của CDN từ năm phút trước.
    el.textContent = T('drv.age', { n: age });
  }

  function renderAll() { renderTerm(); renderFunding(); renderAge(); }

  async function load() {
    try {
      var r = await fetch('/api/term-structure', { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      data = await r.json();
    } catch (e) {
      data = null;
    }
    renderAll();
  }

  function boot() {
    load();
    setInterval(function () { if (!document.hidden) load(); }, 5 * 60000);
    window.addEventListener('vdear:langchange', renderAll);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
