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
        symbol: s,
        price: num(t.lastPrice),
        change: num(t.priceChangePercent),
        high: num(t.highPrice),
        low: num(t.lowPrice),
        quoteVolume: num(t.quoteVolume),
      };
    }
    return map;
  }

  // Funding rate hiện tại + mark price (Binance USDⓈ-M Futures).
  // premiumIndex trả mảng {symbol, markPrice, lastFundingRate, nextFundingTime}.
  async function binanceFunding() {
    try {
      const data = await getJSON('https://fapi.binance.com/fapi/v1/premiumIndex');
      const map = {};
      (Array.isArray(data) ? data : []).forEach((t) => {
        const s = t.symbol;
        if (!s || !s.endsWith('USDT') || s.includes('_')) return;
        map[s.slice(0, -4)] = {
          rate: num(t.lastFundingRate) * 100,       // %/8h
          markPrice: num(t.markPrice),
          nextTime: num(t.nextFundingTime),
        };
      });
      return map;
    } catch (e) { return {}; }
  }

  /* --------- Ticker FUTURES đầy đủ từ từng sàn (union thị trường) -------- */
  // Mỗi hàm trả {BASE: {price, change, high, low, quoteVolume}}; lỗi -> {} (bỏ qua sàn).
  async function bybitFutures() {
    try {
      const j = await getJSON(CFG.exchanges.bybit.tickers);
      const out = {};
      (j.result && j.result.list || []).forEach((t) => {
        if (!/USDT$/.test(t.symbol) || /-/.test(t.symbol)) return;
        const base = t.symbol.slice(0, -4);
        if (CFG.stableCoins.includes(base)) return;
        out[base] = {
          price: num(t.lastPrice),
          change: num(t.price24hPcnt) * 100, // fraction -> %
          high: num(t.highPrice24h), low: num(t.lowPrice24h),
          quoteVolume: num(t.turnover24h),
        };
      });
      return out;
    } catch (e) { return {}; }
  }

  async function okxFutures() {
    try {
      const j = await getJSON(CFG.exchanges.okx.tickers);
      const out = {};
      (j.data || []).forEach((t) => {
        if (!/-USDT-SWAP$/.test(t.instId)) return;
        const base = t.instId.split('-')[0];
        if (CFG.stableCoins.includes(base)) return;
        const last = num(t.last), open = num(t.open24h);
        out[base] = {
          price: last,
          change: open ? ((last - open) / open) * 100 : 0,
          high: num(t.high24h), low: num(t.low24h),
          quoteVolume: num(t.volCcy24h) * (last || 1), // xấp xỉ quote volume
        };
      });
      return out;
    } catch (e) { return {}; }
  }

  async function bitgetFutures() {
    try {
      const j = await getJSON(CFG.exchanges.bitget.tickers);
      const out = {};
      (j.data || []).forEach((t) => {
        if (!/USDT$/.test(t.symbol) || /-/.test(t.symbol)) return;
        const base = t.symbol.slice(0, -4);
        if (CFG.stableCoins.includes(base)) return;
        const last = num(t.lastPr || t.last || t.close);
        // change24h là fraction; nếu không có tính từ open
        let chg = t.change24h != null ? num(t.change24h) * 100 : 0;
        if (!chg && t.open24h) chg = ((last - num(t.open24h)) / num(t.open24h)) * 100;
        out[base] = {
          price: last, change: chg,
          high: num(t.high24h), low: num(t.low24h),
          quoteVolume: num(t.quoteVolume || t.usdtVolume),
        };
      });
      return out;
    } catch (e) { return {}; }
  }

  /* --------------------------- KLINES đa sàn ---------------------------- */
  // Bảng map khung -> tham số interval của từng sàn.
  const IV = {
    bybit:  { '5m':'5','15m':'15','30m':'30','1h':'60','2h':'120','4h':'240','10h':'720','12h':'720','1d':'D','1w':'W','1M':'M' },
    okx:    { '5m':'5m','15m':'15m','30m':'30m','1h':'1H','2h':'2H','4h':'4H','10h':'12H','12h':'12H','1d':'1D','1w':'1W','1M':'1M' },
    bitget: { '5m':'5m','15m':'15m','30m':'30m','1h':'1H','2h':'4H','4h':'4H','10h':'12H','12h':'12H','1d':'1D','1w':'1W','1M':'1M' },
  };

  function normKlines(rows, idx) {
    // idx = {t,o,h,l,c,v}; sắp xếp tăng dần theo thời gian.
    const out = rows.map((k) => ({
      time: Math.floor(num(k[idx.t]) / 1000),
      open: num(k[idx.o]), high: num(k[idx.h]), low: num(k[idx.l]),
      close: num(k[idx.c]), volume: num(k[idx.v]),
    })).filter((c) => c.close > 0);
    out.sort((a, b) => a.time - b.time);
    return out;
  }

  async function binanceKlines(symbol, interval, limit) {
    const url = `${CFG.exchanges.binance.klines}?symbol=${symbol}&interval=${interval}&limit=${limit || 200}`;
    const raw = await getJSON(url);
    return normKlines(raw, { t: 0, o: 1, h: 2, l: 3, c: 4, v: 5 });
  }
  async function bybitKlines(base, tfId, limit) {
    const iv = IV.bybit[tfId]; if (!iv) throw new Error('tf');
    const j = await getJSON(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${base}USDT&interval=${iv}&limit=${limit || 200}`);
    return normKlines((j.result && j.result.list) || [], { t: 0, o: 1, h: 2, l: 3, c: 4, v: 5 });
  }
  async function okxKlines(base, tfId, limit) {
    const iv = IV.okx[tfId]; if (!iv) throw new Error('tf');
    const j = await getJSON(`https://www.okx.com/api/v5/market/candles?instId=${base}-USDT-SWAP&bar=${iv}&limit=${Math.min(300, limit || 200)}`);
    return normKlines(j.data || [], { t: 0, o: 1, h: 2, l: 3, c: 4, v: 5 });
  }
  async function bitgetKlines(base, tfId, limit) {
    const iv = IV.bitget[tfId]; if (!iv) throw new Error('tf');
    const j = await getJSON(`https://api.bitget.com/api/v2/mix/market/candles?symbol=${base}USDT&productType=USDT-FUTURES&granularity=${iv}&limit=${limit || 200}`);
    return normKlines(j.data || [], { t: 0, o: 1, h: 2, l: 3, c: 4, v: 5 });
  }

  // Lấy nến, tự thử lần lượt các sàn coin có mặt (Binance -> Bybit -> OKX -> Bitget).
  async function klinesMulti(coin, tfId, limit) {
    const base = typeof coin === 'string' ? coin.toUpperCase() : coin.base;
    const venues = (typeof coin === 'object' && coin.venues) ? coin.venues : { binance: 1, bybit: 1, okx: 1, bitget: 1 };
    const tf = CFG.timeframes.find((x) => x.id === tfId) || CFG.timeframes.find((x) => x.id === '4h');
    const attempts = [];
    if (venues.binance) attempts.push(() => binanceKlines(base + 'USDT', tf.binance, limit));
    if (venues.bybit) attempts.push(() => bybitKlines(base, tfId, limit));
    if (venues.okx) attempts.push(() => okxKlines(base, tfId, limit));
    if (venues.bitget) attempts.push(() => bitgetKlines(base, tfId, limit));
    for (const fn of attempts) {
      try { const c = await fn(); if (c && c.length >= 30) return c; } catch (e) { /* thử sàn kế */ }
    }
    return [];
  }

  /* ------- Bản đồ logo CoinGecko (miễn phí, CORS mở, logo đúng coin) ----- */
  let _cgLogos = null, _cgPromise = null;
  async function loadCGLogos() {
    if (_cgLogos) return _cgLogos;
    if (_cgPromise) return _cgPromise;
    _cgPromise = (async () => {
      const map = {};
      for (const page of [1, 2, 3]) {
        try {
          const j = await getJSON(
            'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=' + page + '&sparkline=false',
            { timeout: 9000 });
          (Array.isArray(j) ? j : []).forEach((c) => {
            const s = (c.symbol || '').toUpperCase();
            if (s && c.image && !map[s]) map[s] = c.image; // vốn hoá lớn hơn xuất hiện trước -> đúng coin
          });
        } catch (e) { /* bỏ trang lỗi */ }
      }
      _cgLogos = map;
      return map;
    })();
    return _cgPromise;
  }

  /* --------------------- thị trường gộp 4 sàn --------------------------- */
  let _marketCache = null;
  let _marketAt = 0;

  // UNION toàn bộ coin futures từ 4 sàn. Sàn nào lỗi -> map rỗng, tự bỏ qua.
  async function getMarket(force) {
    const now = Date.now();
    if (!force && _marketCache && now - _marketAt < 15000) return _marketCache;

    const [bnb, bybit, okx, bitget, funding] = await Promise.all([
      binance24h().catch(() => ({})),
      bybitFutures(),
      okxFutures(),
      bitgetFutures(),
      binanceFunding(),
      loadCGLogos().catch(() => null), // nạp bản đồ logo (kết quả bỏ qua, chỉ set cache)
    ]);

    const venueOrder = [['binance', bnb], ['bybit', bybit], ['okx', okx], ['bitget', bitget]];
    const coins = {};
    for (const [venue, mp] of venueOrder) {
      for (const base in mp) {
        const d = mp[base];
        if (!d || !(d.price > 0)) continue;
        let c = coins[base];
        if (!c) {
          c = coins[base] = {
            base, symbol: (d.symbol || base + 'USDT'),
            price: 0, change: 0, high: 0, low: 0, quoteVolume: 0,
            exchanges: {}, venues: {}, primaryVenue: venue,
          };
        }
        c.exchanges[venue] = d.price;
        c.venues[venue] = 1;
        // Cộng dồn volume toàn thị trường (4 sàn)
        c.quoteVolume += d.quoteVolume || 0;
        // Giá/nến chính: ưu tiên theo thứ tự Binance > Bybit > OKX > Bitget (venue đầu gặp)
        if (!c._hasPrimary) {
          c.price = d.price; c.change = d.change || 0;
          c.high = d.high || 0; c.low = d.low || 0;
          c.primaryVenue = venue; c._hasPrimary = true;
          if (d.symbol) c.symbol = d.symbol;
        }
      }
    }

    const list = Object.values(coins);
    for (const c of list) {
      delete c._hasPrimary;
      if (funding[c.base]) {
        c.funding = funding[c.base].rate;
        c.markPrice = funding[c.base].markPrice;
        c.nextFunding = funding[c.base].nextTime;
      } else { c.funding = null; }
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
  // Nhiều nguồn logo (thử lần lượt) để giảm thiếu logo.
  // Chuẩn hoá base cho nguồn logo: bỏ tiền tố bội số (1000PEPE -> pepe).
  function logoKey(base) {
    return String(base).toLowerCase().replace(/^(1000000|100000|10000|1000)/, '');
  }
  function logoSources(base) {
    const l = logoKey(base);
    const U = l.toUpperCase();
    const arr = [];
    // 1) CoinGecko: logo đúng coin, phủ rộng nhất (nếu bản đồ đã nạp)
    if (_cgLogos && _cgLogos[U]) arr.push(_cgLogos[U]);
    // 2) TradingView (crypto): XTVC<SYMBOL>.svg
    arr.push('https://s3-symbol-logo.tradingview.com/crypto/XTVC' + U + '.svg');
    // 3) cryptocurrency-icons qua jsDelivr
    arr.push('https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/' + l + '.png');
    return arr;
  }
  function logoUrl(base) { return logoSources(base)[0]; }
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
  // Gắn logo vào <img>, thử lần lượt các nguồn rồi fallback avatar chữ.
  // Kiểm cả onload (ảnh rỗng 0px) để không bị "logo trắng".
  function applyLogo(img, base) {
    base = String(base).toUpperCase();
    img.alt = base;
    const sources = logoSources(base);
    let i = 0, done = false;
    const finishAvatar = () => { if (done) return; done = true; img.onerror = null; img.onload = null; img.src = letterAvatar(base); };
    const tryNext = () => {
      if (done) return;
      if (i >= sources.length) { finishAvatar(); return; }
      img.src = sources[i++];
    };
    img.onerror = tryNext;
    img.onload = () => {
      if (done) return;
      // ảnh hợp lệ phải có kích thước > 0; nếu không, thử nguồn kế
      if (img.naturalWidth > 1 && img.naturalHeight > 1) { done = true; img.onerror = null; }
      else tryNext();
    };
    tryNext();
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
    getMarket, getCoin, binanceKlines, klinesMulti, getTradFi,
    logoUrl, logoSources, letterAvatar, applyLogo, baseFromSymbol, pool, num,
  };
})();
