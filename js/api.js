/*
 * Vdear — API layer
 * Gom dữ liệu ticker từ 4 sàn (Binance, Bybit, OKX, Bitget), klines từ Binance,
 * logo coin, và dữ liệu TradFi (best-effort).
 */
(function () {
  const CFG = window.VDEAR_CONFIG;

  /* ------------------------------ tiện ích ------------------------------ */
  function num(x) { const n = parseFloat(x); return Number.isFinite(n) ? n : 0; }

  async function getJSON(url, opts) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), (opts && opts.timeout) || 12000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  // Chạy các promise theo lô để tránh spam request.
  async function pool(items, worker, size) {
    const out = new Array(items.length);
    let i = 0;
    const runners = new Array(Math.min(size, items.length)).fill(0).map(async () => {
      while (i < items.length) {
        const idx = i++;
        try { out[idx] = await worker(items[idx], idx); }
        catch (e) { out[idx] = null; }
      }
    });
    await Promise.all(runners);
    return out;
  }

  /* --------------------- chuẩn hoá symbol về BASE ------------------------ */
  // "BTCUSDT" -> "BTC"; "BTC-USDT" -> "BTC"
  function baseFromSymbol(sym) {
    return String(sym).toUpperCase().replace(/[-_/]/g, '').replace(/USDT$/, '');
  }

  /* ----------------------------- BINANCE -------------------------------- */
  // Nguồn chính: 24h ticker toàn thị trường (spot USDT).
  async function binance24h() {
    const data = await getJSON(CFG.exchanges.binance.ticker24h);
    const map = {};
    for (const t of data) {
      const s = t.symbol;
      if (!s.endsWith('USDT')) continue;
      if (s.includes('_')) continue; // bỏ delivery futures (BTCUSDT_240927)
      if (/(UP|DOWN|BULL|BEAR)USDT$/.test(s)) continue; // bỏ token đòn bẩy
      const base = s.slice(0, -4);
      if (CFG.stableCoins.includes(base)) continue;
      map[base] = {
        base,
        symbol: s,
        price: num(t.lastPrice),
        change: num(t.priceChangePercent),
        high: num(t.highPrice),
        low: num(t.lowPrice),
        quoteVolume: num(t.quoteVolume),
        volume: num(t.volume),
        exchanges: { binance: num(t.lastPrice) },
      };
    }
    return map;
  }

  async function binanceKlines(symbol, interval, limit) {
    const url = `${CFG.exchanges.binance.klines}?symbol=${symbol}&interval=${interval}&limit=${limit || 200}`;
    const raw = await getJSON(url);
    return raw.map((k) => ({
      time: Math.floor(k[0] / 1000),
      open: num(k[1]), high: num(k[2]), low: num(k[3]), close: num(k[4]), volume: num(k[5]),
    }));
  }

  /* ----------------------- các sàn phụ (giá tham chiếu) ------------------ */
  async function bybitPrices() {
    try {
      const j = await getJSON(CFG.exchanges.bybit.tickers);
      const out = {};
      (j.result && j.result.list || []).forEach((t) => {
        if (!/USDT$/.test(t.symbol)) return;
        out[baseFromSymbol(t.symbol)] = num(t.lastPrice);
      });
      return out;
    } catch (e) { return {}; }
  }

  async function okxPrices() {
    try {
      const j = await getJSON(CFG.exchanges.okx.tickers);
      const out = {};
      (j.data || []).forEach((t) => {
        // instId perpetual: "BTC-USDT-SWAP"
        if (!/-USDT-SWAP$/.test(t.instId)) return;
        out[t.instId.split('-')[0]] = num(t.last);
      });
      return out;
    } catch (e) { return {}; }
  }

  async function bitgetPrices() {
    try {
      const j = await getJSON(CFG.exchanges.bitget.tickers);
      const out = {};
      (j.data || []).forEach((t) => {
        if (!/USDT$/.test(t.symbol)) return;
        // Bitget mix v2: giá ở field lastPr
        out[baseFromSymbol(t.symbol)] = num(t.lastPr || t.lastPrice || t.close || t.last);
      });
      return out;
    } catch (e) { return {}; }
  }

  /* --------------------- thị trường gộp 4 sàn --------------------------- */
  let _marketCache = null;
  let _marketAt = 0;

  // Trả về mảng coin đã gộp giá từ 4 sàn, sắp theo volume giảm dần.
  async function getMarket(force) {
    const now = Date.now();
    if (!force && _marketCache && now - _marketAt < 15000) return _marketCache;

    const [bnb, bybit, okx, bitget] = await Promise.all([
      binance24h(),
      bybitPrices(),
      okxPrices(),
      bitgetPrices(),
    ]);

    const list = Object.values(bnb);
    for (const c of list) {
      if (bybit[c.base]) c.exchanges.bybit = bybit[c.base];
      if (okx[c.base]) c.exchanges.okx = okx[c.base];
      if (bitget[c.base]) c.exchanges.bitget = bitget[c.base];
      // Giá trung bình các sàn có mặt (để hiển thị "consensus")
      const vals = Object.values(c.exchanges).filter((v) => v > 0);
      c.avgPrice = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : c.price;
      c.exchangeCount = vals.length;
    }
    list.sort((a, b) => b.quoteVolume - a.quoteVolume);

    _marketCache = list;
    _marketAt = now;
    return list;
  }

  async function getCoin(base) {
    const market = await getMarket();
    return market.find((c) => c.base === base.toUpperCase()) || null;
  }

  /* ------------------------------ LOGO ---------------------------------- */
  const _logoOk = {};
  function logoUrl(base) {
    return CFG.logoBase + String(base).toLowerCase() + '.png';
  }
  // Trả về data-URI avatar chữ (fallback khi không có logo).
  function letterAvatar(base) {
    const colors = ['#2f81f7','#00d68f','#f0b90b','#e0457b','#8b5cf6','#00c2ff','#ff7849','#20c997'];
    let h = 0; for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) >>> 0;
    const c = colors[h % colors.length];
    const ch = (base[0] || '?').toUpperCase();
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'>
      <circle cx='32' cy='32' r='32' fill='${c}'/>
      <text x='32' y='42' font-size='30' font-family='Arial,Helvetica,sans-serif'
        font-weight='700' fill='#fff' text-anchor='middle'>${ch}</text></svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  }
  // Gắn logo vào <img>, tự fallback sang avatar chữ.
  function applyLogo(img, base) {
    base = String(base).toUpperCase();
    img.alt = base;
    img.src = logoUrl(base);
    img.onerror = function () { img.onerror = null; img.src = letterAvatar(base); };
  }

  /* ----------------------------- TRADFI --------------------------------- */
  // Best-effort: thử nguồn miễn phí; nếu chặn CORS/policy thì mô phỏng có nhãn.
  async function getTradFi() {
    const out = [];
    for (const item of CFG.tradfi) {
      let price = item.base, change = 0, live = false;
      try {
        if (item.symbol === 'XAU' || item.symbol === 'XAG') {
          const j = await getJSON('https://api.gold-api.com/price/' + item.symbol, { timeout: 6000 });
          if (j && j.price) { price = num(j.price); live = true; }
        }
      } catch (e) { /* fallback */ }
      if (!live) {
        // dao động nhẹ theo thời gian để giao diện "sống", nhưng gắn nhãn mô phỏng
        const drift = Math.sin(Date.now() / 3.6e6 + item.base) * 0.012;
        price = item.base * (1 + drift);
        change = drift * 100;
      }
      out.push({ ...item, price, change, live });
    }
    return out;
  }

  window.VdearAPI = {
    getMarket, getCoin, binanceKlines, getTradFi,
    logoUrl, letterAvatar, applyLogo, baseFromSymbol, pool, num,
  };
})();
