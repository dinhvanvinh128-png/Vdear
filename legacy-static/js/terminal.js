/*
 * Vdearypto Terminal — bố cục dày, một màn hình nhìn hết.
 *
 * Bản thiết kế gốc (xuất từ Claude design) là một MÔ HÌNH TĨNH: mọi con số
 * trong đó đều gõ tay — giá BTC 108420, thanh lý $284.6M, cá voi "Binance →
 * Unknown wallet $48.2M", tương quan tính bằng Math.random(). File này dựng
 * lại đúng bố cục và ngôn ngữ thị giác đó, nhưng CHỈ CHẠY BẰNG SỐ THẬT.
 *
 * Ô nào không có nguồn thì nói thẳng là chưa có nguồn. Không ô nào ở đây sinh
 * ra số liệu thị trường.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const API = window.VdearAPI, TA = window.VdearTA;

  const UP = 'up', DOWN = 'down';
  const cls = (v) => (v == null ? '' : v > 0 ? UP : v < 0 ? DOWN : '');
  const pct = (v, d) => (v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(d == null ? 2 : d) + '%');

  function usd(n, dp) {
    if (n == null || !Number.isFinite(n)) return '—';
    const a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a >= 1e12) return s + '$' + (a / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return s + '$' + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return s + '$' + (a / 1e3).toFixed(1) + 'K';
    return s + '$' + a.toFixed(dp == null ? 2 : dp);
  }
  const price = (p) => (p == null ? '—' : '$' + p.toLocaleString('en-US',
    { minimumFractionDigits: p < 1 ? 6 : 2, maximumFractionDigits: p < 1 ? 6 : 2 }));

  /*
   * Toán tương quan và quả cầu nằm ở js/correlation.js — DÙNG CHUNG với trang
   * chủ. Giữ hai bản chép đôi thì sớm muộn lệch nhau, và lúc đó không ai biết
   * con số nào mới đúng.
   */
  const Corr = window.VdearCorr;

  /* ---------------------------------------------------------------- */

  function tickerStrip(g, coins) {
    const btc = coins.find((c) => c.base === 'BTC');
    const eth = coins.find((c) => c.base === 'ETH');
    const vol = coins.reduce((s, c) => s + (c.quoteVolume || 0), 0);
    const items = [
      btc && { k: 'BTC', v: price(btc.price), d: pct(btc.change), c: cls(btc.change) },
      eth && { k: 'ETH', v: price(eth.price), d: pct(eth.change), c: cls(eth.change) },
      g && g.marketCap != null && { k: 'VỐN HOÁ', v: usd(g.marketCap), d: pct(g.change24h), c: cls(g.change24h) },
      g && g.btcDominance != null && { k: 'BTC.D', v: g.btcDominance.toFixed(2) + '%', d: '', c: '' },
      { k: 'KL 24H · 4 SÀN', v: usd(vol), d: '', c: '' },
      { k: 'COIN', v: String(coins.length), d: '', c: '' },
    ].filter(Boolean);
    return items.map((i) => `<span class="tm-tick"><span class="tm-tick-k">${i.k}</span>
      <span class="tm-tick-v">${i.v}</span>${i.d ? `<span class="${i.c}">${i.d}</span>` : ''}</span>`).join('');
  }

  const SIG = { 'STRONG LONG': 'sl', LONG: 'l', NEUTRAL: 'n', SHORT: 's', 'STRONG SHORT': 'ss' };
  function sigOf(rsi, chg) {
    if (rsi == null) return 'NEUTRAL';
    if (rsi >= 68 && chg > 0) return 'STRONG LONG';
    if (rsi >= 56) return 'LONG';
    if (rsi <= 32 && chg < 0) return 'STRONG SHORT';
    if (rsi <= 44) return 'SHORT';
    return 'NEUTRAL';
  }

  function signalsPanel(coins) {
    const withRsi = coins.filter((c) => c.rsi != null);
    if (!withRsi.length) {
      return `<p class="tm-empty">Chưa tính được RSI — cần nến ngày từ sàn. Không có dữ liệu thì để trống.</p>`;
    }
    const ranked = withRsi.slice().sort((a, b) =>
      Math.abs(b.rsi - 50) - Math.abs(a.rsi - 50)).slice(0, 7);
    return ranked.map((c) => {
      const s = sigOf(c.rsi, c.change);
      return `<a class="tm-sig" href="coin.html?c=${encodeURIComponent(c.base)}">
        <span class="tm-sig-sym">${c.base}</span>
        <span><span class="tm-badge ${SIG[s]}">${s}</span></span>
        <span class="tm-sig-rsi">RSI ${Math.round(c.rsi)}</span>
        <span class="${cls(c.change)} tm-sig-chg">${pct(c.change)}</span></a>`;
    }).join('');
  }

  function fundingPanel(coins) {
    const f = coins.filter((c) => c.funding != null && c.funding !== 0);
    if (!f.length) return `<p class="tm-empty">Sàn chưa trả về funding cho lần gọi này.</p>`;
    const top = f.slice().sort((a, b) => Math.abs(b.funding) - Math.abs(a.funding)).slice(0, 7);
    const max = Math.abs(top[0].funding) || 1;
    return top.map((c) => {
      const w = (Math.abs(c.funding) / max) * 100;
      const neg = c.funding < 0;
      return `<div class="tm-fund">
        <span class="tm-fund-sym">${c.base}</span>
        <span class="tm-fund-l">${neg ? `<i class="up" style="width:${w.toFixed(1)}%"></i>` : ''}</span>
        <span class="tm-fund-r">${neg ? '' : `<i class="down" style="width:${w.toFixed(1)}%"></i>`}</span>
        <span class="${neg ? 'up' : 'down'} tm-fund-v">${pct(c.funding * 100, 4)}</span>
      </div>`;
    }).join('');
  }

  function radarRows(coins) {
    return coins.slice(0, 12).map((c) => {
      const s = sigOf(c.rsi, c.change);
      const info = c.cg || {};
      const d7 = info.ch ? info.ch['7d'] : null;
      return `<a class="tm-row" href="coin.html?c=${encodeURIComponent(c.base)}">
        <span class="tm-row-sym">${c.base}</span>
        <span><span class="tm-badge ${SIG[s]}">${s}</span></span>
        <span class="tm-r">${price(c.price)}</span>
        <span class="tm-r ${cls(c.change)}">${pct(c.change)}</span>
        <span class="tm-r tm-c7 ${cls(d7)}">${d7 == null ? '—' : pct(d7)}</span>
        <span class="tm-r tm-cf ${c.funding == null ? '' : c.funding >= 0 ? DOWN : UP}">${c.funding == null ? '—' : pct(c.funding * 100, 4)}</span>
        <span class="tm-r">${c.rsi == null ? '—' : Math.round(c.rsi)}</span>
        <span class="tm-r tm-cv">${usd(c.quoteVolume)}</span></a>`;
    }).join('');
  }

  /*
   * Thanh lý và cá voi: bản thiết kế gốc bịa cả hai (thanh lý $284.6M, cá voi
   * "Binance → Unknown wallet $48.2M · 2 phút"). Không nguồn miễn phí nào công
   * bố hai thứ này. Nói thẳng là chưa có nguồn, không dựng số giả cho đẹp ô.
   */
  function noSource(what, why) {
    return `<div class="tm-nosrc"><b>Chưa có nguồn</b><span>${what}</span><span class="tm-nosrc-w">${why}</span></div>`;
  }

  async function etfPanel() {
    let flow = null;
    try {
      const res = await fetch('/api/etf-flow');
      if (res.ok) { const j = await res.json(); if (j && j.configured) flow = j; }
    } catch (e) { /* để trống */ }
    if (!flow) return noSource('Dòng tiền ETF giao ngay',
      'Cần SOSOVALUE_API_KEY ở biến môi trường phía server.');
    const list = Object.keys(flow.assets || {});
    if (!list.length) return noSource('Dòng tiền ETF giao ngay',
      (flow.errors || []).slice(0, 2).join(' · ') || 'Nguồn chưa trả về tài sản nào.');
    const total = list.reduce((s, k) => s + (flow.assets[k].netInflow || 0), 0);
    const max = Math.max.apply(null, list.map((k) => Math.abs(flow.assets[k].netInflow || 0)).concat([1]));
    return `<div class="tm-etf-total ${cls(total)}">${(total > 0 ? '+' : '') + usd(total)}</div>
      <div class="tm-etf-sub">RÒNG · NGÀY ${flow.date || '—'}</div>
      <div class="tm-etf-list">${list.map((k) => {
        const a = flow.assets[k], v = a.netInflow;
        const w = (Math.abs(v) / max) * 100;
        return `<div class="tm-etf-row">
          <div class="tm-etf-h"><span>${k}</span><span class="${cls(v)}">${(v > 0 ? '+' : '') + usd(v)}</span></div>
          <div class="tm-etf-bar"><i class="${cls(v) || 'flat'}" style="width:${w.toFixed(1)}%"></i></div>
          <div class="tm-etf-f"><span>×${a.fundCount || '—'} quỹ</span><span>TS RÒNG ${usd(a.totalNetAssets)}</span></div>
        </div>`;
      }).join('')}</div>`;
  }

  /* ---------------------------------------------------------------- */

  async function init() {
    const market = await API.getMarket();
    await API.loadCoinGecko().catch(() => null);
    const coins = market.slice();
    coins.forEach((c) => {
      c.cg = API.cgInfo(c.base) || null;
      c.marketCap = c.cg ? c.cg.marketCap : null;
    });
    // Vốn hoá lớn nhất trước; thiếu vốn hoá thì xếp theo khối lượng thật.
    coins.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0)
      || (b.quoteVolume || 0) - (a.quoteVolume || 0));

    const g = await API.getGlobal().catch(() => null);
    $('tmTicker').innerHTML = tickerStrip(g, coins);
    $('tmRadar').innerHTML = radarRows(coins);
    $('tmFunding').innerHTML = fundingPanel(coins);
    $('tmLiq').innerHTML = noSource('Thanh lý 24h theo sàn',
      'Số thanh lý chỉ nhà cung cấp có API trả phí công bố (CoinGlass gói Professional trở lên).');
    $('tmWhale').innerHTML = noSource('Giao dịch cá voi > $5M',
      'Cần nguồn on-chain có API key (Arkham, Whale Alert). Chưa cấu hình.');
    etfPanel().then((h) => { $('tmEtf').innerHTML = h; });

    /*
     * Nến ngày cho 24 coin lớn nhất: một lượt lấy, dùng chung cho cả RSI lẫn
     * ma trận tương quan. Tách làm hai lượt là gấp đôi lời gọi cho cùng dữ liệu.
     */
    const res = await Corr.compute(coins, { limit: 24, days: 60 });
    $('tmSignals').innerHTML = signalsPanel(coins);
    $('tmRadar').innerHTML = radarRows(coins);

    if (!res.assets.length) {
      $('tmSphereNote').textContent = 'Không đủ dữ liệu nến để tính tương quan.';
      return;
    }
    $('tmSphereCount').textContent = res.assets.length + ' TÀI SẢN';
    $('tmSphereRho').textContent = res.meanAbs == null ? '—' : res.meanAbs.toFixed(2);
    $('tmSphereNote').textContent = '';
    Corr.render($('tmSphere'), $('tmTip'), res.assets, res.edges, (c) => `
      <div class="tm-tip-h"><b>${c.base}</b><span class="${cls(c.change)}">${pct(c.change)}</span></div>
      <div class="tm-tip-p">${price(c.price)}</div>
      <dl class="tm-tip-d">
        <dt>VỐN HOÁ</dt><dd>${usd(c.marketCap)}</dd>
        <dt>KHỐI LƯỢNG 24H</dt><dd>${usd(c.quoteVolume)}</dd>
        <dt>RSI 14 · NGÀY</dt><dd>${c.rsi == null ? '—' : Math.round(c.rsi)}</dd>
        <dt>ρ VỚI BTC</dt><dd>${c.rhoBtc == null ? '—' : c.rhoBtc.toFixed(2)}</dd>
      </dl>`);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
