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
    const c = await API.klinesMulti(coin || base, tf, CFG.coinKlineLimit || 400);
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
  let combatLev = CFG.money.leverage; // đòn bẩy đang chọn

  async function renderCombat(candles) {
    const box = $('combatPanel');
    const sig = TA.combatSignal(candles);

    if (sig.side === 'NEUTRAL') {
      chart.setPlan(null);
      box.innerHTML = `<div class="panel-head"><h2>⚔️ Chiến lược thực chiến</h2>
        <span class="gauge-side neutral">CHƯA CÓ TÍN HIỆU</span></div>
        <p class="hint">Khung ${currentTf.toUpperCase()} chưa xuất hiện đảo chiều RSI rõ ràng. Chờ giá về vùng quá mua/quá bán rồi quay đầu.</p>
        <p class="hint"><b>Chỉ tham khảo, không phải lời khuyên đầu tư.</b></p>`;
      return;
    }

    const isLong = sig.side === 'LONG';
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

    // Đề xuất đòn bẩy có win-rate cao nhất (chạy lại backtest DCA của bạn trên chart).
    const best = TA.bestLeverage(candles);
    if (best && best.winRate != null) combatLev = best.lev; // ưu tiên win cao khi vào

    // khung layout cố định + vùng động cập nhật theo slider
    box.innerHTML = `
      <div class="panel-head"><h2>⚔️ Chiến lược thực chiến · ${currentTf.toUpperCase()}</h2>
        <span class="gauge-side ${isLong ? 'long' : 'short'}" id="cbVerdict"></span></div>
      <div class="combat-conf">
        <span class="cf-item ${sig.rsiNote ? 'on' : ''}">RSI đảo chiều: <b>${sig.rsiNote || '—'}</b></span>
        <span class="cf-item ${okSR ? 'on' : ''}">Hợp tụ S&amp;R: <b>${srTf}/${CFG.strategy.confirmTfs.length} khung</b></span>
        <span class="cf-item ${okPA ? 'on' : ''}">Price Action: <b>${paTf}/${CFG.strategy.confirmTfs.length} khung</b></span>
        <span class="cf-item ${sig.breakout ? 'on' : ''}">Breakout: <b>${sig.breakout ? 'đã xác nhận ✓' : 'chưa'}</b></span>
        <span class="cf-item ${sig.volume ? 'on' : ''}">Volume giá: <b>${sig.volume ? 'bùng nổ ✓' : 'yếu'}</b></span>
      </div>
      <div class="lev-box">
        <div class="lev-head"><span>Đòn bẩy: <b id="levVal">x${combatLev}</b></span>
          <span class="lev-best" id="levBest"></span></div>
        <input type="range" id="levSlider" min="${CFG.money.minLeverage}" max="${CFG.money.maxLeverage}" value="${combatLev}" step="1">
        <div class="lev-scale"><span>x1</span><span>x25</span><span>x50</span><span>x75</span><span>x100</span></div>
      </div>
      <div class="plan-grid" id="planGrid"></div>
      <p class="hint"><b>Chỉ tham khảo, không phải lời khuyên đầu tư.</b></p>`;

    const slider = $('levSlider');
    const update = () => {
      combatLev = +slider.value;
      $('levVal').textContent = 'x' + combatLev;
      const p = TA.tradePlan(sig.price, sig.side, combatLev);
      chart.setPlan(p); // các mức đổi theo đòn bẩy, vẽ lên chart
      const bt = TA.miniBacktest(candles, combatLev); // win-rate THẬT theo đòn bẩy
      const winTxt = bt.winRate != null ? `${bt.winRate}%` : 'chưa đủ mẫu';
      $('cbVerdict').textContent = `${verdict ? '✓ ' : ''}${sig.side} · Win ${winTxt}`;
      $('cbVerdict').className = 'gauge-side ' + (isLong ? 'long' : 'short');
      if (best && best.winRate != null)
        $('levBest').innerHTML = `Đề xuất <b>x${best.lev}</b> · win cao nhất ${best.winRate}%`;
      $('planGrid').innerHTML = `
        <div class="plan-cell"><span>Vào lệnh (Entry)</span><b>$${fmt(p.entry)}</b></div>
        <div class="plan-cell up"><span>TP chốt lời +100% margin</span><b>$${fmt(p.tp)}</b></div>
        <div class="plan-cell down"><span>SL cắt lỗ −50% margin</span><b>$${fmt(p.sl)}</b></div>`;
    };
    slider.addEventListener('input', update);
    update();
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
      const isSel = r.tf.id === currentTf; // khung đang xem
      return `<button class="tfs-chip ${s.toLowerCase()} ${i === 0 ? 'top' : ''} ${isSel ? 'sel' : ''}" data-tf="${r.tf.id}">
        ${i === 0 ? '⭐ ' : ''}${r.tf.label}
        <b>${s === 'LONG' ? 'LONG' : s === 'SHORT' ? 'SHORT' : '—'}</b>
        <span class="tfs-score">${r.sig.score}</span></button>`;
    }).join('');
    box.querySelectorAll('.tfs-chip').forEach((b) => b.addEventListener('click', () => {
      // phản hồi tức thì: đánh dấu viền xanh chip vừa bấm
      box.querySelectorAll('.tfs-chip').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      selectTf(b.dataset.tf);
    }));
  }


  /* ------------------------------- init -------------------------------- */
  async function init() {
    document.title = base + '/USDT — Vdear';
    chart = new window.VdearChart($('priceCanvas'), $('rsiCanvas'));
    // nút zoom (cho cảm ứng / mobile)
    $('zoomIn').addEventListener('click', () => chart.zoomBy(0.7));
    $('zoomOut').addEventListener('click', () => chart.zoomBy(1.4));
    $('zoomReset').addEventListener('click', () => chart.resetView());
    $('fitAll').addEventListener('click', () => chart.fitAll());
    // Nới khung giá: mỗi lần bấm nhân đôi khoảng giá hiển thị -> nến co lại,
    // nhìn được toàn cảnh thay vì lúc nào cũng bị kéo giãn vừa khít.
    $('priceOut').addEventListener('click', () => chart.zoomPrice(1.6, 0.5));
    $('priceAuto').addEventListener('click', () => chart.autoPrice());
    // Nút AUTO chỉ hiện khi khung giá đang do người dùng đặt.
    chart.onScaleChange = (manual) => { $('priceAuto').hidden = !manual; };
    // Cảm ứng (chụm để zoom, kéo ngang để di chuyển) do chart.js tự lo — để ở
    // đây nữa thì mỗi cú chụm bị nhân đôi hệ số zoom.
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
