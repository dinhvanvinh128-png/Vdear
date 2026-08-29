/*
 * Vdear — Dashboard
 * - Tab cấp cao: Yêu thích / Crypto
 * - Ticker 50px
 * - Tín hiệu thực chiến (quét toàn bộ futures, khung 4h) — hiện 4, "Xem thêm"
 * - Thanh phân loại mảng coin (kéo ngang) nằm trên bảng biến động
 * - Bảng biến động 24h TẤT CẢ coin (phân trang), sort ±%, icon volume, ⭐ yêu thích
 * - Thang tâm lý thị trường 0-100
 */
(function () {
  const CFG = window.VDEAR_CONFIG;
  const API = window.VdearAPI;
  const TA = window.VdearTA;

  const $ = (id) => document.getElementById(id);
  let market = [];
  let scanResults = [];
  let scanExpanded = false;
  let activeSector = 'all';
  let moversPage = 1;
  let volRank = {};
  let sortState = { key: 'vol', dir: 'desc' }; // KLGD giảm dần mặc định
  let searchQuery = '';

  /* -------- favorites: dùng kho tách lớp (localStorage ↔ cloud) -------- */
  const Fav = window.VdearFav;
  function favHas(base) { return Fav.has(base); }
  function toggleFav(base) { Fav.toggle(base); }
  function updateFavCount() { $('favCount').textContent = Fav.count(); }

  function fmt(p) {
    if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(3);
    if (p >= 0.1) return p.toFixed(4);
    if (p >= 0.01) return p.toFixed(5);
    if (p >= 0.0001) return p.toFixed(7);
    return p.toPrecision(4);
  }
  function shortNum(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toFixed(0);
  }
  function coinLink(base) { return 'coin.html?c=' + encodeURIComponent(base); }

  /* -------------------------- Top tabs (views) ------------------------- */
  function setView(view) {
    document.querySelectorAll('.mtab').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    $('view-crypto').hidden = view !== 'crypto';
    $('view-fav').hidden = view !== 'fav';
    if (view === 'fav') renderFavorites();
  }

  /* -------------------- Gợi ý Long/Short (quét 4h) --------------------- */
  let scanning = false;
  async function runScan() {
    if (scanning) return;
    scanning = true;
    const status = $('scanStatus');
    const btn = $('scanRescan');
    if (status) status.textContent = 'Đang quét…';
    if (btn) { btn.disabled = true; btn.classList.add('spin'); }
    const cap = CFG.scan.universeSize === 'all' ? CFG.scan.maxUniverse : CFG.scan.universeSize;
    const universe = market.slice(0, cap);
    const tf = CFG.timeframes.find((t) => t.id === CFG.scanTimeframe);

    const results = await API.pool(universe, async (coin) => {
      try {
        const candles = await API.klinesMulti(coin, tf.id, CFG.scan.klineLimit);
        if (candles.length < 40) return null;
        const sig = TA.combatSignal(candles);
        return { coin, sig };
      } catch (e) { return null; }
    }, CFG.scan.concurrency);

    scanResults = results.filter((r) => r && r.sig.side !== 'NEUTRAL');
    scanResults.forEach((r) => {
      const z = r.sig.zone.key;
      // extreme 2 = RSI<20 (quá bán mạnh) hoặc RSI>80 (quá mua mạnh) -> ưu tiên cao nhất
      r.extreme = (z === 'ob_strong' || z === 'os_strong') ? 2 : (z === 'ob' || z === 'os') ? 1 : 0;
      r.rank = r.extreme * 20000 + (r.sig.valid ? 3000 : 0) + r.sig.confluence * 300
             + Math.abs(r.sig.score - 50) + r.sig.winRate * 0.2;
    });
    scanResults.sort((a, b) => b.rank - a.rank);
    scanResults = scanResults.slice(0, CFG.scan.targetSignals);

    if (status) status.textContent = `Đã quét · ${scanResults.length} tín hiệu`;
    if (btn) { btn.disabled = false; btn.classList.remove('spin'); }
    scanning = false;
    renderScan();
    renderSentiment();
  }

  function scanCard(r) {
    const c = r.coin, s = r.sig, z = s.zone;
    const isLong = s.side === 'LONG';
    const extremeBadge = s.valid
      ? '<span class="ex-flag strong">HỘI TỤ ✓</span>'
      : r.extreme === 2 ? `<span class="ex-flag">${isLong ? 'QUÁ BÁN MẠNH' : 'QUÁ MUA MẠNH'}</span>`
      : r.extreme === 1 ? `<span class="ex-flag">${isLong ? 'QUÁ BÁN' : 'QUÁ MUA'}</span>` : '';
    const conf = `<div class="sc-conf">
      <span class="cf ${s.rsiNote ? 'on' : ''}" title="RSI đảo chiều">RSI</span>
      <span class="cf ${s.srNear ? 'on' : ''}" title="Gần vùng S&amp;R">S&amp;R</span>
      <span class="cf ${s.paMatch ? 'on' : ''}" title="Xác nhận Price Action">PA</span>
      <span class="cf ${s.breakout ? 'on' : ''}" title="Xác nhận breakout">BO</span>
      <span class="cf ${s.volume ? 'on' : ''}" title="Volume giá bùng nổ">VOL</span></div>`;
    return `<a class="scan-card ${isLong ? 'long' : 'short'} ${s.valid ? 'valid' : ''}" href="${coinLink(c.base)}">
      <div class="sc-top">
        <img class="sc-logo" alt="" data-logo="${c.base}">
        <div class="sc-id"><b>${c.base}</b><span>${'$' + fmt(c.price)}</span></div>
        <span class="sc-side ${isLong ? 'long' : 'short'}">${s.side}</span>
      </div>
      ${extremeBadge ? `<div class="sc-flags">${extremeBadge}</div>` : ''}
      <div class="sc-mid">
        <div class="sc-metric"><span>RSI</span><b style="color:${z.color}">${s.rsi.toFixed(0)}</b></div>
        <div class="sc-metric"><span>Win</span><b>${s.winRate}%</b></div>
        <div class="sc-metric"><span>24h</span><b class="${c.change >= 0 ? 'up' : 'down'}">${c.change.toFixed(1)}%</b></div>
      </div>
      ${conf}
      <div class="sc-bar"><div class="sc-bar-fill ${isLong ? 'long' : 'short'}" style="width:${s.score}%"></div></div>
    </a>`;
  }

  function renderScan() {
    const box = $('scanGrid');
    const shown = scanExpanded ? scanResults : scanResults.slice(0, CFG.scan.initialShow);
    box.innerHTML = shown.map(scanCard).join('');
    box.querySelectorAll('[data-logo]').forEach((img) => API.applyLogo(img, img.dataset.logo));
    const more = $('scanMore');
    if (scanResults.length > CFG.scan.initialShow) {
      more.style.display = 'inline-flex';
      more.textContent = scanExpanded ? '▲ Thu gọn' : `▼ Xem thêm (${scanResults.length - CFG.scan.initialShow})`;
    } else more.style.display = 'none';
  }

  /* ---------------- Sector bar (cuộn/kéo ngang, trên bảng) ------------- */
  function renderSectorBar() {
    const bar = $('sectorBar');
    bar.innerHTML = CFG.sectors.map((s) =>
      `<button class="sector-chip ${s.id === activeSector ? 'active' : ''}" data-sec="${s.id}">${s.label}</button>`
    ).join('');
    bar.querySelectorAll('.sector-chip').forEach((b) => b.addEventListener('click', () => {
      activeSector = b.dataset.sec; moversPage = 1; renderSectorBar(); renderMovers();
    }));
    enableDragScroll(bar);
  }

  // Kéo chuột để cuộn ngang thanh sector.
  function enableDragScroll(el) {
    if (el._dragBound) return; el._dragBound = true;
    let down = false, sx = 0, sl = 0, moved = false;
    el.addEventListener('mousedown', (e) => { down = true; moved = false; sx = e.pageX; sl = el.scrollLeft; });
    el.addEventListener('mousemove', (e) => { if (!down) return; const dx = e.pageX - sx; if (Math.abs(dx) > 3) moved = true; el.scrollLeft = sl - dx; });
    const stop = () => { down = false; };
    el.addEventListener('mouseup', stop); el.addEventListener('mouseleave', stop);
    // chặn click nếu vừa kéo
    el.addEventListener('click', (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); } }, true);
  }

  /* --------------------- Bảng biến động 24h (movers) ------------------- */
  // Ba bậc volume, cùng một ngọn lửa. Bậc được phân biệt bằng độ đậm và cỡ
  // chữ (xem .vico trong styles.css) thay vì đổi sang biểu tượng khác, để hàng
  // nào volume mạnh hơn vẫn nhìn ra ngay mà không phải học ba ký hiệu rời rạc.
  function volIcon(base) {
    const r = volRank[base];
    if (r == null) return '';
    if (r < 3) return '<span class="vico hot" title="Volume rất cao">🔥</span>';
    if (r < 8) return '<span class="vico high" title="Volume cao">🔥</span>';
    if (r < CFG.scan.volIconTop) return '<span class="vico" title="Volume khá">🔥</span>';
    return '';
  }

  function computeVolRank() {
    volRank = {};
    market.slice().sort((a, b) => b.quoteVolume - a.quoteVolume)
      .forEach((c, i) => (volRank[c.base] = i));
  }

  function moverRow(c) {
    const up = c.change >= 0;
    const star = `<button class="fav-star ${favHas(c.base) ? 'on' : ''}" data-fav="${c.base}" title="Yêu thích">${favHas(c.base) ? '★' : '☆'}</button>`;
    return `<tr class="mv-row" data-base="${c.base}">
      <td class="mv-coin"><div class="mv-coin-in">${star}<img class="mv-logo" alt="" data-logo="${c.base}">
        <span class="mv-sym">${c.base}<small>USDT</small> ${volIcon(c.base)}</span></div></td>
      <td class="mv-price">$${fmt(c.price)}</td>
      <td><span class="mv-pill ${up ? 'up' : 'down'}">${up ? '+' : ''}${c.change.toFixed(2)}%</span></td>
      <td class="mv-klgd">$${shortNum(c.quoteVolume)}</td>
    </tr>`;
  }

  function sortedMarket() {
    const sector = CFG.sectors.find((s) => s.id === activeSector);
    let list = market;
    if (sector && sector.coins) list = market.filter((c) => sector.coins.includes(c.base));
    if (searchQuery) list = list.filter((c) => c.base.toLowerCase().includes(searchQuery));
    list = list.slice();
    const { key, dir } = sortState;
    const sgn = dir === 'asc' ? 1 : -1;
    if (key === 'name') list.sort((a, b) => sgn * a.base.localeCompare(b.base));
    else if (key === 'price') list.sort((a, b) => sgn * (a.price - b.price));
    else if (key === 'change') list.sort((a, b) => sgn * (a.change - b.change));
    else list.sort((a, b) => sgn * (a.quoteVolume - b.quoteVolume)); // vol / KLGD
    return list;
  }

  // Cập nhật mũi tên ▲/▼ trên header + đồng bộ dropdown.
  function updateSortUI() {
    document.querySelectorAll('.movers .th-sort').forEach((th) => {
      th.classList.toggle('asc', th.dataset.sort === sortState.key && sortState.dir === 'asc');
      th.classList.toggle('desc', th.dataset.sort === sortState.key && sortState.dir === 'desc');
    });
  }

  function setSort(key) {
    if (sortState.key === key) sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
    else { sortState.key = key; sortState.dir = key === 'name' ? 'asc' : 'desc'; }
    moversPage = 1; renderMovers(); updateSortUI();
  }

  function renderMovers() {
    computeVolRank();
    const list = sortedMarket();
    const size = CFG.scan.moversPageSize;
    const totalPages = Math.max(1, Math.ceil(list.length / size));
    if (moversPage > totalPages) moversPage = totalPages;
    const start = (moversPage - 1) * size;
    const page = list.slice(start, start + size);

    const body = $('moversBody');
    body.innerHTML = page.length
      ? page.map((c) => moverRow(c)).join('')
      : '<tr><td colspan="4" class="muted">Không có coin trong nhóm này.</td></tr>';
    body.querySelectorAll('[data-logo]').forEach((img) => API.applyLogo(img, img.dataset.logo));
    bindRowActions(body);
    renderPager(totalPages, list.length);
  }

  // Điều hướng khi bấm hàng + toggle ⭐ (event delegation, chống lỗi click).
  function bindRowActions(body) {
    if (body._bound) return; body._bound = true;
    body.addEventListener('click', (e) => {
      const star = e.target.closest('.fav-star');
      if (star) {
        e.stopPropagation();
        toggleFav(star.dataset.fav);
        star.classList.toggle('on');
        star.textContent = star.classList.contains('on') ? '★' : '☆';
        return;
      }
      const row = e.target.closest('.mv-row');
      if (row && row.dataset.base) window.location.href = coinLink(row.dataset.base);
    });
  }

  function renderPager(totalPages, totalItems) {
    const pager = $('moversPager');
    if (!pager) return;
    if (totalPages <= 1) { pager.innerHTML = `<span class="pager-info">${totalItems} coin</span>`; return; }
    const cur = moversPage;
    const nums = new Set([1, totalPages, cur, cur - 1, cur + 1, 2, totalPages - 1]);
    const pages = [...nums].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
    let html = `<button class="pg-btn" data-go="${Math.max(1, cur - 1)}" ${cur === 1 ? 'disabled' : ''}>‹</button>`;
    let prev = 0;
    for (const n of pages) {
      if (n - prev > 1) html += '<span class="pg-dots">…</span>';
      html += `<button class="pg-btn ${n === cur ? 'active' : ''}" data-go="${n}">${n}</button>`;
      prev = n;
    }
    html += `<button class="pg-btn" data-go="${Math.min(totalPages, cur + 1)}" ${cur === totalPages ? 'disabled' : ''}>›</button>`;
    html += `<span class="pager-info">${totalItems} coin</span>`;
    pager.innerHTML = html;
    pager.querySelectorAll('.pg-btn').forEach((b) => b.addEventListener('click', () => {
      moversPage = +b.dataset.go; renderMovers();
      document.querySelector('.movers').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  /* ------------------------------ Favorites ---------------------------- */
  function renderFavorites() {
    computeVolRank();
    const list = market.filter((c) => favHas(c.base));
    const body = $('favBody');
    body.innerHTML = list.length ? list.map((c) => moverRow(c)).join('') : '';
    $('favEmpty').style.display = list.length ? 'none' : 'block';
    body.querySelectorAll('[data-logo]').forEach((img) => API.applyLogo(img, img.dataset.logo));
    bindRowActions(body);
  }


  /* --------------------- Thang tâm lý thị trường ----------------------- */
  function renderSentiment() {
    if (!scanResults.length) return;
    const avg = Math.round(scanResults.reduce((a, r) => a + r.sig.score, 0) / scanResults.length);
    const upRatio = market.slice(0, 100).filter((c) => c.change > 0).length;
    const val = Math.max(0, Math.min(100, Math.round(avg * 0.6 + upRatio * 0.4)));
    $('sentFill').style.width = val + '%';
    let label, cls;
    if (val >= 65) { label = 'Tham lam · thiên LONG'; cls = 'long'; }
    else if (val <= 35) { label = 'Sợ hãi · thiên SHORT'; cls = 'short'; }
    else { label = 'Trung tính'; cls = 'neutral'; }
    $('sentFill').className = 'gauge-fill ' + cls;
    $('sentValue').textContent = val + '/100';
    $('sentLabel').textContent = label;
    $('sentLabel').className = 'gauge-side ' + cls;
  }

  /* ------------------------------- init -------------------------------- */
  async function init() {
    window.VdearTicker.initTicker('ticker');
    updateFavCount();
    // khi Yêu thích đổi (kể cả do đồng bộ cloud lúc đăng nhập) -> cập nhật UI
    Fav.onChange(() => {
      updateFavCount();
      if (market.length) renderMovers();
      if (!$('view-fav').hidden) renderFavorites();
    });

    document.querySelectorAll('.mtab').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
    // Menu 3 gạch trỏ thẳng vào một tab: index.html?view=fav.
    const wanted = new URLSearchParams(location.search).get('view');
    if (wanted === 'fav') setView(wanted);
    renderSectorBar();
    $('scanMore').addEventListener('click', () => { scanExpanded = !scanExpanded; renderScan(); });
    $('scanRescan').addEventListener('click', async () => {
      try { market = await API.getMarket(true); renderMovers(); } catch (e) {}
      runScan();
    });
    // ô tìm kiếm coin
    const search = $('moverSearch'), clearBtn = $('searchClear');
    search.addEventListener('input', () => {
      searchQuery = search.value.trim().toLowerCase();
      clearBtn.hidden = !searchQuery;
      moversPage = 1; renderMovers();
    });
    clearBtn.addEventListener('click', () => { search.value = ''; searchQuery = ''; clearBtn.hidden = true; moversPage = 1; renderMovers(); search.focus(); });
    // sort qua header (mũi tên ▲/▼)
    document.querySelectorAll('.movers .th-sort').forEach((th) =>
      th.addEventListener('click', () => setSort(th.dataset.sort)));
    updateSortUI();

    // ETF nạp độc lập: nguồn khác hẳn, hỏng cũng không được kéo theo bảng coin.
    if (window.VdearETF) window.VdearETF.init('etfBody');

    try {
      market = await API.getMarket();
      renderMovers();
      // Vào thẳng tab Yêu thích thì lúc render lần đầu `market` còn rỗng; vẽ lại
      // ngay khi có dữ liệu thay vì để trống tới nhịp làm mới 30s kế tiếp.
      if (!$('view-fav').hidden) renderFavorites();
      // Bản đồ 3D cần `market` -> gọi sau khi đã có dữ liệu. Không await: nó
      // chỉ dựng cảnh từ dữ liệu sẵn có, đừng bắt phần quét tín hiệu đợi.
      initMarket3D();
      await runScan();
    } catch (e) {
      $('scanStatus').textContent = 'Không tải được dữ liệu thị trường. Kiểm tra kết nối mạng và thử lại.';
      console.error(e);
    }

    setInterval(async () => {
      try { market = await API.getMarket(true); renderMovers(); if (!$('view-fav').hidden) renderFavorites(); initMarket3D(); } catch (e) {}
    }, 30000);
    setInterval(runScan, 5 * 60000);
  }

  /*
   * BẢN ĐỒ THỊ TRƯỜNG 3D. Engine ở js/market3d.js (tự viết, không thư viện).
   * Ở đây chỉ lo: chọn coin nào, định dạng thẻ thông tin, nối hai nút bấm.
   */
  let m3 = null;
  function initMarket3D() {
    const canvas = $('m3Canvas');
    if (!canvas || !window.VdearMarket3D) return;
    const list = (market || []).filter((c) => c.price > 0 && c.quoteVolume > 0);
    if (!list.length) return;
    // Khối lượng lớn nhất trước: cột to đứng gần tâm, dễ đọc.
    list.sort((a, b) => (b.quoteVolume || 0) - (a.quoteVolume || 0));

    const usd = (n) => {
      if (n == null || !Number.isFinite(n)) return '—';
      const a = Math.abs(n);
      if (a >= 1e9) return '$' + (a / 1e9).toFixed(2) + 'B';
      if (a >= 1e6) return '$' + (a / 1e6).toFixed(2) + 'M';
      if (a >= 1e3) return '$' + (a / 1e3).toFixed(1) + 'K';
      return '$' + a.toFixed(2);
    };
    const fmt = (c) => {
      const cls = c.change > 0 ? 'up' : c.change < 0 ? 'down' : '';
      const pc = (c.change == null ? '—' : (c.change > 0 ? '+' : '') + c.change.toFixed(2) + '%');
      return `<div class="m3-tip-h"><b>${c.base}</b><span class="${cls}">${pc}</span></div>
        <div class="m3-tip-p">$${(c.price || 0).toLocaleString('en-US',
          { minimumFractionDigits: c.price < 1 ? 6 : 2, maximumFractionDigits: c.price < 1 ? 6 : 2 })}</div>
        <dl class="m3-tip-d">
          <dt>Khối lượng 24h</dt><dd>${usd(c.quoteVolume)}</dd>
          <dt>Số sàn niêm yết</dt><dd>${c.exchangeCount || '—'}</dd>
          <dt>Funding</dt><dd>${c.funding == null ? '—'
            : (c.funding > 0 ? '+' : '') + (c.funding * 100).toFixed(4) + '%'}</dd>
        </dl>`;
    };

    if (m3) { m3.setData(list); }
    else {
      m3 = window.VdearMarket3D.mount(canvas, $('m3Tip'), list, fmt, { count: 36 });
      const spin = $('m3Spin');
      spin.addEventListener('click', () => {
        const on = m3.toggleSpin();
        spin.setAttribute('aria-pressed', on ? 'true' : 'false');
        spin.textContent = on ? 'Tự xoay' : 'Đã dừng';
      });
      $('m3Reset').addEventListener('click', () => m3.reset());
    }
    const empty = $('m3Empty');
    if (empty) empty.hidden = true;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
