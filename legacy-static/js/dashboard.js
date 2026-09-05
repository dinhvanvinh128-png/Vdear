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
  // Chữ hiển thị lấy qua i18n. t() tự rơi về tiếng Việt khi thiếu bản dịch;
  // i18n.js được nạp trước mọi module nên nhánh dự phòng dưới đây gần như
  // không bao giờ chạy, để đó cho chắc.
  const T = (k, v) => (window.VdearI18n ? window.VdearI18n.t(k, v) : k);

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

  /* ------------------------- Lọc theo Yêu thích ------------------------ */
  /*
   * Trước đây Yêu thích là một "view" riêng, thay chỗ cả bảng thị trường. Nay
   * nó là một BỘ LỌC của chính bảng Biến động 24h — nút nằm ngay trên bảng nên
   * lúc nào cũng bấm lại được, và người dùng giữ nguyên sắp xếp, phân trang,
   * ô tìm kiếm đang có thay vì rơi sang một bảng khác.
   */
  let favOnly = false;

  function setFavOnly(on) {
    favOnly = !!on;
    const btn = $('favFilter');
    if (btn) {
      btn.setAttribute('aria-pressed', String(favOnly));
      btn.classList.toggle('on', favOnly);
    }
    moversPage = 1;
    renderMovers();
  }

  /* -------------------- Gợi ý Long/Short (quét 4h) --------------------- */
  let scanning = false;
  async function runScan() {
    if (scanning) return;
    scanning = true;
    const status = $('scanStatus');
    const btn = $('scanRescan');
    scanStatusKey = { k: 'st.scanning', v: null };
    if (status) status.textContent = T('st.scanning');
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

    scanStatusKey = { k: 'scan.done', v: { n: scanResults.length } };
    if (status) status.textContent = T(scanStatusKey.k, scanStatusKey.v);
    if (btn) { btn.disabled = false; btn.classList.remove('spin'); }
    scanning = false;
    renderScan();
    renderSentiment();
  }

  function scanCard(r) {
    const c = r.coin, s = r.sig, z = s.zone;
    const isLong = s.side === 'LONG';
    const extremeBadge = s.valid
      ? `<span class="ex-flag strong">${T('scan.confluence')}</span>`
      : r.extreme === 2 ? `<span class="ex-flag">${T(isLong ? 'scan.oversoldHard' : 'scan.overboughtHard')}</span>`
      : r.extreme === 1 ? `<span class="ex-flag">${T(isLong ? 'scan.oversold' : 'scan.overbought')}</span>` : '';
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
      more.textContent = scanExpanded ? T('st.less') : T('scan.moreN', { n: scanResults.length - CFG.scan.initialShow });
    } else more.style.display = 'none';
  }

  /* ---------------- Sector bar (cuộn/kéo ngang, trên bảng) ------------- */
  function renderSectorBar() {
    const bar = $('sectorBar');
    bar.innerHTML = CFG.sectors.map((s) =>
      `<button class="sector-chip ${s.id === activeSector ? 'active' : ''}" data-sec="${s.id}">${s.k ? T(s.k) : s.label}</button>`
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
    if (r < 3) return `<span class="vico hot" title="${T('vol.veryHigh')}">🔥</span>`;
    if (r < 8) return `<span class="vico high" title="${T('vol.high')}">🔥</span>`;
    if (r < CFG.scan.volIconTop) return `<span class="vico" title="${T('vol.decent')}">🔥</span>`;
    return '';
  }

  function computeVolRank() {
    volRank = {};
    market.slice().sort((a, b) => b.quoteVolume - a.quoteVolume)
      .forEach((c, i) => (volRank[c.base] = i));
  }

  function moverRow(c) {
    const up = c.change >= 0;
    const star = `<button class="fav-star ${favHas(c.base) ? 'on' : ''}" data-fav="${c.base}" title="${T('movers.favStar')}">${favHas(c.base) ? '★' : '☆'}</button>`;
    return `<tr class="mv-row" data-base="${c.base}">
      <td class="mv-coin"><div class="mv-coin-in">${star}<img class="mv-logo" alt="" data-logo="${c.base}">
        <span class="mv-sym">${c.base}<small>USDT</small> ${volIcon(c.base)}</span></div></td>
      <td class="mv-price">$${fmt(c.price)}</td>
      <td><span class="mv-pill ${up ? 'up' : 'down'}">${up ? '+' : ''}${c.change.toFixed(2)}%</span></td>
      <td class="mv-klgd">$${shortNum(c.quoteVolume)}</td>
      ${oiCell(c.base)}${lsCell(c.base)}
    </tr>`;
  }

  /* ------------------- Cột OI 24h % và Long/Short ---------------------- */

  /*
   * Dữ liệu đến từ /api/oi-scan — một máy chủ quét, mọi người đọc chung. Xem
   * đầu api/oi-scan.js để biết vì sao không quét từ trình duyệt.
   *
   * Hàm đó chỉ quét TOP coin theo khối lượng, nên coin ngoài top KHÔNG có dữ
   * liệu. Ô đó hiện "—": nói thật là chưa quét tới, hơn là bịa ra số.
   */
  let oiScan = null;   // { coins: { BASE: {oiPct, longPct, shortPct} } }

  async function loadOiScan() {
    try {
      const r = await fetch('/api/oi-scan', { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      oiScan = j && j.coins ? j : null;
    } catch (e) {
      oiScan = null;   // hai cột hiện "—", bảng vẫn chạy
    }
    if (market.length) renderMovers();
  }

  function oiOf(base) {
    const c = oiScan && oiScan.coins && oiScan.coins[base];
    return c && c.oiPct != null ? c.oiPct : null;
  }
  function lsOf(base) {
    const c = oiScan && oiScan.coins && oiScan.coins[base];
    return c && c.longPct != null ? c.longPct : null;
  }

  function oiCell(base) {
    const v = oiOf(base);
    if (v == null) return '<td class="mv-oi muted">—</td>';
    const up = v >= 0;
    return `<td class="mv-oi"><span class="mv-pill ${up ? 'up' : 'down'}">${up ? '+' : ''}${v.toFixed(2)}%</span></td>`;
  }
  function lsCell(base) {
    const v = lsOf(base);
    if (v == null) return '<td class="mv-ls muted">—</td>';
    // Một thanh nhỏ CỘNG một con số: thanh cho thấy nghiêng bên nào chỉ bằng
    // liếc mắt, con số để so chính xác giữa các hàng và để sắp xếp.
    return `<td class="mv-ls"><span class="mv-lsbar" aria-hidden="true"><i style="width:${v.toFixed(1)}%"></i></span>`
      + `<b>${v.toFixed(1)}%</b></td>`;
  }

  function sortedMarket() {
    const sector = CFG.sectors.find((s) => s.id === activeSector);
    let list = market;
    if (sector && sector.coins) list = market.filter((c) => sector.coins.includes(c.base));
    if (searchQuery) list = list.filter((c) => c.base.toLowerCase().includes(searchQuery));
    if (favOnly) list = list.filter((c) => favHas(c.base));
    list = list.slice();
    const { key, dir } = sortState;
    const sgn = dir === 'asc' ? 1 : -1;
    if (key === 'name') list.sort((a, b) => sgn * a.base.localeCompare(b.base));
    else if (key === 'price') list.sort((a, b) => sgn * (a.price - b.price));
    else if (key === 'change') list.sort((a, b) => sgn * (a.change - b.change));
    // Coin chưa có dữ liệu OI/LS luôn bị đẩy XUỐNG CUỐI dù sắp tăng hay giảm.
    // Coi null là 0 thì cả trăm coin "chưa quét tới" chen vào giữa bảng và
    // trông y như coin có OI đứng yên — hai chuyện hoàn toàn khác nhau.
    else if (key === 'oi' || key === 'ls') {
      const get = key === 'oi' ? oiOf : lsOf;
      list.sort((a, b) => {
        const x = get(a.base), y = get(b.base);
        if (x == null && y == null) return b.quoteVolume - a.quoteVolume;
        if (x == null) return 1;
        if (y == null) return -1;
        return sgn * (x - y);
      });
    }
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
      : `<tr><td colspan="6" class="muted">${favOnly
          ? T('movers.noFavMatch')
          : T('movers.noneInGroup')}</td></tr>`;
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
    if (totalPages <= 1) { pager.innerHTML = `<span class="pager-info">${T('movers.count', { n: totalItems })}</span>`; return; }
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
    html += `<span class="pager-info">${T('movers.count', { n: totalItems })}</span>`;
    pager.innerHTML = html;
    pager.querySelectorAll('.pg-btn').forEach((b) => b.addEventListener('click', () => {
      moversPage = +b.dataset.go; renderMovers();
      document.querySelector('.movers').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  /* ------------------------------ Favorites ---------------------------- */

  /* ----------------------- Tỉ lệ Long / Short -------------------------- */

  /*
   * Hai chuỗi Binance công bố cho BTC:
   *   - vị thế của nhóm top trader (đo TIỀN)
   *   - tài khoản toàn thị trường  (đo ĐẦU NGƯỜI)
   * Hai con số này khác nhau về ý nghĩa nên vẽ thành hai thanh riêng, không
   * trộn lại thành một. Và ghi rõ là của BTC: gộp nhiều coin lại thành một
   * con số "cả thị trường" là tự chế ra một chỉ số chưa ai định nghĩa.
   *
   * Khung 4H cho khớp với chính khung mà Futures Radar đang quét.
   */
  const LS_TF = '4h';
  let lastLs = null;

  async function loadLongShort() {
    const OI = window.VdearOI;
    if (!OI || !$('lsBody')) return;
    let top = null, glob = null;
    try {
      const r = await Promise.all([
        OI.latestRatio('BTC', 'top', LS_TF),
        OI.latestRatio('BTC', 'global', LS_TF),
      ]);
      top = r[0]; glob = r[1];
    } catch (e) { top = glob = null; }
    lastLs = { top: top, glob: glob };
    renderLongShort();
  }

  function lsRow(labelKey, r) {
    if (!r) return '';
    const lo = Math.max(0, Math.min(1, r.long));
    const sh = Math.max(0, Math.min(1, r.short));
    // Chuẩn hoá lại cho đủ 100%: nguồn trả hai tỉ trọng riêng, tổng có thể
    // lệch vài phần nghìn do làm tròn, và thanh vẽ ra sẽ hụt một sợi tóc.
    const sum = lo + sh || 1;
    const lp = (lo / sum) * 100, sp = (sh / sum) * 100;
    return `<div class="ls-row">
      <div class="ls-row-top"><span>${T(labelKey)}</span>
        <b>${lp.toFixed(1)}% / ${sp.toFixed(1)}%</b></div>
      <div class="ls-bar" role="img"
           aria-label="${T(labelKey)}: ${T('ls.long')} ${lp.toFixed(1)}%, ${T('ls.short')} ${sp.toFixed(1)}%">
        <i class="ls-long" style="width:${lp.toFixed(2)}%"></i>
        <i class="ls-short" style="width:${sp.toFixed(2)}%"></i>
      </div>
    </div>`;
  }

  function renderLongShort() {
    const box = $('lsBody');
    if (!box) return;
    const d = lastLs;
    if (!d || (!d.top && !d.glob)) {
      box.innerHTML = `<p class="ls-empty">${T('ls.none')}</p>`;
      return;
    }
    box.innerHTML = lsRow('ls.top', d.top) + lsRow('ls.global', d.glob);

    // Câu chú thích nói THẲNG đám đông đang nghiêng bên nào, lấy theo chuỗi
    // tài khoản toàn thị trường (đo đầu người) vì đó mới là "đám đông".
    const note = document.querySelector('.ls-note');
    const g = d.glob || d.top;
    if (note && g) {
      const lp = g.long / ((g.long + g.short) || 1);
      const key = lp > 0.55 ? 'ls.leanLong' : lp < 0.45 ? 'ls.leanShort' : 'ls.balanced';
      note.textContent = T('ls.crowd') + ' — ' + T(key);
    }
  }

  /* --------------------- Thang tâm lý thị trường ----------------------- */
  // Câu đang hiện ở ô trạng thái quét, giữ dạng KHOÁ để đổi ngôn ngữ là dịch
  // lại được đúng câu đó — thẻ có thể đứng ở "Đã quét · 0 tín hiệu" rất lâu.
  let scanStatusKey = null;

  // Đổi ngôn ngữ: những phần vẽ từ dữ liệu (lưới tín hiệu, bảng, dải mảng, thang
  // tâm lý) nằm ngoài tầm với của lượt dịch DOM, phải tự vẽ lại. Chỉ vẽ lại khi
  // ĐÃ có dữ liệu — gọi sớm sẽ đạp lên trạng thái "đang quét".
  window.addEventListener('vdear:langchange', () => {
    try {
      renderSectorBar();
      renderLongShort();
      const st = $('scanStatus');
      if (st && scanStatusKey) st.textContent = T(scanStatusKey.k, scanStatusKey.v);
      renderMovers();                       // kể cả khi rỗng: dòng "không có coin" cũng là chữ
      if (scanResults.length) { renderScan(); renderSentiment(); }
    } catch (e) { /* đổi ngôn ngữ không được phép làm vỡ trang */ }
  });

  function renderSentiment() {
    if (!scanResults.length) return;
    const avg = Math.round(scanResults.reduce((a, r) => a + r.sig.score, 0) / scanResults.length);
    const upRatio = market.slice(0, 100).filter((c) => c.change > 0).length;
    const val = Math.max(0, Math.min(100, Math.round(avg * 0.6 + upRatio * 0.4)));
    $('sentFill').style.width = val + '%';
    let label, cls;
    if (val >= 65) { label = T('sent.greed'); cls = 'long'; }
    else if (val <= 35) { label = T('sent.fear'); cls = 'short'; }
    else { label = T('sent.neutral'); cls = 'neutral'; }
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
      // Bỏ sao khi đang lọc Yêu thích thì dòng đó phải biến khỏi bảng ngay.
      if (market.length) renderMovers();
    });

    const favBtn = $('favFilter');
    if (favBtn) favBtn.addEventListener('click', () => setFavOnly(!favOnly));
    // Menu 3 gạch trỏ thẳng vào Yêu thích: index.html?view=fav.
    if (new URLSearchParams(location.search).get('view') === 'fav') setFavOnly(true);
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

    // Long/Short cũng nạp độc lập và KHÔNG await: nguồn riêng, chậm hay hỏng
    // đều không được giữ bảng coin lại. Làm mới 5 phút một lần cho khớp với
    // TTL của chính module OI — gọi dày hơn chỉ tốn hạn mức mà không có số mới.
    loadLongShort();
    setInterval(() => { if (!document.hidden) loadLongShort(); }, 5 * 60000);

    // Bản quét OI/LS cho cả bảng. Không await: bảng coin phải hiện ngay, hai
    // cột điền vào sau. Làm mới 5 phút một lần cho khớp s-maxage của CDN.
    loadOiScan();
    setInterval(() => { if (!document.hidden) loadOiScan(); }, 5 * 60000);

    try {
      market = await API.getMarket();
      renderMovers();
      await runScan();
    } catch (e) {
      scanStatusKey = { k: 'scan.loadFailed', v: null };
      $('scanStatus').textContent = T('scan.loadFailed');
      console.error(e);
    }

    setInterval(async () => {
      try { market = await API.getMarket(true); renderMovers(); } catch (e) {}
    }, 30000);
    setInterval(runScan, 5 * 60000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
