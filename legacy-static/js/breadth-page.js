/*
 * Vdearypto — khối "độ rộng thị trường" trên /stats.
 *
 * Không tính gì ở đây. Mọi con số đến từ /api/breadth (một máy gọi, CDN phục
 * vụ tất cả — xem đầu api/breadth.js để biết vì sao không gọi thẳng từ trình
 * duyệt).
 *
 * Vẽ bằng SVG như các sparkline sẵn có, không thêm thư viện.
 */
(function () {
  var T = function (k, v) { return window.VdearI18n ? window.VdearI18n.t(k, v) : k; };
  var $ = function (id) { return document.getElementById(id); };
  if (!$('brWrap')) return;

  var data = null, failed = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pct(v, d) {
    if (v == null || !Number.isFinite(v)) return '—';
    return v.toFixed(d == null ? 1 : d) + '%';
  }
  function signed(v, d) {
    if (v == null || !Number.isFinite(v)) return '—';
    return (v >= 0 ? '+' : '') + v.toFixed(d == null ? 1 : d);
  }

  /*
   * Đường độ rộng. Trục dọc CỐ ĐỊNH 0–100%: đây là tỉ lệ phần trăm, co trục
   * theo giá trị nhỏ nhất/lớn nhất sẽ biến một dao động 48–52% trông y hệt một
   * cú sập từ 90% xuống 10%.
   */
  function spark(vals, color) {
    var W = 320, H = 74, pad = 5;
    var pts = vals.filter(function (v) { return v != null && Number.isFinite(v); });
    if (pts.length < 2) return '<p class="ls-empty">' + T('br.noSeries') + '</p>';
    var x = function (i) { return pad + (i / (vals.length - 1)) * (W - pad * 2); };
    var y = function (v) { return pad + (1 - v / 100) * (H - pad * 2); };
    var d = '', started = false;
    for (var i = 0; i < vals.length; i++) {
      var v = vals[i];
      if (v == null || !Number.isFinite(v)) continue;
      d += (started ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + ' ';
      started = true;
    }
    var half = y(50).toFixed(1);
    return '<svg class="br-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"'
      + ' role="img" aria-label="' + esc(T('br.chartAria')) + '">'
      + '<line x1="' + pad + '" x2="' + (W - pad) + '" y1="' + half + '" y2="' + half
      + '" stroke="currentColor" stroke-opacity="0.35" stroke-dasharray="3 3"'
      + ' vector-effect="non-scaling-stroke"/>'
      + '<path d="' + d.trim() + '" fill="none" stroke="' + color + '" stroke-width="2"'
      + ' vector-effect="non-scaling-stroke"/></svg>';
  }

  function metric(key, vals, color) {
    var last = null;
    for (var i = vals.length - 1; i >= 0; i--) {
      if (vals[i] != null && Number.isFinite(vals[i])) { last = vals[i]; break; }
    }
    return '<div class="br-cell">'
      + '<div class="br-head"><span>' + T('br.' + key) + '</span>'
      + '<b>' + pct(last) + '</b></div>'
      + spark(vals, color)
      + '<p class="hint">' + T('br.' + key + '.note') + '</p>'
      + '</div>';
  }

  function divergenceBlock(d) {
    if (!d || !d.enough) {
      return '<p class="hint">' + T('br.div.notEnough') + '</p>';
    }
    if (d.diverging) {
      return '<p class="br-alert">' + T('br.div.on', {
        days: d.streak, btc: signed(d.btcChangePct), pts: signed(d.breadthChangePts),
      }) + '</p>';
    }
    return '<p class="hint">' + T('br.div.off', {
      streak: d.streak, need: d.need,
      btc: signed(d.btcChangePct), pts: signed(d.breadthChangePts),
    }) + '</p>';
  }

  function render() {
    var box = $('brWrap');
    if (!box) return;
    if (failed || (data && data.ok === false)) {
      box.innerHTML = '<p class="ls-empty">' + T('br.failed') + '</p>';
      return;
    }
    if (!data) { box.innerHTML = '<p class="ls-empty">' + T('br.loading') + '</p>'; return; }
    var rows = data.rows || [];
    if (!rows.length) { box.innerHTML = '<p class="ls-empty">' + T('br.failed') + '</p>'; return; }

    var col = function (k) { return rows.map(function (r) { return r[k]; }); };
    box.innerHTML = '<div class="br-grid">'
      + metric('ma200', col('aboveMa200'), 'var(--accent)')
      + metric('newHigh', col('newHigh30'), 'var(--up)')
      + metric('up24h', col('up24h'), 'var(--gold)')
      + '</div>'
      + divergenceBlock(data.divergence);

    var meta = $('brMeta');
    if (meta) {
      meta.textContent = T('br.meta', { coins: data.coins || 0, days: rows.length });
    }
  }

  function load() {
    return fetch('/api/breadth', { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (j) { data = j; failed = false; })
      .catch(function () { failed = true; data = null; })
      .then(render);
  }

  function boot() {
    render();
    load();
    window.addEventListener('vdear:langchange', render);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
