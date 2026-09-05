/*
 * Vdear — Coin detail page
 * Chart nến + RSI, chọn khung thời gian, vùng hỗ trợ/kháng cự (sao + LONG/SHORT),
 * thang đo 0-100 LONG/SHORT, giá đa sàn, chú thích quá mua/quá bán.
 */
(function () {
  // Chữ hiển thị lấy qua i18n. t() tự rơi về tiếng Việt khi thiếu bản dịch;
  // i18n.js được nạp trước mọi module nên nhánh dự phòng dưới đây gần như
  // không bao giờ chạy, để đó cho chắc.
  const T = (k, v) => (window.VdearI18n ? window.VdearI18n.t(k, v) : k);

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
      `<button class="tf-btn ${t.id === currentTf ? 'active' : ''}" data-tf="${t.id}">${t.k ? T(t.k) : t.label}</button>`
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
    loadOI(tf, candles);
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
      box.innerHTML = `<div class="panel-head"><h2>${T('coin.combat.title')}</h2>
        <span class="gauge-side neutral">${T('coin.combat.noSignal')}</span></div>
        <p class="hint">${T('coin.combat.noSignalWhy', { tf: currentTf.toUpperCase() })}</p>
        <p class="hint"><b>${T('coin.refOnly')}</b></p>`;
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
      <div class="panel-head"><h2>${T('coin.combat.titleTf', { tf: currentTf.toUpperCase() })}</h2>
        <span class="gauge-side ${isLong ? 'long' : 'short'}" id="cbVerdict"></span></div>
      <div class="combat-conf">
        <span class="cf-item ${sig.rsiNote ? 'on' : ''}">${T('coin.cf.rsi')}: <b>${sig.rsiNote || '—'}</b></span>
        <span class="cf-item ${okSR ? 'on' : ''}">${T('coin.cf.sr')}: <b>${T('coin.cf.nTf', { n: srTf, total: CFG.strategy.confirmTfs.length })}</b></span>
        <span class="cf-item ${okPA ? 'on' : ''}">${T('coin.cf.pa')}: <b>${T('coin.cf.nTf', { n: paTf, total: CFG.strategy.confirmTfs.length })}</b></span>
        <span class="cf-item ${sig.breakout ? 'on' : ''}">${T('coin.cf.breakout')}: <b>${T(sig.breakout ? 'coin.cf.confirmed' : 'coin.cf.notYet')}</b></span>
        <span class="cf-item ${sig.volume ? 'on' : ''}">${T('coin.cf.volume')}: <b>${T(sig.volume ? 'coin.cf.surge' : 'coin.cf.weak')}</b></span>
      </div>
      <div class="lev-box">
        <div class="lev-head"><span>${T('coin.lev')}: <b id="levVal">x${combatLev}</b></span>
          <span class="lev-best" id="levBest"></span></div>
        <input type="range" id="levSlider" min="${CFG.money.minLeverage}" max="${CFG.money.maxLeverage}" value="${combatLev}" step="1">
        <div class="lev-scale"><span>x1</span><span>x25</span><span>x50</span><span>x75</span><span>x100</span></div>
      </div>
      <div class="plan-grid" id="planGrid"></div>
      <p class="hint"><b>${T('coin.refOnly')}</b></p>`;

    const slider = $('levSlider');
    const update = () => {
      combatLev = +slider.value;
      $('levVal').textContent = 'x' + combatLev;
      const p = TA.tradePlan(sig.price, sig.side, combatLev);
      chart.setPlan(p); // các mức đổi theo đòn bẩy, vẽ lên chart
      const bt = TA.miniBacktest(candles, combatLev); // win-rate THẬT theo đòn bẩy
      const winTxt = bt.winRate != null ? `${bt.winRate}%` : T('coin.notEnoughSamples');
      $('cbVerdict').textContent = `${verdict ? '✓ ' : ''}${sig.side} · Win ${winTxt}`;
      $('cbVerdict').className = 'gauge-side ' + (isLong ? 'long' : 'short');
      if (best && best.winRate != null)
        $('levBest').innerHTML = T('coin.levBest', { lev: best.lev, win: best.winRate });
      $('planGrid').innerHTML = `
        <div class="plan-cell"><span>${T('coin.plan.entry')}</span><b>$${fmt(p.entry)}</b></div>
        <div class="plan-cell up"><span>${T('coin.plan.tp')}</span><b>$${fmt(p.tp)}</b></div>
        <div class="plan-cell down"><span>${T('coin.plan.sl')}</span><b>$${fmt(p.sl)}</b></div>`;
    };
    slider.addEventListener('input', update);
    update();
  }

  /* --------------------------- Open Interest ---------------------------- */

  /*
   * Nạp OI ở NỀN, không chặn luồng vẽ chính: nguồn OI là một request riêng và
   * một lần chậm không được phép giữ cả trang lại. Đổi khung giữa chừng thì bỏ
   * kết quả cũ — nếu không, kết quả của khung trước về sau sẽ ghi đè lên khung
   * đang xem.
   */
  let oiSeq = 0;
  async function loadOI(tf, candles) {
    const OI = window.VdearOI;
    if (!OI || !chart) return;
    const my = ++oiSeq;
    chart.setOI(null);                       // xoá ngay dữ liệu của khung trước
    let series = null;
    try { series = await OI.hist(base, tf, 200); } catch (e) { series = null; }
    if (my !== oiSeq) return;
    chart.setOI(series);
  }

  /* ----------------------- signal + gauge + RSI note ------------------- */
  function renderSignal(candles) {
    const sig = TA.signalScore(candles);
    // Thang đo 0-100
    const gauge = $('gaugeFill');
    gauge.style.width = sig.score + '%';
    gauge.className = 'gauge-fill ' + (sig.side === 'LONG' ? 'long' : sig.side === 'SHORT' ? 'short' : 'neutral');
    $('gaugeValue').textContent = sig.score + '/100';
    $('gaugeSide').textContent = T(sig.side === 'LONG' ? 'coin.goLong' : sig.side === 'SHORT' ? 'coin.goShort' : 'coin.goNeutral');
    $('gaugeSide').className = 'gauge-side ' + sig.side.toLowerCase();
    $('gaugeWin').textContent = T('coin.winEstimate', { n: sig.winRate });

    // RSI note (nhấn mạnh)
    const z = sig.zone;
    const noteEl = $('rsiNote');
    noteEl.className = 'rsi-note ' + (z.side === 'LONG' ? 'long' : z.side === 'SHORT' ? 'short' : 'neutral');
    const cta = z.side === 'SHORT' ? T('coin.cta.short')
      : z.side === 'LONG' ? T('coin.cta.long') : '';
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
        <span class="sr-kind">${T(z.kind === 'support' ? 'coin.sr.support' : 'coin.sr.resistance')}</span>
        <span class="sr-price">$${fmt(z.price)}</span>
        <span class="sr-band">$${fmt(z.low)} – $${fmt(z.high)}</span>
        <span class="sr-dist">${z.distancePct.toFixed(2)}%</span>
        <span class="sr-stars" title="${T('coin.sr.safety')}">${stars(z.stars)}</span>
      </div>`;
    };
    const res = (sr.resistances || []).slice().reverse().map(mk).join('');
    const sup = (sr.supports || []).map(mk).join('');
    box.innerHTML =
      `<div class="sr-head"><span>${T('coin.sr.th.kind')}</span><span>${T('coin.sr.th.zone')}</span><span>${T('coin.sr.th.price')}</span><span>${T('coin.sr.th.band')}</span><span>${T('coin.sr.th.dist')}</span><span>${T('coin.sr.th.safe')}</span></div>` +
      res +
      `<div class="sr-current">${T('coin.sr.current')}: <b>$${fmt(coin ? coin.price : cacheCandles[tf][cacheCandles[tf].length-1].close)}</b></div>` +
      sup;

    // Bấm vào một vùng -> chart CHỈ hiện vùng đó. Bấm lại vùng đang chọn (hoặc
    // nút "Hiện tất cả") thì quay về hiện đủ — không để người dùng kẹt ở một
    // vùng mà không biết đường ra.
    //
    // Gắn thẳng object vùng vào từng dòng thay vì đọc lại số từ data-*: chart
    // so sánh bằng chính object đó nên không phụ thuộc vào việc số thực có
    // đi qua chuỗi mà còn nguyên hay không. Thứ tự DOM = kháng cự đảo ngược
    // rồi tới hỗ trợ, đúng thứ tự đã dựng ở trên.
    const order = (sr.resistances || []).slice().reverse().concat(sr.supports || []);
    const rows = box.querySelectorAll('.sr-row');
    const showAll = $('srShowAll');

    function focus(zone, row) {
      rows.forEach((r) => r.classList.toggle('sel', r === row));
      chart.setHighlight(zone);
      if (showAll) showAll.hidden = !zone;
    }
    if (showAll) {
      showAll.hidden = true;
      showAll.onclick = () => focus(null, null);
    }

    rows.forEach((row, i) => {
      const zone = order[i];
      row.title = T('coin.sr.rowTitle');
      row.addEventListener('click', () => {
        const dangChon = row.classList.contains('sel');
        focus(dangChon ? null : zone, dangChon ? null : row);
        if (!dangChon) document.querySelector('.chart-wrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }

  /* -------- điểm các khung (ưu tiên khung rate cao khả năng đảo chiều) -- */
  async function renderTfScores() {
    const box = $('tfScores');
    box.innerHTML = `<div class="muted small">${T('coin.tf.scanning')}</div>`;
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
        ${i === 0 ? '⭐ ' : ''}${r.tf.k ? T(r.tf.k) : r.tf.label}
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
  /* ----------------------- Tải lại khung xem chart --------------------- */
  /*
   * Cụm nút zoom nổi trên biểu đồ đã bỏ. Thay bằng:
   *  - máy để bàn: bấm chuột phải trong biểu đồ -> menu riêng, hoặc Alt + R;
   *  - máy cảm ứng: nút ↺ cạnh tiêu đề (CSS chỉ hiện ở màn hẹp / trỏ thô),
   *    vì màn cảm ứng không có chuột phải.
   * Phóng to / thu nhỏ / trượt vẫn dùng lăn chuột, kéo và chụm hai ngón như cũ.
   */
  function wireChartMenu() {
    const wrap = document.querySelector('.chart-wrap');
    const menu = $('chartMenu');
    const btn = $('chartReset');
    if (!wrap || !menu) return;

    const ACT = {
      reset: () => chart.resetView(),
      fit: () => chart.fitAll(),
      autoPrice: () => chart.autoPrice(),
    };

    function close() {
      if (menu.hidden) return;
      menu.hidden = true;
      document.removeEventListener('pointerdown', onAway, true);
    }
    function onAway(e) { if (!menu.contains(e.target)) close(); }

    function open(x, y) {
      menu.hidden = false;
      // Đặt trong lòng .chart-wrap, kẹp lại để menu không thò ra ngoài khung.
      const w = wrap.getBoundingClientRect(), m = menu.getBoundingClientRect();
      const left = Math.max(4, Math.min(x, w.width - m.width - 4));
      const top = Math.max(4, Math.min(y, w.height - m.height - 4));
      menu.style.left = left + 'px';
      menu.style.top = top + 'px';
      document.addEventListener('pointerdown', onAway, true);
    }

    wrap.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const r = wrap.getBoundingClientRect();
      open(e.clientX - r.left, e.clientY - r.top);
    });
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const fn = ACT[b.dataset.act];
      if (fn) fn();
      close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { close(); return; }
      // Alt+R: phím tắt ghi ngay trong menu. Bỏ qua khi đang gõ vào ô nhập.
      if (e.altKey && (e.key === 'r' || e.key === 'R')) {
        if (e.target && e.target.closest && e.target.closest('input, textarea, [contenteditable]')) return;
        e.preventDefault();
        chart.resetView();
        close();
      }
    });
    window.addEventListener('scroll', close, { passive: true });
    if (btn) btn.addEventListener('click', () => { chart.resetView(); close(); });
  }

  async function init() {
    document.title = base + '/USDT — Vdear';
    chart = new window.VdearChart($('priceCanvas'), $('rsiCanvas'), $('oiCanvas'));
    wireChartMenu();
    // Cảm ứng (chụm để zoom, kéo ngang để di chuyển) do chart.js tự lo — để ở
    // đây nữa thì mỗi cú chụm bị nhân đôi hệ số zoom.
    renderTfTabs();
    try {
      await renderHeader();
      await selectTf(currentTf);
    } catch (e) {
      $('chartError').style.display = 'block';
      // Giữ KHOÁ chứ không giữ câu: trang có thể đứng ở thông báo lỗi này rất
      // lâu, đổi ngôn ngữ phải dịch lại được đúng câu đang hiện.
      // KHÔNG dùng data-i18n ở đây: apply() của i18n sẽ gọi t() mà không có
      // biến, và câu tiếng Anh sẽ hiện nguyên chữ "{base}" ra màn hình.
      $('chartError').dataset.errKey = 'coin.chartFailed';
      $('chartError').dataset.errVars = JSON.stringify({ base: base });
      $('chartError').textContent = T('coin.chartFailed', { base: base });
      console.error(e);
    }
    // Đổi ngôn ngữ: vẽ lại mọi phần sinh từ dữ liệu bằng ĐÚNG nến đang có trong
    // cache, không gọi lại sàn — đổi chữ mà bắn lại request là tiêu rate limit
    // của người dùng cho không.
    window.addEventListener('vdear:langchange', () => {
      // Dải khung thời gian luôn hiện, kể cả khi chart lỗi -> dịch trước.
      try { renderTfTabs(); } catch (e) { /* bỏ qua */ }
      const err = $('chartError');
      if (err && err.dataset.errKey) {
        err.textContent = T(err.dataset.errKey, JSON.parse(err.dataset.errVars || '{}'));
      }
      // Trang đang ở trạng thái lỗi thì CHỈ dịch lại câu lỗi. Nến có thể đã nằm
      // sẵn trong cache dù lượt vẽ đầu đã bỏ dở giữa chừng; vẽ tiếp ở đây thì
      // đổi ngôn ngữ lại làm hiện ra những panel mà trang vốn không hiện —
      // đổi ngôn ngữ chỉ được đổi CHỮ, không được đổi thứ đang hiển thị.
      if (err && getComputedStyle(err).display !== 'none') return;
      const c = cacheCandles[currentTf];
      if (!c) return;
      try {
        chart.render();            // khung OI có chữ, phải vẽ lại
        renderSignal(c);
        renderCombat(c);
        renderSR(TA.supportResistance(c, c[c.length - 1].close), currentTf);
        renderTfScores();
      } catch (e) { /* đổi ngôn ngữ không được phép làm vỡ trang */ }
    });

    // ticker top
    window.VdearTicker.initTicker('ticker');
    // cập nhật header định kỳ
    setInterval(renderHeader, 20000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
