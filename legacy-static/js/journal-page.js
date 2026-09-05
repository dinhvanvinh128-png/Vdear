/*
 * Vdear — giao diện trang /journal.
 *
 * Phần tính toán nằm hết ở js/journal.js (và được kiểm bằng tests/journal.test.ts).
 * Tệp này chỉ vẽ, và tuân đúng một nguyên tắc: KHÔNG hiện con số nào mà phần
 * tính toán trả về null. Winrate chưa có thì ghi "—", không ghi 0%.
 */
(function () {
  var T = function (k, v) { return window.VdearI18n ? window.VdearI18n.t(k, v) : k; };
  var J = window.VdearJournal;
  var $ = function (id) { return document.getElementById(id); };

  if (!J || !$('jrBody')) return;

  var trades = [];
  var filter = { status: 'all', coin: 'all' };

  /* ------------------------------ tiện ích ------------------------------ */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function money(v) {
    if (v == null) return '—';
    var a = Math.abs(v);
    var d = a >= 1000 ? 2 : a >= 1 ? 4 : 8;
    return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d });
  }

  function rTxt(r) {
    if (r == null) return '—';
    return (r >= 0 ? '+' : '') + r.toFixed(2) + 'R';
  }

  function pct(v) { return v == null ? '—' : v.toFixed(1) + '%'; }

  function when(ms) {
    if (!ms) return '—';
    var d = new Date(ms);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  var STATUS_KEY = { open: 'journal.s.open', tp: 'journal.s.tp', sl: 'journal.s.sl', closed: 'journal.s.closed' };

  /* ------------------------------- bảng --------------------------------- */

  function visible() {
    return trades.filter(function (t) {
      if (filter.status !== 'all' && (t.status || 'open') !== filter.status) return false;
      if (filter.coin !== 'all' && t.coin !== filter.coin) return false;
      return true;
    });
  }

  function row(t) {
    var r = J.rOf(t);
    var st = t.status || 'open';
    var cls = st === 'tp' ? 'up' : st === 'sl' ? 'down' : '';
    return '<tr data-id="' + esc(t.id) + '">'
      + '<td class="muted small">' + when(t.at) + '</td>'
      + '<td class="mv-sym"><b>' + esc(t.coin) + '</b></td>'
      + '<td><span class="sr-tag ' + (t.side === 'SHORT' ? 'short' : 'long') + '">' + esc(t.side) + '</span></td>'
      + '<td class="mv-price">' + money(t.entry) + '</td>'
      + '<td class="mv-price up">' + money(t.tp) + '</td>'
      + '<td class="mv-price down">' + money(t.sl) + '</td>'
      + '<td class="muted small">' + (t.confluence == null ? '—' : t.confluence + '/5') + '</td>'
      + '<td><span class="mv-pill ' + cls + '">' + T(STATUS_KEY[st] || STATUS_KEY.open) + '</span></td>'
      + '<td class="mv-price ' + (r == null ? 'muted' : r >= 0 ? 'up' : 'down') + '">' + rTxt(r) + '</td>'
      + '<td class="jr-ops">'
      + (st === 'open'
        ? '<button type="button" class="jr-btn" data-close="' + esc(t.id) + '">' + T('journal.closeBtn') + '</button>'
        : '')
      + '<button type="button" class="jr-btn jr-del" data-del="' + esc(t.id) + '" '
      + 'aria-label="' + T('journal.delete') + '" title="' + T('journal.delete') + '">✕</button>'
      + '</td></tr>';
  }

  function renderTable() {
    var list = visible();
    var body = $('jrBody'), empty = $('jrEmpty');
    if (!list.length) {
      body.innerHTML = '';
      empty.hidden = false;
      empty.textContent = trades.length ? T('journal.noMatch') : T('journal.emptyAll');
      return;
    }
    empty.hidden = true;
    body.innerHTML = list.map(row).join('');
  }

  function renderCoinFilter() {
    var sel = $('jrCoin');
    if (!sel) return;
    var coins = [];
    trades.forEach(function (t) { if (t.coin && coins.indexOf(t.coin) < 0) coins.push(t.coin); });
    coins.sort();
    sel.innerHTML = '<option value="all">' + T('journal.allCoins') + '</option>'
      + coins.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');
    sel.value = filter.coin;
  }

  /* ----------------------------- thống kê ------------------------------- */

  function stat(labelKey, value, cls) {
    return '<div class="jr-stat"><span>' + T(labelKey) + '</span>'
      + '<b class="' + (cls || '') + '">' + value + '</b></div>';
  }

  function renderStats() {
    var s = J.stats(trades);
    var box = $('jrStats');
    box.innerHTML =
      stat('journal.st.total', String(s.total))
      + stat('journal.st.open', String(s.open))
      + stat('journal.st.closed', String(s.closed))
      + stat('journal.st.winRate', pct(s.winRate),
        s.winRate == null ? 'muted' : s.winRate >= 50 ? 'up' : 'down')
      + stat('journal.st.totalR', rTxt(s.totalR),
        s.totalR == null ? 'muted' : s.totalR >= 0 ? 'up' : 'down')
      + stat('journal.st.avgR', rTxt(s.avgR), s.avgR == null ? 'muted' : s.avgR >= 0 ? 'up' : 'down')
      + stat('journal.st.avgRR', s.avgPlannedRR == null ? '—' : '1 : ' + s.avgPlannedRR.toFixed(2))
      + stat('journal.st.bestStreak', String(s.bestStreak), 'up')
      + stat('journal.st.worstStreak', String(s.worstStreak), 'down');
  }

  /*
   * Đường vốn vẽ bằng SVG, đúng cách trang này đang vẽ sparkline ở thẻ Signal
   * Radar — không thêm thư viện biểu đồ nào.
   */
  function renderCurve() {
    var svg = $('jrCurve');
    if (!svg) return;
    var pts = J.equityCurve(trades);
    var W = 720, H = 200, pad = 14;
    if (pts.length < 2) {
      svg.innerHTML = '<text x="' + (W / 2) + '" y="' + (H / 2) + '" text-anchor="middle" '
        + 'fill="currentColor" opacity="0.5" font-size="13">' + esc(T('journal.curve.empty')) + '</text>';
      return;
    }
    var lo = Infinity, hi = -Infinity;
    pts.forEach(function (p) { if (p.cum < lo) lo = p.cum; if (p.cum > hi) hi = p.cum; });
    // Mốc 0 LUÔN nằm trong khung: không có nó thì một chuỗi toàn lãi và một
    // chuỗi toàn lỗ vẽ ra hai đường trông giống hệt nhau.
    lo = Math.min(0, lo); hi = Math.max(0, hi);
    if (hi === lo) { hi = lo + 1; }
    var span = hi - lo;
    var x = function (i) { return pad + (i / (pts.length - 1)) * (W - pad * 2); };
    var y = function (v) { return pad + (1 - (v - lo) / span) * (H - pad * 2); };

    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.cum).toFixed(1); }).join(' ');
    var zero = y(0).toFixed(1);
    var last = pts[pts.length - 1].cum;
    var col = last >= 0 ? 'var(--up)' : 'var(--down)';

    svg.innerHTML =
      '<line x1="' + pad + '" x2="' + (W - pad) + '" y1="' + zero + '" y2="' + zero + '" '
      + 'stroke="currentColor" stroke-opacity="0.25" stroke-dasharray="3 3"/>'
      + '<path d="' + d + ' L' + x(pts.length - 1).toFixed(1) + ' ' + zero + ' L' + x(0).toFixed(1) + ' ' + zero + ' Z" '
      + 'fill="' + col + '" fill-opacity="0.10"/>'
      + '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2"/>'
      + '<text x="' + (W - pad) + '" y="' + (pad + 12) + '" text-anchor="end" fill="' + col + '" '
      + 'font-size="13" font-weight="700">' + esc(rTxt(last)) + '</text>';
  }

  /* -------------------------- phân tích theo chiều ---------------------- */

  var DIM_TITLE = {
    coin: 'journal.dim.coin', side: 'journal.dim.side',
    hour: 'journal.dim.hour', confluence: 'journal.dim.conf',
  };
  var CONF_LABEL = { low: 'journal.conf.low', mid: 'journal.conf.mid', high: 'journal.conf.high' };

  function dimLabel(dim, key) {
    if (dim === 'confluence') return T(CONF_LABEL[key] || key);
    if (dim === 'hour') return (key.length < 2 ? '0' + key : key) + ':00';
    return key;
  }

  function renderDims() {
    var box = $('jrDims');
    var d = J.byDimension(trades);
    var html = '';
    ['coin', 'side', 'hour', 'confluence'].forEach(function (dim) {
      var rows = d[dim] || [];
      html += '<div class="jr-dim"><h3>' + T(DIM_TITLE[dim]) + '</h3>';
      if (!rows.length) {
        html += '<p class="muted small">' + T('journal.dim.empty') + '</p></div>';
        return;
      }
      html += '<table class="jr-dim-table"><thead><tr>'
        + '<th>' + T('journal.dim.group') + '</th><th>' + T('journal.dim.n') + '</th>'
        + '<th>' + T('journal.dim.win') + '</th><th>' + T('journal.dim.avgR') + '</th></tr></thead><tbody>';
      rows.forEach(function (g) {
        // Nhóm dưới 3 lệnh vẫn hiện (người dùng có quyền thấy dữ liệu của mình)
        // nhưng được đánh dấu là ÍT MẪU, để không ai đọc "winrate 100%" của một
        // nhóm hai lệnh như một kết luận.
        var thin = g.n < 3;
        html += '<tr' + (thin ? ' class="jr-thin"' : '') + '>'
          + '<td>' + esc(dimLabel(dim, g.key)) + '</td>'
          + '<td>' + g.n + (thin ? ' <span class="jr-thin-tag">' + T('journal.dim.thin') + '</span>' : '') + '</td>'
          + '<td class="' + (g.winRate >= 50 ? 'up' : 'down') + '">' + pct(g.winRate) + '</td>'
          + '<td class="' + (g.avgR >= 0 ? 'up' : 'down') + '">' + rTxt(g.avgR) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    });
    box.innerHTML = html;
  }

  /* ------------------------------ bài học ------------------------------- */

  function renderLessons() {
    var box = $('jrLessons');
    var l = J.lessons(trades);
    if (!l.enough) {
      box.innerHTML = '<p class="hint">' + T('journal.lesson.needMore', { need: l.need, have: l.have }) + '</p>';
      return;
    }
    if (!l.items.length) {
      box.innerHTML = '<p class="hint">' + T('journal.lesson.nothing') + '</p>';
      return;
    }
    box.innerHTML = '<ul class="jr-lessons">' + l.items.map(function (it) {
      return '<li><b>' + T(it.key) + '</b><br>'
        + T('journal.lesson.detail', {
          lossPct: it.lossShare.toFixed(0),
          n: it.lossCount, total: it.lossTotal,
          allPct: it.allShare.toFixed(0),
        }) + '</li>';
    }).join('') + '</ul>'
      + '<p class="hint">' + T('journal.lesson.foot') + '</p>';
  }

  /* -------------------------------- CSV --------------------------------- */

  function exportCSV() {
    var csv = J.toCSV(trades);
    // BOM để Excel nhận ra UTF-8; thiếu nó thì tiếng Việt có dấu ra ký tự lạ.
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'vdear-journal-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------------------------- theo dõi giá ---------------------------- */

  /*
   * Đánh dấu lệnh đã chạm TP hay SL bằng giá hiện tại. Xem ghi chú ở hitOf():
   * đây là phép xấp xỉ theo giá tại thời điểm kiểm, và người dùng luôn có thể
   * tự đóng lệnh với giá của mình.
   */
  async function checkPrices() {
    var API = window.VdearAPI;
    var open = trades.filter(function (t) { return !J.isClosed(t); });
    if (!API || !open.length) return;
    var market = null;
    try { market = await API.getMarket(); } catch (e) { return; }
    if (!market) return;
    var price = {};
    market.forEach(function (c) { price[c.base] = c.price; });

    var changed = false;
    for (var i = 0; i < open.length; i++) {
      var t = open[i];
      var p = price[t.coin];
      if (!(p > 0)) continue;
      var hit = J.hitOf(t, p);
      if (!hit) continue;
      // Ghi đúng mức TP/SL làm giá đóng, không lấy giá hiện tại: lệnh chạm TP
      // thì kết quả là +đúng kế hoạch, còn giá lúc ta tình cờ kiểm tra thì
      // không phải con số người dùng thật sự thoát ra.
      var closePrice = hit === 'tp' ? t.tp : t.sl;
      await J.update(t.id, { status: hit, closedAt: Date.now(), closePrice: closePrice });
      t.status = hit; t.closedAt = Date.now(); t.closePrice = closePrice;
      changed = true;
    }
    if (changed) renderAll();
  }

  /* ------------------------------ đóng lệnh ----------------------------- */

  async function closeTrade(id) {
    var t = trades.filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    var raw = window.prompt(T('journal.closePrompt', { coin: t.coin, entry: money(t.entry) }), '');
    if (raw == null) return;
    var price = parseFloat(String(raw).replace(/,/g, ''));
    if (!Number.isFinite(price) || price <= 0) { window.alert(T('journal.badPrice')); return; }
    var note = window.prompt(T('journal.notePrompt'), t.note || '');
    await J.update(id, {
      status: 'closed', closedAt: Date.now(), closePrice: price,
      note: note == null ? (t.note || '') : note,
    });
    t.status = 'closed'; t.closedAt = Date.now(); t.closePrice = price;
    if (note != null) t.note = note;
    renderAll();
  }

  async function delTrade(id) {
    if (!window.confirm(T('journal.confirmDelete'))) return;
    await J.remove(id);
    trades = trades.filter(function (t) { return t.id !== id; });
    renderAll();
  }

  /* ------------------------------- khởi động ---------------------------- */

  function renderAll() {
    renderCoinFilter();
    renderTable();
    renderStats();
    renderCurve();
    renderDims();
    renderLessons();
  }

  async function boot() {
    try { trades = await J.list(); } catch (e) { trades = []; }
    renderAll();
    checkPrices();

    $('jrStatus').addEventListener('change', function (e) { filter.status = e.target.value; renderTable(); });
    $('jrCoin').addEventListener('change', function (e) { filter.coin = e.target.value; renderTable(); });
    $('jrExport').addEventListener('click', exportCSV);
    $('jrBody').addEventListener('click', function (e) {
      var c = e.target.closest('[data-close]'), d = e.target.closest('[data-del]');
      if (c) closeTrade(c.getAttribute('data-close'));
      else if (d) delTrade(d.getAttribute('data-del'));
    });

    window.addEventListener('vdear:langchange', renderAll);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
