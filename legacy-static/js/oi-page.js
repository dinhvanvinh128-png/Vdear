/*
 * Vdearypto — trang Open Interest (/oi.html).
 *
 * NGUỒN SỐ
 * --------
 * Bảng lấy từ /api/oi-scan: một máy chủ quét, CDN phục vụ tất cả. Xem đầu
 * api/oi-scan.js để biết vì sao KHÔNG quét từ trình duyệt — 600 coin × 2
 * request là 1200 lượt, vượt hạn mức 1000/5 phút theo IP của Binance, và
 * người dùng sẽ mất luôn cả biểu đồ lẫn bảng giá chứ không riêng trang này.
 *
 * Chỉ khi người dùng MỞ RỘNG một dòng thì mới gọi thẳng Binance cho đúng coin
 * đó (VdearOI.hist) — một request, có bộ đệm, nằm trong hạn mức thoải mái.
 *
 * PHÂN LOẠI BỐN TRẠNG THÁI
 * ------------------------
 * Dùng VdearOI.classifyPct, KHÔNG chép lại logic. Bốn trạng thái chỉ có đúng
 * một định nghĩa trong js/oi.js; chép sang đây là cách chắc chắn để hai nơi
 * trôi khỏi nhau rồi cùng một coin hiện hai trạng thái khác nhau.
 *
 * TRẦN BỘ NHỚ
 * -----------
 * Chuỗi OI của dòng đang mở giữ tối đa MAX_POINTS điểm, và mỗi lúc chỉ mở một
 * dòng — đóng dòng cũ là bỏ luôn chuỗi của nó. Mở lần lượt 300 coin không làm
 * trang phình bộ nhớ.
 *
 * Vẽ bằng SVG như các sparkline sẵn có. Không thêm thư viện.
 */
(function () {
  var T = function (k, v) { return window.VdearI18n ? window.VdearI18n.t(k, v) : k; };
  var $ = function (id) { return document.getElementById(id); };
  if (!$('oiBody')) return;

  var API = window.VdearAPI, OI = window.VdearOI;
  var MAX_POINTS = 200;          // trần điểm cho chuỗi của dòng đang mở
  var DETAIL_TF = '1h';

  var market = [];               // [{ base, price, change, quoteVolume }]
  var scan = null;               // { coins: { BASE: {oi, oiPct, longPct, shortPct} }, ... }
  var scanFailed = false, marketFailed = false;
  var rows = [];                 // dòng đã ghép, sau lọc
  var sortKey = 'oi', sortDir = -1;
  var filter = 'all';
  var openBase = null;           // dòng đang mở rộng

  /* ------------------------------ tiện ích ------------------------------ */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // "—" cho THIẾU dữ liệu. Số 0 vẫn in ra là 0: OI không đổi là một dữ kiện,
  // khác hẳn với chưa quét tới.
  function pct(v, d) {
    if (v == null || !Number.isFinite(v)) return '—';
    return (v >= 0 ? '+' : '') + v.toFixed(d == null ? 2 : d) + '%';
  }
  function shortNum(v) {
    if (v == null || !Number.isFinite(v)) return '—';
    var a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return (v / 1e3).toFixed(2) + 'K';
    return v.toFixed(2);
  }
  function price(v) {
    if (v == null || !Number.isFinite(v)) return '—';
    return '$' + (v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 })
      : v >= 1 ? v.toFixed(2) : v.toPrecision(4));
  }
  function cls(v) { return v == null || !Number.isFinite(v) ? 'muted' : v >= 0 ? 'up' : 'down'; }

  /* --------------------------- ghép dữ liệu ----------------------------- */

  var STATES = ['longsIn', 'shortCover', 'shortsIn', 'longsOut', 'flat'];

  function build() {
    var coins = (scan && scan.coins) || {};
    var out = [];
    for (var i = 0; i < market.length; i++) {
      var m = market[i];
      var c = coins[m.base];
      // Coin ngoài phạm vi quét: KHÔNG dựng dòng giả với số 0. Nó không có
      // mặt trên trang này, và phần chú thích dưới bảng nói rõ vì sao.
      if (!c) continue;
      var st = OI.classifyPct(c.oiPct, m.change);
      out.push({
        base: m.base, price: m.price, change: m.change,
        oi: c.oi, oiPct: c.oiPct,
        state: st ? st.state : null,
      });
    }
    rows = out;
  }

  function visible() {
    var list = rows.slice();
    if (filter !== 'all') list = list.filter(function (r) { return r.state === filter; });
    list.sort(function (a, b) {
      var x = a[sortKey], y = b[sortKey];
      if (sortKey === 'base') return sortDir * String(a.base).localeCompare(String(b.base));
      // Thiếu dữ liệu luôn xuống cuối, bất kể chiều sắp xếp — kéo "—" lên đầu
      // khi sắp giảm dần là biến chỗ trống thành thứ hạng.
      var xn = x != null && Number.isFinite(x), yn = y != null && Number.isFinite(y);
      if (!xn && !yn) return 0;
      if (!xn) return 1;
      if (!yn) return -1;
      return sortDir * (x - y);
    });
    return list;
  }

  /* ------------------------------- tóm tắt ------------------------------ */

  function renderSummary() {
    var box = $('oiSummary');
    if (scanFailed) {
      box.innerHTML = '<p class="ls-empty">' + esc(T('oip.scanFail')) + '</p>';
      return;
    }
    if (!scan) { box.innerHTML = '<p class="muted small">' + esc(T('oip.loading')) + '</p>'; return; }

    var totOi = 0, nOi = 0, up = 0, down = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.oi != null && Number.isFinite(r.oi)) { totOi += r.oi; nOi++; }
      if (r.oiPct != null && Number.isFinite(r.oiPct)) { r.oiPct >= 0 ? up++ : down++; }
    }
    var counts = {};
    STATES.forEach(function (s) { counts[s] = 0; });
    rows.forEach(function (r) { if (r.state) counts[r.state]++; });

    // Tổng OI là tổng theo ĐƠN VỊ HỢP ĐỒNG của từng coin, không quy ra USD —
    // /api/oi-scan trả sumOpenInterest chứ không trả sumOpenInterestValue. Cộng
    // 1 BTC với 1 DOGE rồi gọi là "tổng" thì con số đó vô nghĩa, nên KHÔNG hiện
    // tổng. Thay vào đó đếm số coin OI tăng / giảm — thứ cộng lại có nghĩa.
    box.innerHTML =
      '<div class="oi-cards">'
      + card(T('oip.sum.scanned'), String(rows.length), '')
      + card(T('oip.sum.oiUp'), String(up), up > down ? 'up' : '')
      + card(T('oip.sum.oiDown'), String(down), down > up ? 'down' : '')
      + card(T('oip.sum.longsIn'), String(counts.longsIn), counts.longsIn ? 'up' : 'muted')
      + card(T('oip.sum.shortsIn'), String(counts.shortsIn), counts.shortsIn ? 'down' : 'muted')
      + '</div>';
    void nOi; void totOi;
  }

  function card(label, value, tone) {
    return '<div class="oi-card"><span class="oi-card-l">' + esc(label) + '</span>'
      + '<b class="oi-card-v ' + esc(tone) + '">' + esc(value) + '</b></div>';
  }

  /* ------------------------------- bộ lọc ------------------------------- */

  function renderFilters() {
    var box = $('oiFilters');
    var counts = {};
    STATES.forEach(function (s) { counts[s] = 0; });
    rows.forEach(function (r) { if (r.state) counts[r.state]++; });
    var html = chip('all', T('oip.filter.all'), rows.length);
    STATES.forEach(function (s) { html += chip(s, T(OI.stateKey(s)), counts[s]); });
    box.innerHTML = html;
    box.querySelectorAll('.oi-chip').forEach(function (b) {
      b.addEventListener('click', function () {
        filter = b.dataset.f;
        openBase = null;
        renderFilters(); renderTable();
      });
    });
  }
  function chip(id, label, n) {
    return '<button type="button" class="oi-chip st-' + esc(id) + (filter === id ? ' sel' : '')
      + '" data-f="' + esc(id) + '">' + esc(label) + ' <span>' + n + '</span></button>';
  }

  /* -------------------------------- bảng -------------------------------- */

  function renderTable() {
    var body = $('oiBody');
    var list = visible();
    if (!list.length) {
      // Ba nguyên nhân khác nhau, ba câu khác nhau. Gộp lại thành "không có
      // coin nào" là nói sai nguyên nhân cho người đọc.
      body.innerHTML = '<tr><td colspan="6" class="ls-empty">'
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
        + '<td><span class="mv-pill ' + cls(r.change) + '">' + pct(r.change) + '</span></td>'
        + '<td class="mv-price">' + shortNum(r.oi) + '</td>'
        + '<td class="mv-price ' + cls(r.oiPct) + '">' + pct(r.oiPct) + '</td>'
        // Thiếu trạng thái thì in "—" trơn, KHÔNG dựng viên nhãn viền rỗng:
        // một cái hộp có viền mà trong ruột chỉ có gạch ngang đọc như ô nhập bị
        // hỏng, chứ không đọc như "chưa đủ dữ liệu".
        + '<td>' + (r.state
          ? '<span class="oi-state st-' + esc(r.state) + '">' + esc(T(OI.stateKey(r.state))) + '</span>'
          : '<span class="muted">—</span>') + '</td>'
        + '</tr>';
      if (openBase === r.base) html += detailRow(r);
    }
    body.innerHTML = html;
    if (API && API.applyLogo) body.querySelectorAll('[data-logo]').forEach(function (img) {
      API.applyLogo(img, img.dataset.logo);
    });
    body.querySelectorAll('.oi-row').forEach(function (tr) {
      tr.addEventListener('click', function () { toggle(tr.dataset.base); });
    });
    if (openBase) loadDetail(openBase);
  }

  function detailRow(r) {
    var why = r.state ? T(OI.stateKey(r.state) + '.why', { dead: OI.DEAD }) : T('oip.noState');
    return '<tr class="oi-detail"><td colspan="6">'
      + '<div class="oi-detail-in">'
      + '<div class="oi-why"><b>' + esc(r.state ? T(OI.stateKey(r.state)) : T('oip.noState.head')) + '</b>'
      + '<p>' + esc(why) + '</p></div>'
      + '<div class="oi-spark" id="oiSpark"><span class="muted small">' + esc(T('oip.loadingSeries')) + '</span></div>'
      + '</div></td></tr>';
  }

  function toggle(base) {
    openBase = openBase === base ? null : base;
    renderTable();
  }

  /* --------------------- chuỗi OI của dòng đang mở ---------------------- */

  var detailFor = null;

  function loadDetail(base) {
    if (detailFor === base) return;      // đã có, không gọi lại
    detailFor = base;
    if (!OI || !OI.hist) return;
    OI.hist(base, DETAIL_TF, MAX_POINTS).then(function (series) {
      if (openBase !== base) return;     // người dùng đã đóng/đổi dòng
      var box = $('oiSpark');
      if (!box) return;
      if (!series || series.length < 2) {
        box.innerHTML = '<span class="ls-empty">' + esc(T('oi.none')) + '</span>';
        return;
      }
      // Trần bộ nhớ: chỉ giữ MAX_POINTS điểm gần nhất.
      var s = series.length > MAX_POINTS ? series.slice(series.length - MAX_POINTS) : series;
      box.innerHTML = spark(s) + '<span class="oi-spark-cap">'
        + esc(T('oip.sparkCap', { n: s.length, tf: DETAIL_TF })) + '</span>';
    }).catch(function () {
      if (openBase !== base) return;
      var box = $('oiSpark');
      if (box) box.innerHTML = '<span class="ls-empty">' + esc(T('oi.none')) + '</span>';
    });
  }

  /*
   * Đường OI. Trục dọc co theo min/max của chính chuỗi — khác với đường độ
   * rộng (0–100% cố định) vì OI không có trần tự nhiên nào để neo vào, và một
   * dao động 2% quanh mức nền cao thì co trục mới nhìn ra được.
   * Nhãn hai đầu ghi rõ giá trị min/max để không ai đọc nhầm độ dốc thành độ
   * lớn.
   */
  function spark(s) {
    var W = 420, H = 90, pad = 6;
    var lo = Infinity, hi = -Infinity;
    for (var i = 0; i < s.length; i++) { if (s[i].oi < lo) lo = s[i].oi; if (s[i].oi > hi) hi = s[i].oi; }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return '';
    if (hi === lo) { hi = lo + 1; lo = lo - 1; }     // chuỗi phẳng: đừng chia cho 0
    var x = function (i) { return pad + (i / (s.length - 1)) * (W - pad * 2); };
    var y = function (v) { return pad + (1 - (v - lo) / (hi - lo)) * (H - pad * 2); };
    var d = '';
    for (var j = 0; j < s.length; j++) d += (j ? 'L' : 'M') + x(j).toFixed(1) + ',' + y(s[j].oi).toFixed(1);
    var rising = s[s.length - 1].oi >= s[0].oi;
    var col = rising ? 'var(--up)' : 'var(--down)';
    return '<svg class="oi-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="'
      + esc(T('oip.sparkAria')) + '">'
      + '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="1.6"/>'
      + '<text class="oi-ax" x="' + (W - pad) + '" y="12" text-anchor="end">' + esc(shortNum(hi)) + '</text>'
      + '<text class="oi-ax" x="' + (W - pad) + '" y="' + (H - 3) + '" text-anchor="end">' + esc(shortNum(lo)) + '</text>'
      + '</svg>';
  }

  /* ------------------------------ sắp xếp ------------------------------- */

  function wireSort() {
    var t = $('oiTable');
    if (!t) return;
    t.querySelectorAll('.sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.dataset.sort;
        if (sortKey === k) sortDir = -sortDir;
        else { sortKey = k; sortDir = k === 'base' ? 1 : -1; }
        t.querySelectorAll('.sortable').forEach(function (o) {
          o.classList.remove('asc', 'desc');
        });
        th.classList.add(sortDir > 0 ? 'asc' : 'desc');
        openBase = null;
        renderTable();
      });
    });
  }

  /* ------------------------------ độ tươi ------------------------------- */

  function renderAge() {
    var el = $('oiAge');
    if (!el || !scan) return;
    var at = Number(scan.generatedAt ? Date.parse(scan.generatedAt) : NaN);
    if (!Number.isFinite(at)) { el.textContent = ''; return; }
    var mins = Math.max(0, Math.round((Date.now() - at) / 60000));
    el.textContent = T('oip.age', { n: mins });
  }

  function renderCoverage() {
    var el = $('oiCoverage');
    if (!el || !scan) return;
    el.textContent = T('oip.coverage', {
      shown: rows.length,
      scanned: scan.scanned == null ? '—' : scan.scanned,
    });
  }

  /* -------------------------------- khởi ------------------------------- */

  function paint() {
    build();
    renderSummary(); renderFilters(); renderTable(); renderAge(); renderCoverage();
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
    // Quét hỏng KHÁC quét ra rỗng. Hỏng thì nói là hỏng, không hiện bảng trống
    // như thể thị trường không có coin nào.
    scanFailed = !scan || scan.ok === false || !scan.coins;
    if (scanFailed) scan = scan || null;
    paint();
    wireSort();
  });

  // Mọi thứ trên trang này do JS dựng ra bằng T(), nên đổi ngôn ngữ phải VẼ
  // LẠI — data-i18n chỉ lo phần HTML tĩnh. Giữ nguyên dòng đang mở và bộ lọc
  // đang chọn: đổi ngôn ngữ không phải lý do để mất chỗ người dùng đang xem.
  window.addEventListener('vdear:langchange', function () {
    if (!scan && !scanFailed) return;
    var keep = detailFor;
    detailFor = null;              // buộc tải lại phần chú thích theo ngôn ngữ mới
    paint();
    if (keep && openBase === keep) loadDetail(keep);
  });
})();
