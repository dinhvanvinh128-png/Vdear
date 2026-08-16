/*
 * Vdear — Dashboard
 * - Ticker 50px
 * - Gợi ý Long/Short (quét ~top coin, khung 4h), ưu tiên coin quá mua/quá bán
 * - Hàng phân loại sector
 * - Bảng biến động 24h (vol/giá/%), icon volume cao
 * - Mảng TradFi (XAU/XAG/CL/BZ)
 * - Thang đo tâm lý thị trường 0-100
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

  function fmt(p) {
    if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(3);
    if (p >= 0.01) return p.toFixed(5);
    return p.toPrecision(4);
  }
  function shortNum(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toFixed(0);
  }
  function coinLink(base) { return 'coin.html?c=' + encodeURIComponent(base); }

  /* -------------------- Gợi ý Long/Short (quét 4h) --------------------- */
  async function runScan() {
    const status = $('scanStatus');
    // 'all' = quét toàn bộ coin futures (giới hạn bởi maxUniverse để an toàn).
    const cap = CFG.scan.universeSize === 'all' ? CFG.scan.maxUniverse : CFG.scan.universeSize;
    const universe = market.slice(0, cap);
    const tf = CFG.timeframes.find((t) => t.id === CFG.scanTimeframe);
    let done = 0;

    const results = await API.pool(universe, async (coin) => {
      try {
        const candles = await API.binanceKlines(coin.symbol, tf.binance, CFG.scan.klineLimit);
        done++;
        if (status) status.textContent = `Đang quét ${done}/${universe.length} coin futures (toàn bộ · chiến lược thực chiến · khung ${tf.label})…`;
        if (candles.length < 40) return null;
        const sig = TA.combatSignal(candles); // RSI đảo chiều + S&R + Price Action
        return { coin, sig };
      } catch (e) { done++; return null; }
    }, CFG.scan.concurrency);

    scanResults = results.filter((r) => r && r.sig.side !== 'NEUTRAL');
    // Ưu tiên: tín hiệu thực chiến hợp lệ > coin quá mua/quá bán > độ hội tụ > win-rate.
    scanResults.forEach((r) => {
      const z = r.sig.zone.key;
      r.extreme = (z === 'ob_strong' || z === 'os_strong') ? 2 : (z === 'ob' || z === 'os') ? 1 : 0;
      r.rank = (r.sig.valid ? 5000 : 0) + r.extreme * 1000 + r.sig.confluence * 300
             + Math.abs(r.sig.score - 50) + r.sig.winRate * 0.2;
    });
    scanResults.sort((a, b) => b.rank - a.rank);
    scanResults = scanResults.slice(0, CFG.scan.targetSignals);

    const validCount = scanResults.filter((r) => r.sig.valid).length;
    if (status) status.textContent = `Đã quét TOÀN BỘ ${universe.length} coin futures · khung ${tf.label} · ${scanResults.length} tín hiệu (${validCount} đạt hội tụ thực chiến)`;
    renderScan();
    renderSentiment();
  }

  function scanCard(r) {
    const c = r.coin, s = r.sig, z = s.zone;
    const isLong = s.side === 'LONG';
    const extremeBadge = s.valid
      ? '<span class="ex-flag strong">HỘI TỤ ✓</span>'
      : r.extreme === 2
      ? `<span class="ex-flag">${isLong ? 'QUÁ BÁN MẠNH' : 'QUÁ MUA MẠNH'}</span>`
      : r.extreme === 1
      ? `<span class="ex-flag">${isLong ? 'QUÁ BÁN' : 'QUÁ MUA'}</span>` : '';
    // chấm xác nhận: RSI đảo chiều · gần S&R · Price Action
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
        <div class="sc-metric"><span>24h</span><b class="${c.change>=0?'up':'down'}">${c.change.toFixed(1)}%</b></div>
      </div>
      ${conf}
      <div class="sc-bar"><div class="sc-bar-fill ${isLong?'long':'short'}" style="width:${s.score}%"></div></div>
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

  /* ----------------------------- Sectors ------------------------------- */
  function renderSectors() {
    const bar = $('sectorBar');
    bar.innerHTML = CFG.sectors.map((s) =>
      `<button class="sector-chip ${s.id === activeSector ? 'active' : ''}" data-sec="${s.id}">
        <span class="sec-ico">${s.icon}</span>${s.label}</button>`
    ).join('');
    bar.querySelectorAll('.sector-chip').forEach((b) => b.addEventListener('click', () => {
      activeSector = b.dataset.sec; renderSectors(); renderMovers();
    }));
  }

  /* --------------------- Bảng biến động 24h (movers) ------------------- */
  function volIcon(coin, rankByVol) {
    // icon thể hiện coin có volume giao dịch nhiều (top theo volume)
    if (rankByVol < 3) return '<span class="vico hot" title="Volume rất cao">🔥</span>';
    if (rankByVol < 8) return '<span class="vico high" title="Volume cao">💧</span>';
    if (rankByVol < 15) return '<span class="vico" title="Volume khá">📊</span>';
    return '';
  }

  function renderMovers() {
    const sector = CFG.sectors.find((s) => s.id === activeSector);
    let list = market;
    if (sector && sector.coins) list = market.filter((c) => sector.coins.includes(c.base));

    // xếp hạng volume để gắn icon
    const volRank = {};
    market.slice().sort((a, b) => b.quoteVolume - a.quoteVolume)
      .forEach((c, i) => (volRank[c.base] = i));

    const sortMode = $('moverSort').value; // 'gain' | 'lose' | 'vol'
    let sorted = list.slice();
    if (sortMode === 'gain') sorted.sort((a, b) => b.change - a.change);
    else if (sortMode === 'lose') sorted.sort((a, b) => a.change - b.change);
    else sorted.sort((a, b) => b.quoteVolume - a.quoteVolume);
    sorted = sorted.slice(0, CFG.scan.moversShow);

    const rows = sorted.map((c, i) => {
      const up = c.change >= 0;
      const fund = c.funding != null
        ? `<span class="${c.funding >= 0 ? 'up' : 'down'}">${c.funding >= 0 ? '+' : ''}${c.funding.toFixed(4)}%</span>`
        : '<span class="muted">—</span>';
      return `<tr onclick="location.href='${coinLink(c.base)}'">
        <td class="mv-rank">${i + 1}</td>
        <td class="mv-coin"><img class="mv-logo" alt="" data-logo="${c.base}">
          <span class="mv-sym">${c.base}<small>/USDT</small></span> ${volIcon(c, volRank[c.base])}</td>
        <td class="mv-price">$${fmt(c.price)}</td>
        <td class="mv-chg ${up ? 'up' : 'down'}">${up ? '+' : ''}${c.change.toFixed(2)}%</td>
        <td class="mv-vol">$${shortNum(c.quoteVolume)}</td>
        <td class="mv-fund">${fund}</td>
      </tr>`;
    }).join('');
    $('moversBody').innerHTML = rows || '<tr><td colspan="6" class="muted">Không có coin trong nhóm này.</td></tr>';
    $('moversBody').querySelectorAll('[data-logo]').forEach((img) => API.applyLogo(img, img.dataset.logo));
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
    // trung bình điểm từ kết quả quét (0=SHORT, 100=LONG)
    if (!scanResults.length) return;
    const avg = Math.round(scanResults.reduce((a, r) => a + r.sig.score, 0) / scanResults.length);
    // trộn thêm % coin tăng giá 24h
    const upRatio = market.slice(0, 100).filter((c) => c.change > 0).length;
    const idx = Math.round(avg * 0.6 + (upRatio) * 0.4);
    const val = Math.max(0, Math.min(100, idx));
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
    // ticker
    window.VdearTicker.initTicker('ticker');

    renderSectors();
    $('scanMore').addEventListener('click', () => { scanExpanded = !scanExpanded; renderScan(); });
    $('moverSort').addEventListener('change', renderMovers);

    try {
      market = await API.getMarket();
      renderMovers();
      renderTradFi();
      await runScan();
    } catch (e) {
      $('scanStatus').textContent = 'Không tải được dữ liệu thị trường. Kiểm tra kết nối mạng và thử lại.';
      console.error(e);
    }

    // làm mới định kỳ
    setInterval(async () => {
      try { market = await API.getMarket(true); renderMovers(); renderTradFi(); } catch (e) {}
    }, 30000);
    setInterval(runScan, 5 * 60000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
