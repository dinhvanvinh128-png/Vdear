/*
 * Vdear — Dashboard
 * - Tab cấp cao: Yêu thích / Crypto / TradFi
 * - Ticker 50px
 * - Tín hiệu thực chiến (quét toàn bộ futures, khung 4h) — hiện 4, "Xem thêm"
 * - Thanh phân loại mảng coin (kéo ngang) nằm trên bảng biến động
 * - Bảng biến động 24h TẤT CẢ coin (phân trang), sort ±%, icon volume, ⭐ yêu thích
 * - Mảng TradFi (XAU/XAG/CL/BZ)
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
  let favs = loadFavs();

  /* ------------------------------ favorites ---------------------------- */
  function loadFavs() {
    try { return new Set(JSON.parse(localStorage.getItem('vdear_fav') || '[]')); }
    catch (e) { return new Set(); }
  }
  function saveFavs() { try { localStorage.setItem('vdear_fav', JSON.stringify([...favs])); } catch (e) {} }
  function toggleFav(base) {
    if (favs.has(base)) favs.delete(base); else favs.add(base);
    saveFavs(); updateFavCount();
  }
  function updateFavCount() { $('favCount').textContent = favs.size; }

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
    $('view-tradfi').hidden = view !== 'tradfi';
    $('view-fav').hidden = view !== 'fav';
    if (view === 'fav') renderFavorites();
    if (view === 'tradfi') renderTradFi();
  }

  /* -------------------- Gợi ý Long/Short (quét 4h) --------------------- */
  async function runScan() {
    const status = $('scanStatus');
    const cap = CFG.scan.universeSize === 'all' ? CFG.scan.maxUniverse : CFG.scan.universeSize;
    const universe = market.slice(0, cap);
    const tf = CFG.timeframes.find((t) => t.id === CFG.scanTimeframe);
    let done = 0;

    const results = await API.pool(universe, async (coin) => {
      try {
        const candles = await API.klinesMulti(coin, tf.id, CFG.scan.klineLimit);
        done++;
        if (status) status.textContent = `Đang quét ${done}/${universe.length} coin futures (toàn bộ · khung ${tf.label})…`;
        if (candles.length < 40) return null;
        const sig = TA.combatSignal(candles);
        return { coin, sig };
      } catch (e) { done++; return null; }
    }, CFG.scan.concurrency);

    scanResults = results.filter((r) => r && r.sig.side !== 'NEUTRAL');
    scanResults.forEach((r) => {
      const z = r.sig.zone.key;
      r.extreme = (z === 'ob_strong' || z === 'os_strong') ? 2 : (z === 'ob' || z === 'os') ? 1 : 0;
      r.rank = (r.sig.valid ? 5000 : 0) + r.extreme * 1000 + r.sig.confluence * 300
             + Math.abs(r.sig.score - 50) + r.sig.winRate * 0.2;
    });
    scanResults.sort((a, b) => b.rank - a.rank);
    scanResults = scanResults.slice(0, CFG.scan.targetSignals);

    const validCount = scanResults.filter((r) => r.sig.valid).length;
    if (status) status.textContent = `Đã quét TOÀN BỘ ${universe.length} coin futures · khung ${tf.label} · ${scanResults.length} tín hiệu (${validCount} đạt hội tụ ✓)`;
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
      <span class="cf ${s.paMatch ? 'on' : ''}" title="Xác nhận Price Action">PA</span></div>`;
    return `<a class="scan-card ${isLong ? 'long' : 'short'} ${s.valid ? 'valid' : ''}" href="${coinLink(c.base)}">
      <div class="sc-top">
        <img class="sc-logo" alt="" data-logo="${c.base}">
        <div class="sc-id"><b>${c.base}</b><span>${'$' + fmt(c.price)}</span></div>
        <span class="sc-side ${isLong ? 'long' : 'short'}">${s.side}</span>
      </div>
      <div class="sc-mid">
        <div class="sc-metric"><span>RSI</span><b style="color:${z.color}">${s.rsi.toFixed(0)}</b></div>
        <div class="sc-metric"><span>Win</span><b>${s.winRate}%</b></div>
        <div class="sc-metric"><span>24h</span><b class="${c.change >= 0 ? 'up' : 'down'}">${c.change.toFixed(1)}%</b></div>
      </div>
      ${conf}
      <div class="sc-bar"><div class="sc-bar-fill ${isLong ? 'long' : 'short'}" style="width:${s.score}%"></div></div>
      ${extremeBadge}
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
      `<button class="sector-chip ${s.id === activeSector ? 'active' : ''}" data-sec="${s.id}">
        <span class="sec-ico">${s.icon}</span>${s.label}</button>`
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
  function volIcon(base) {
    const r = volRank[base];
    if (r == null) return '';
    if (r < 3) return '<span class="vico hot" title="Volume rất cao">🔥</span>';
    if (r < 8) return '<span class="vico high" title="Volume cao">💧</span>';
    if (r < CFG.scan.volIconTop) return '<span class="vico" title="Volume khá">📊</span>';
    return '';
  }

  function computeVolRank() {
    volRank = {};
    market.slice().sort((a, b) => b.quoteVolume - a.quoteVolume)
      .forEach((c, i) => (volRank[c.base] = i));
  }

  function moverRow(c, i) {
    const up = c.change >= 0;
    const fund = c.funding != null
      ? `<span class="${c.funding >= 0 ? 'up' : 'down'}">${c.funding >= 0 ? '+' : ''}${c.funding.toFixed(4)}%</span>`
      : '<span class="muted">—</span>';
    const star = `<button class="fav-star ${favs.has(c.base) ? 'on' : ''}" data-fav="${c.base}" title="Yêu thích">${favs.has(c.base) ? '★' : '☆'}</button>`;
    return `<tr class="mv-row" data-base="${c.base}">
      <td class="mv-rank">${star}<span>${i}</span></td>
      <td class="mv-coin"><img class="mv-logo" alt="" data-logo="${c.base}">
        <span class="mv-cell">
          <span class="mv-sym">${c.base}<small>USDT</small> ${volIcon(c.base)}</span>
          <small class="mv-subvol">${shortNum(c.quoteVolume)} USDT</small>
        </span></td>
      <td class="mv-price">$${fmt(c.price)}</td>
      <td><span class="mv-pill ${up ? 'up' : 'down'}">${up ? '+' : ''}${c.change.toFixed(2)}%</span></td>
      <td class="mv-fund">${fund}</td>
    </tr>`;
  }

  function sortedMarket() {
    const sector = CFG.sectors.find((s) => s.id === activeSector);
    let list = market;
    if (sector && sector.coins) list = market.filter((c) => sector.coins.includes(c.base));
    const mode = $('moverSort').value;
    list = list.slice();
    if (mode === 'gain') list.sort((a, b) => b.change - a.change);
    else if (mode === 'lose') list.sort((a, b) => a.change - b.change);
    else list.sort((a, b) => b.quoteVolume - a.quoteVolume);
    return list;
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
      ? page.map((c, k) => moverRow(c, start + k + 1)).join('')
      : '<tr><td colspan="5" class="muted">Không có coin trong nhóm này.</td></tr>';
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
    const list = market.filter((c) => favs.has(c.base));
    const body = $('favBody');
    body.innerHTML = list.length ? list.map((c, k) => moverRow(c, k + 1)).join('') : '';
    $('favEmpty').style.display = list.length ? 'none' : 'block';
    body.querySelectorAll('[data-logo]').forEach((img) => API.applyLogo(img, img.dataset.logo));
    bindRowActions(body);
  }

  /* ------------------------------ TradFi ------------------------------- */
  async function renderTradFi() {
    let data;
    try { data = await API.getTradFi(); } catch (e) { data = []; }
    $('tradfiRow').innerHTML = data.map((t) => {
      const up = t.change >= 0;
      return `<div class="tf-card">
        <div class="tf-ico">${t.icon}</div>
        <div class="tf-body">
          <div class="tf-sym">${t.symbol} <small>${t.label}</small></div>
          <div class="tf-price">$${fmt(t.price)} <span class="tf-unit">${t.unit}</span></div>
        </div>
        <div class="tf-chg ${up ? 'up' : 'down'}">${up ? '+' : ''}${t.change.toFixed(2)}%
          ${t.live ? '<span class="live-dot" title="realtime"></span>' : '<small class="sim" title="dữ liệu mô phỏng">~</small>'}</div>
      </div>`;
    }).join('');
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

    document.querySelectorAll('.mtab').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
    renderSectorBar();
    $('scanMore').addEventListener('click', () => { scanExpanded = !scanExpanded; renderScan(); });
    $('moverSort').addEventListener('change', () => { moversPage = 1; renderMovers(); });

    try {
      market = await API.getMarket();
      renderMovers();
      renderTradFi();
      await runScan();
    } catch (e) {
      $('scanStatus').textContent = 'Không tải được dữ liệu thị trường. Kiểm tra kết nối mạng và thử lại.';
      console.error(e);
    }

    setInterval(async () => {
      try { market = await API.getMarket(true); renderMovers(); if (!$('view-fav').hidden) renderFavorites(); } catch (e) {}
    }, 30000);
    setInterval(runScan, 5 * 60000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
