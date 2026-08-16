/*
 * Vdear — Coin detail page
 * Chart nến + RSI, chọn khung thời gian, vùng hỗ trợ/kháng cự (sao + LONG/SHORT),
 * thang đo 0-100 LONG/SHORT, giá đa sàn, chú thích quá mua/quá bán.
 */
(function () {
  const CFG = window.VDEAR_CONFIG;
  const API = window.VdearAPI;
  const TA = window.VdearTA;

  const qs = new URLSearchParams(location.search);
  const base = (qs.get('c') || 'BTC').toUpperCase();
  const symbol = base + 'USDT';
  let currentTf = qs.get('tf') || CFG.defaultTimeframe;
  let chart, coin;
  const cacheCandles = {};

  const $ = (id) => document.getElementById(id);
  function fmt(p) {
    if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(3);
    if (p >= 0.01) return p.toFixed(5);
    return p.toPrecision(4);
  }

  async function loadCandles(tf) {
    if (cacheCandles[tf]) return cacheCandles[tf];
    // Thử đa sàn (Binance -> Bybit -> OKX -> Bitget) để chart chạy cho mọi coin.
    const c = await API.klinesMulti(coin || base, tf, CFG.scan.klineLimit);
    cacheCandles[tf] = c;
    return c;
  }

  /* --------------------------- header + prices ------------------------- */
  async function renderHeader() {
    coin = await API.getCoin(base);
    API.applyLogo($('coinLogo'), base);
    $('coinName').textContent = base;
    $('coinPair').textContent = base + '/USDT';
    if (coin) {
      const up = coin.change >= 0;
      $('coinPrice').textContent = '$' + fmt(coin.price);
      $('coinChange').textContent = (up ? '▲ ' : '▼ ') + coin.change.toFixed(2) + '%';
      $('coinChange').className = 'big-chg ' + (up ? 'up' : 'down');
      $('statHigh').textContent = '$' + fmt(coin.high);
      $('statLow').textContent = '$' + fmt(coin.low);
      $('statVol').textContent = '$' + shortNum(coin.quoteVolume);
      const fEl = $('statFunding');
      if (coin.funding != null) {
        const pos = coin.funding >= 0;
        fEl.textContent = (pos ? '+' : '') + coin.funding.toFixed(4) + '%';
        fEl.className = pos ? 'up' : 'down';
      } else { fEl.textContent = '—'; fEl.className = ''; }

      // giá đa sàn
      const ex = coin.exchanges || {};
      const rows = Object.entries(CFG.exchanges).map(([key, meta]) => {
        const p = ex[key];
        return `<div class="ex-chip ${p ? '' : 'off'}">
          <span class="dot" style="background:${meta.color}"></span>
          <span class="ex-name">${meta.label}</span>
          <span class="ex-price">${p ? '$' + fmt(p) : '—'}</span></div>`;
      }).join('');
      $('exchangeRow').innerHTML = rows;
    }
  }

  function shortNum(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toFixed(0);
  }

  /* --------------------------- timeframe tabs -------------------------- */
  function renderTfTabs() {
    const wrap = $('tfTabs');
    wrap.innerHTML = CFG.timeframes.map((t) =>
      `<button class="tf-btn ${t.id === currentTf ? 'active' : ''}" data-tf="${t.id}">${t.label}</button>`
    ).join('');
    wrap.querySelectorAll('.tf-btn').forEach((b) => b.addEventListener('click', () => selectTf(b.dataset.tf)));
  }

  async function selectTf(tf) {
    currentTf = tf;
    renderTfTabs();
    const candles = await loadCandles(tf);
    const sr = TA.supportResistance(candles, candles[candles.length - 1].close);
    chart.setData(candles);
    chart.setZones(sr);
    chart.setHighlight(null);
    renderSignal(candles);
    renderSR(sr, tf);
    renderTfScores();
    renderCombat(candles);
  }

  /* -------------------- Chiến lược thực chiến (confluence) -------------- */
  async function renderCombat(candles) {
    const box = $('combatPanel');
    const sig = TA.combatSignal(candles);
    // vẽ kế hoạch lên chart
    chart.setPlan(sig.plan);

    if (sig.side === 'NEUTRAL' || !sig.plan) {
      box.innerHTML = `<div class="panel-head"><h2>⚔️ Chiến lược thực chiến</h2>
        <span class="gauge-side neutral">CHƯA CÓ TÍN HIỆU</span></div>
        <p class="hint">Khung ${currentTf.toUpperCase()} chưa xuất hiện đảo chiều RSI rõ ràng. Chờ giá về vùng quá mua/quá bán rồi quay đầu.</p>`;
      return;
    }

    const isLong = sig.side === 'LONG';
    const p = sig.plan;
    // Xác nhận hội tụ đa khung: kiểm S&R + PA trên các khung confirm
    let srTf = 0, paTf = 0;
    for (const t of CFG.strategy.confirmTfs) {
      try {
        const cs = await loadCandles(t);
        const price = cs[cs.length - 1].close;
        if (TA.nearLevel(price, TA.swingLevels(cs))) srTf++;
        if (TA.priceAction(cs, cs.length - 1) === (isLong ? 'bullish' : 'bearish')) paTf++;
      } catch (e) { /* skip */ }
    }
    const okSR = srTf >= CFG.strategy.minSRMatch;
    const okPA = paTf >= CFG.strategy.minPAMatch;
    const verdict = sig.valid && okSR && okPA;

    // Phí funding ước tính (nếu có dữ liệu từ market)
    let fundingHtml = '';
    if (coin && coin.funding != null) {
      const cost = TA.fundingCost(coin.funding, sig.side, p.leverage, CFG.money.assumedHoldDays);
      const pay = cost > 0;
      const rateTxt = (coin.funding >= 0 ? '+' : '') + coin.funding.toFixed(4) + '%/8h';
      fundingHtml = `<span class="cf-item on">Funding: <b class="${coin.funding>=0?'up':'down'}">${rateTxt}</b>
        · ${pay ? 'PHẢI TRẢ' : 'ĐƯỢC NHẬN'} <b>~${Math.abs(cost).toFixed(2)}%</b> vốn/${CFG.money.assumedHoldDays} ngày (x${p.leverage})</span>`;
    }

    box.innerHTML = `
      <div class="panel-head"><h2>⚔️ Chiến lược thực chiến · ${currentTf.toUpperCase()}</h2>
        <span class="gauge-side ${isLong ? 'long' : 'short'}">${verdict ? '✓ ' : ''}${sig.side} · Win ~${sig.winRate}%</span></div>
      <div class="combat-conf">
        <span class="cf-item ${sig.rsiNote ? 'on' : ''}">RSI đảo chiều: <b>${sig.rsiNote || '—'}</b></span>
        <span class="cf-item ${okSR ? 'on' : ''}">Hợp tụ S&amp;R: <b>${srTf}/${CFG.strategy.confirmTfs.length} khung</b></span>
        <span class="cf-item ${okPA ? 'on' : ''}">Price Action: <b>${paTf}/${CFG.strategy.confirmTfs.length} khung</b></span>
        ${fundingHtml}
      </div>
      <div class="plan-grid">
        <div class="plan-cell"><span>Vào lệnh (Entry)</span><b>$${fmt(p.entry)}</b></div>
        <div class="plan-cell up"><span>TP gốc +100% margin</span><b>$${fmt(p.tp0)}</b></div>
        <div class="plan-cell gold"><span>DCA khi −50% margin</span><b>$${fmt(p.dca)}</b></div>
        <div class="plan-cell"><span>Giá TB sau DCA</span><b>$${fmt(p.avgAfterDca)}</b></div>
        <div class="plan-cell up"><span>TP sau DCA</span><b>$${fmt(p.tpAfterDca)}</b></div>
        <div class="plan-cell down"><span>SL sau DCA</span><b>$${fmt(p.slAfterDca)}</b></div>
      </div>
      <p class="hint">Đòn bẩy x${p.leverage} · TRƯỚC DCA không có SL (chỉ thắng +100% hoặc chạm ngưỡng DCA). Rủi ro thật nằm ở SAU DCA. Các mức trên đã vẽ lên chart. <b>Chỉ tham khảo, không phải lời khuyên đầu tư.</b></p>`;
  }

  /* ----------------------- signal + gauge + RSI note ------------------- */
  function renderSignal(candles) {
    const sig = TA.signalScore(candles);
    // Thang đo 0-100
    const gauge = $('gaugeFill');
    gauge.style.width = sig.score + '%';
    gauge.className = 'gauge-fill ' + (sig.side === 'LONG' ? 'long' : sig.side === 'SHORT' ? 'short' : 'neutral');
    $('gaugeValue').textContent = sig.score + '/100';
    $('gaugeSide').textContent = sig.side === 'LONG' ? 'NÊN LONG' : sig.side === 'SHORT' ? 'NÊN SHORT' : 'TRUNG TÍNH';
    $('gaugeSide').className = 'gauge-side ' + sig.side.toLowerCase();
    $('gaugeWin').textContent = 'Ước tính win-rate ' + sig.winRate + '%';

    // RSI note (nhấn mạnh)
    const z = sig.zone;
    const noteEl = $('rsiNote');
    noteEl.className = 'rsi-note ' + (z.side === 'LONG' ? 'long' : z.side === 'SHORT' ? 'short' : 'neutral');
    const cta = z.side === 'SHORT' ? '→ Đang QUÁ MUA nên cân nhắc <b>SHORT</b>'
      : z.side === 'LONG' ? '→ Đang QUÁ BÁN nên cân nhắc <b>LONG</b>' : '';
    noteEl.innerHTML = `<span class="rsi-badge" style="background:${z.color}">RSI ${sig.rsi.toFixed(1)} · ${z.label}</span>
      <span class="rsi-text">${z.note} ${cta}</span>`;
  }

  /* --------------------------- S/R list -------------------------------- */
  function stars(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }

  function renderSR(sr, tf) {
    const box = $('srList');
    const mk = (z) => {
      const dir = z.side;
      return `<div class="sr-row ${z.kind}" data-price="${z.price}" data-low="${z.low}" data-high="${z.high}" data-side="${dir}">
        <span class="sr-tag ${dir === 'LONG' ? 'long' : 'short'}">${dir}</span>
        <span class="sr-kind">${z.kind === 'support' ? 'Hỗ trợ' : 'Kháng cự'}</span>
        <span class="sr-price">$${fmt(z.price)}</span>
        <span class="sr-band">$${fmt(z.low)} – $${fmt(z.high)}</span>
        <span class="sr-dist">${z.distancePct.toFixed(2)}%</span>
        <span class="sr-stars" title="Độ an toàn vào lệnh">${stars(z.stars)}</span>
      </div>`;
    };
    const res = (sr.resistances || []).slice().reverse().map(mk).join('');
    const sup = (sr.supports || []).map(mk).join('');
    box.innerHTML =
      `<div class="sr-head"><span>Loại</span><span>Vùng</span><span>Giá</span><span>Vùng đảo chiều mạnh</span><span>K.cách</span><span>An toàn</span></div>` +
      res +
      `<div class="sr-current">◈ Giá hiện tại: <b>$${fmt(coin ? coin.price : cacheCandles[tf][cacheCandles[tf].length-1].close)}</b></div>` +
      sup;

    // click vào 1 vùng → highlight lên chart
    box.querySelectorAll('.sr-row').forEach((row) => {
      row.addEventListener('click', () => {
        box.querySelectorAll('.sr-row').forEach((r) => r.classList.remove('sel'));
        row.classList.add('sel');
        chart.setHighlight({
          price: +row.dataset.price, low: +row.dataset.low, high: +row.dataset.high,
        });
        document.querySelector('.chart-wrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }

  /* -------- điểm các khung (ưu tiên khung rate cao khả năng đảo chiều) -- */
  async function renderTfScores() {
    const box = $('tfScores');
    box.innerHTML = '<div class="muted small">Đang quét các khung thời gian…</div>';
    const results = [];
    for (const t of CFG.timeframes) {
      try {
        const candles = await loadCandles(t.id);
        const sig = TA.signalScore(candles);
        const rev = Math.abs(sig.score - 50) / 50; // độ lệch → khả năng đảo chiều
        results.push({ tf: t, sig, rate: rev * t.weight });
      } catch (e) { /* skip */ }
    }
    results.sort((a, b) => b.rate - a.rate);
    box.innerHTML = results.map((r, i) => {
      const s = r.sig.side;
      return `<button class="tfs-chip ${s.toLowerCase()} ${i === 0 ? 'top' : ''}" data-tf="${r.tf.id}">
        ${i === 0 ? '⭐ ' : ''}${r.tf.label}
        <b>${s === 'LONG' ? 'LONG' : s === 'SHORT' ? 'SHORT' : '—'}</b>
        <span class="tfs-score">${r.sig.score}</span></button>`;
    }).join('');
    box.querySelectorAll('.tfs-chip').forEach((b) => b.addEventListener('click', () => selectTf(b.dataset.tf)));
  }

  /* ------------------------------- init -------------------------------- */
  async function init() {
    document.title = base + '/USDT — Vdear';
    chart = new window.VdearChart($('priceCanvas'), $('rsiCanvas'));
    // nút zoom (cho cảm ứng / mobile)
    $('zoomIn').addEventListener('click', () => chart.zoomBy(0.7));
    $('zoomOut').addEventListener('click', () => chart.zoomBy(1.4));
    $('zoomReset').addEventListener('click', () => chart.resetView());
    // pinch-zoom cảm ứng
    let pinch = null;
    const pc = $('priceCanvas');
    pc.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }, { passive: true });
    pc.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && pinch) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        chart.zoomBy(pinch / d); pinch = d;
      }
    }, { passive: true });
    pc.addEventListener('touchend', () => { pinch = null; });
    renderTfTabs();
    try {
      await renderHeader();
      await selectTf(currentTf);
    } catch (e) {
      $('chartError').style.display = 'block';
      $('chartError').textContent = 'Không tải được dữ liệu chart cho ' + base + '. Thử lại sau.';
      console.error(e);
    }
    // ticker top
    window.VdearTicker.initTicker('ticker');
    // cập nhật header định kỳ
    setInterval(renderHeader, 20000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
