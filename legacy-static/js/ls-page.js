/*
 * Vdearypto — trang Long / Short (/longshort.html).
 *
 * HAI CON SỐ, KHÔNG PHẢI MỘT
 * --------------------------
 * Binance công bố hai tỉ lệ và chúng đo hai thứ khác nhau:
 *   globalLongShortAccountRatio  — đếm ĐẦU NGƯỜI (bao nhiêu % tài khoản đang long)
 *   topLongShortPositionRatio    — đếm TIỀN (bao nhiêu % giá trị vị thế của nhóm lớn nhất là long)
 * Trộn hai con số này lại rồi gọi là "tỉ lệ long/short" là sai về bản chất, nên
 * trang này luôn ghi rõ đang xem cái nào, và khi hiện cả hai thì đặt cạnh nhau
 * chứ không bao giờ cộng hay lấy trung bình.
 *
 * NGUỒN SỐ
 * --------
 * Bảng lấy tỉ lệ TÀI KHOẢN từ /api/oi-scan (máy chủ quét, CDN phục vụ chung).
 * Tỉ lệ VỊ THẾ của top trader chỉ tải khi người dùng mở rộng một dòng — một
 * request cho đúng coin đó, có bộ đệm trong js/oi.js.
 *
 * KHÔNG PHẢI TÍN HIỆU
 * -------------------
 * Chênh lệch giữa hai tỉ lệ được mô tả như một trạng thái đã quan sát được,
 * không kèm dự báo giá và không kèm lời khuyên vào lệnh.
 */
(function () {
  var T = function (k, v) { return window.VdearI18n ? window.VdearI18n.t(k, v) : k; };
  var $ = function (id) { return document.getElementById(id); };
  if (!$('lsBody2')) return;

  var API = window.VdearAPI, OI = window.VdearOI;
  var DETAIL_TF = '1h';

  // Ngưỡng gọi là "lệch mạnh". Đặt ở 60/40 chứ không phải 50/50: quanh mốc cân
  // bằng thì nhiễu vài phần trăm cũng đổi nhãn, và nhãn đổi xoành xoạch thì
  // không mô tả được gì.
  var SKEW = 60;

  var market = [], scan = null, scanFailed = false, marketFailed = false;
  var rows = [], sortKey = 'longPct', sortDir = -1, filter = 'all', openBase = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pct(v, d) {
    if (v == null || !Number.isFinite(v)) return '—';
    return v.toFixed(d == null ? 1 : d) + '%';
  }
  function signed(v) {
    if (v == null || !Number.isFinite(v)) return '—';
    return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
  }
  function price(v) {
    if (v == null || !Number.isFinite(v)) return '—';
    return '$' + (v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 })
      : v >= 1 ? v.toFixed(2) : v.toPrecision(4));
  }
  function chgCls(v) { return v == null || !Number.isFinite(v) ? 'muted' : v >= 0 ? 'up' : 'down'; }

  function lean(longPct) {
    if (longPct == null || !Number.isFinite(longPct)) return null;
    if (longPct >= SKEW) return 'long';
    if (longPct <= 100 - SKEW) return 'short';
    return 'balanced';
  }
  var LEAN_KEY = { long: 'ls.leanLong', short: 'ls.leanShort', balanced: 'ls.balanced' };

  /* --------------------------- ghép dữ liệu ----------------------------- */

  function build() {
    var coins = (scan && scan.coins) || {};
    var out = [];
    for (var i = 0; i < market.length; i++) {
      var m = market[i], c = coins[m.base];
      if (!c) continue;                       // ngoài phạm vi quét: không dựng dòng giả
      if (c.longPct == null) continue;        // có trong quét nhưng nguồn không có tỉ lệ
      out.push({
        base: m.base, price: m.price, change: m.change,
        longPct: c.longPct, shortPct: c.shortPct,
        lean: lean(c.longPct),
      });
    }
    rows = out;
  }

  function visible() {
    var list = rows.slice();
    if (filter !== 'all') list = list.filter(function (r) { return r.lean === filter; });
    list.sort(function (a, b) {
      if (sortKey === 'base') return sortDir * String(a.base).localeCompare(String(b.base));
      var x = a[sortKey], y = b[sortKey];
      var xn = x != null && Number.isFinite(x), yn = y != null && Number.isFinite(y);
      if (!xn && !yn) return 0;
      if (!xn) return 1;                      // thiếu dữ liệu luôn xuống cuối
      if (!yn) return -1;
      return sortDir * (x - y);
    });
    return list;
  }

  /* ------------------------------- tóm tắt ------------------------------ */

  function renderSummary() {
    var box = $('lsSummary');
    if (scanFailed) { box.innerHTML = '<p class="ls-empty">' + esc(T('oip.scanFail')) + '</p>'; return; }
    if (!scan) { box.innerHTML = '<p class="muted small">' + esc(T('oip.loading')) + '</p>'; return; }

    var nL = 0, nS = 0, nB = 0, sum = 0, n = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.lean === 'long') nL++; else if (r.lean === 'short') nS++; else if (r.lean === 'balanced') nB++;
      if (Number.isFinite(r.longPct)) { sum += r.longPct; n++; }
    }
    // Trung bình KHÔNG có trọng số, và nói rõ điều đó: mỗi coin một phiếu, coin
    // bé cân bằng coin lớn. Gọi nó là "toàn thị trường" mà không ghi chú là để
    // người đọc tự hiểu sai thành trung bình theo tiền.
    var avg = n ? sum / n : null;
    box.innerHTML = '<div class="oi-cards">'
      + card(T('lsp.sum.avg'), pct(avg), avg == null ? 'muted' : avg >= 50 ? 'up' : 'down')
      + card(T('lsp.sum.leanLong'), String(nL), nL ? 'up' : 'muted')
      + card(T('lsp.sum.balanced'), String(nB), '')
      + card(T('lsp.sum.leanShort'), String(nS), nS ? 'down' : 'muted')
      + '</div>'
      + '<p class="hint lsp-avgnote">' + esc(T('lsp.sum.avgNote', { n: SKEW })) + '</p>';
  }
  function card(label, value, tone) {
    return '<div class="oi-card"><span class="oi-card-l">' + esc(label) + '</span>'
      + '<b class="oi-card-v ' + esc(tone) + '">' + esc(value) + '</b></div>';
  }

  /* ------------------------------- bộ lọc ------------------------------- */

  function renderFilters() {
    var box = $('lsFilters');
    var c = { long: 0, short: 0, balanced: 0 };
    rows.forEach(function (r) { if (r.lean) c[r.lean]++; });
    box.innerHTML = chip('all', T('oip.filter.all'), rows.length)
      + chip('long', T('ls.leanLong'), c.long)
      + chip('balanced', T('ls.balanced'), c.balanced)
      + chip('short', T('ls.leanShort'), c.short);
    box.querySelectorAll('.oi-chip').forEach(function (b) {
      b.addEventListener('click', function () {
        filter = b.dataset.f; openBase = null; renderFilters(); renderTable();
      });
    });
  }
  function chip(id, label, n) {
    return '<button type="button" class="oi-chip ls-' + esc(id) + (filter === id ? ' sel' : '')
      + '" data-f="' + esc(id) + '">' + esc(label) + ' <span>' + n + '</span></button>';
  }

  /* -------------------------------- thanh ------------------------------- */

  /*
   * Thanh hai màu. Nguồn trả hai tỉ trọng RIÊNG, tổng có thể lệch khỏi 100 vài
   * phần nghìn, nên chuẩn hoá lại trước khi vẽ — nếu không thanh sẽ hụt hoặc
   * tràn một sợi tóc và trông như lỗi dựng hình.
   */
  function bar(longPct, shortPct, label) {
    if (longPct == null || !Number.isFinite(longPct)) {
      return '<span class="ls-empty small">' + esc(T('ls.none')) + '</span>';
    }
    var sh = (shortPct != null && Number.isFinite(shortPct)) ? shortPct : (100 - longPct);
    var tot = longPct + sh;
    var lw = tot > 0 ? (longPct / tot) * 100 : 50;
    return '<div class="lsb" role="img" aria-label="' + esc((label ? label + ': ' : '')
        + T('ls.long') + ' ' + pct(longPct) + ' / ' + T('ls.short') + ' ' + pct(sh)) + '">'
      + '<span class="lsb-l" style="width:' + lw.toFixed(2) + '%"></span>'
      + '<span class="lsb-s" style="width:' + (100 - lw).toFixed(2) + '%"></span>'
      + '<span class="lsb-t lsb-tl">' + esc(pct(longPct)) + '</span>'
      + '<span class="lsb-t lsb-ts">' + esc(pct(sh)) + '</span>'
      + '</div>';
  }

  /* -------------------------------- bảng -------------------------------- */

  function renderTable() {
    var body = $('lsBody2'), list = visible();
    if (!list.length) {
      // Ba nguyên nhân khác nhau, ba câu khác nhau. Gộp lại thành "không có
      // coin nào" là nói sai nguyên nhân cho người đọc.
      body.innerHTML = '<tr><td colspan="5" class="ls-empty">'
        + esc(scanFailed ? T('oip.scanFail')
          : marketFailed ? T('oip.marketFail')
          : T('oip.empty')) + '</td></tr>';
      return;
    }
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      html += '<tr class="mv-row oi-row' + (openBase === r.base ? ' open' : '') + '" data-base="' + esc(r.base) + '">'
        + '<td class="mv-coin"><div class="mv-coin-in"><img class="mv-logo" alt="" data-logo="' + esc(r.base) + '">'
        + '<span class="mv-sym">' + esc(r.base) + '<small>USDT</small></span></div></td>'
        + '<td class="mv-price">' + price(r.price) + '</td>'
        + '<td><span class="mv-pill ' + chgCls(r.change) + '">' + signed(r.change) + '</span></td>'
        + '<td class="ls-barcell">' + bar(r.longPct, r.shortPct, T('ls.global')) + '</td>'
        + '<td class="mv-price ' + (r.lean === 'long' ? 'up' : r.lean === 'short' ? 'down' : '') + '">'
        + esc(pct(r.longPct)) + '</td>'
        + '</tr>';
      if (openBase === r.base) html += detailRow(r);
    }
    body.innerHTML = html;
    if (API && API.applyLogo) body.querySelectorAll('[data-logo]').forEach(function (img) {
      API.applyLogo(img, img.dataset.logo);
    });
    body.querySelectorAll('.oi-row').forEach(function (tr) {
      tr.addEventListener('click', function () {
        openBase = openBase === tr.dataset.base ? null : tr.dataset.base;
        renderTable();
      });
    });
    if (openBase) loadTop(openBase);
  }

  function detailRow(r) {
    return '<tr class="oi-detail"><td colspan="5"><div class="lsp-detail" id="lsDetail">'
      + '<div class="lsp-side"><span class="lsp-side-h">' + esc(T('ls.global')) + '</span>'
      + bar(r.longPct, r.shortPct, T('ls.global'))
      + '<span class="lsp-side-n">' + esc(T('lsp.detail.globalNote')) + '</span></div>'
      + '<div class="lsp-side" id="lsTopSide"><span class="lsp-side-h">' + esc(T('ls.top')) + '</span>'
      + '<span class="muted small">' + esc(T('oip.loadingSeries')) + '</span></div>'
      // Câu phân kỳ so sánh CẢ HAI cột nên phải là con trực tiếp của lưới để
      // trải hết bề ngang; nhét vào trong một cột thì nó neo lệch về bên đó.
      + '<div id="lsDiv"></div>'
      + '</div></td></tr>';
  }

  /* ----------------- tỉ lệ vị thế top trader (theo yêu cầu) -------------- */

  var topFor = null;

  function loadTop(base) {
    if (topFor === base) return;
    topFor = base;
    if (!OI || !OI.latestRatio) return;
    OI.latestRatio(base, 'top', DETAIL_TF).then(function (t) {
      if (openBase !== base) return;
      var box = $('lsTopSide');
      if (!box) return;
      if (!t || t.long == null) {
        box.innerHTML = '<span class="lsp-side-h">' + esc(T('ls.top')) + '</span>'
          + '<span class="ls-empty small">' + esc(T('ls.none')) + '</span>';
        return;
      }
      // Nguồn trả tỉ trọng 0..1; đổi sang phần trăm đúng một lần ở đây.
      var lo = t.long * 100, sh = t.short * 100;
      var row = rows.filter(function (r) { return r.base === base; })[0];
      box.innerHTML = '<span class="lsp-side-h">' + esc(T('ls.top')) + '</span>'
        + bar(lo, sh, T('ls.top'))
        + '<span class="lsp-side-n">' + esc(T('lsp.detail.topNote')) + '</span>';
      var dv = $('lsDiv');
      if (dv) dv.innerHTML = diverge(row ? row.longPct : null, lo);
    }).catch(function () {
      if (openBase !== base) return;
      var box = $('lsTopSide');
      if (box) {
        box.innerHTML = '<span class="lsp-side-h">' + esc(T('ls.top')) + '</span>'
          + '<span class="ls-empty small">' + esc(T('ls.none')) + '</span>';
      }
    });
  }

  /*
   * Chênh lệch giữa hai tỉ lệ. Chỉ nói ra khi cả hai đều có số và hai bên nằm
   * ở HAI PHÍA của mốc 50 — "cả hai cùng nghiêng long nhưng một bên 55% một
   * bên 62%" không phải phân kỳ, và gọi nó là phân kỳ là phóng đại.
   */
  function diverge(globalLong, topLong) {
    if (globalLong == null || topLong == null
      || !Number.isFinite(globalLong) || !Number.isFinite(topLong)) return '';
    var gSide = globalLong > 50 ? 1 : globalLong < 50 ? -1 : 0;
    var tSide = topLong > 50 ? 1 : topLong < 50 ? -1 : 0;
    if (gSide === 0 || tSide === 0 || gSide === tSide) return '';
    var key = gSide > 0 ? 'lsp.div.crowdLong' : 'lsp.div.crowdShort';
    return '<p class="lsp-div">' + esc(T(key, {
      g: pct(globalLong), t: pct(topLong),
    })) + '</p>';
  }

  /* ------------------------------ sắp xếp ------------------------------- */

  function wireSort() {
    var t = $('lsTable');
    if (!t) return;
    t.querySelectorAll('.sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.dataset.sort;
        if (sortKey === k) sortDir = -sortDir;
        else { sortKey = k; sortDir = k === 'base' ? 1 : -1; }
        t.querySelectorAll('.sortable').forEach(function (o) { o.classList.remove('asc', 'desc'); });
        th.classList.add(sortDir > 0 ? 'asc' : 'desc');
        openBase = null;
        renderTable();
      });
    });
  }

  function renderAge() {
    var el = $('lsAge');
    if (!el || !scan) return;
    var at = Number(scan.generatedAt ? Date.parse(scan.generatedAt) : NaN);
    if (!Number.isFinite(at)) { el.textContent = ''; return; }
    el.textContent = T('oip.age', { n: Math.max(0, Math.round((Date.now() - at) / 60000)) });
  }
  function renderCoverage() {
    var el = $('lsCoverage');
    if (!el || !scan) return;
    el.textContent = T('oip.coverage', {
      shown: rows.length, scanned: scan.scanned == null ? '—' : scan.scanned,
    });
  }

  Promise.all([
    (API && API.getMarket ? API.getMarket() : Promise.resolve([])).catch(function () { return []; }),
    fetch('/api/oi-scan', { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch(function () { return null; }),
  ]).then(function (r) {
    market = Array.isArray(r[0]) ? r[0] : [];
    // Lượt quét chạy được nhưng không có giá thì không dựng được dòng nào —
    // và lý do đó phải nói ra, chứ không để người đọc tưởng thị trường trống.
    marketFailed = !market.length;
    scan = r[1];
    scanFailed = !scan || scan.ok === false || !scan.coins;
    repaint();
    wireSort();
  });

  function repaint() {
    build();
    renderSummary(); renderFilters(); renderTable(); renderAge(); renderCoverage();
  }

  // Xem ghi chú cùng chỗ trong js/oi-page.js: nội dung do JS dựng không tự
  // đổi theo ngôn ngữ, phải vẽ lại.
  window.addEventListener('vdear:langchange', function () {
    if (!scan && !scanFailed) return;
    var keep = topFor;
    topFor = null;
    repaint();
    if (keep && openBase === keep) loadTop(keep);
  });
})();
