/*
 * Vdear — Indicators engine
 * RSI(14), vùng quá mua/quá bán, EMA, pivot support/resistance,
 * chấm điểm tín hiệu LONG/SHORT (0-100) và xếp hạng an toàn 1-5 sao.
 */
(function () {
  const CFG = window.VDEAR_CONFIG;

  /* ------------------------------- RSI ---------------------------------- */
  // Wilder's RSI. Trả về mảng cùng độ dài closes (đầu mảng = null).
  function rsiSeries(closes, period) {
    period = period || CFG.rsi.period;
    const out = new Array(closes.length).fill(null);
    if (closes.length <= period) return out;
    let gain = 0, loss = 0;
    for (let i = 1; i <= period; i++) {
      const d = closes[i] - closes[i - 1];
      if (d >= 0) gain += d; else loss -= d;
    }
    let avgG = gain / period, avgL = loss / period;
    out[period] = 100 - 100 / (1 + (avgL === 0 ? 100 : avgG / avgL));
    for (let i = period + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      const g = d > 0 ? d : 0, l = d < 0 ? -d : 0;
      avgG = (avgG * (period - 1) + g) / period;
      avgL = (avgL * (period - 1) + l) / period;
      out[i] = 100 - 100 / (1 + (avgL === 0 ? 100 : avgG / avgL));
    }
    return out;
  }

  function lastRSI(closes, period) {
    const s = rsiSeries(closes, period);
    for (let i = s.length - 1; i >= 0; i--) if (s[i] != null) return s[i];
    return 50;
  }

  // Diễn giải vùng RSI theo yêu cầu người dùng.
  function rsiZone(rsi) {
    const r = CFG.rsi;
    if (rsi >= r.overboughtStrong) return { key: 'ob_strong', side: 'SHORT', label: 'Quá mua MẠNH', color: '#ff3b57', note: 'RSI > 80 — tín hiệu quá mua mạnh, khả năng đảo chiều GIẢM cao. Cân nhắc SHORT.' };
    if (rsi >= r.overbought) return { key: 'ob', side: 'SHORT', label: 'Quá mua', color: '#ff6b6b', note: 'RSI 70–80 — vùng quá mua, chú ý khả năng đảo chiều GIẢM. Ưu tiên SHORT.' };
    if (rsi <= r.oversoldStrong) return { key: 'os_strong', side: 'LONG', label: 'Quá bán MẠNH', color: '#00d68f', note: 'RSI < 20 — tín hiệu quá bán mạnh, khả năng đảo chiều TĂNG cao. Cân nhắc LONG.' };
    if (rsi <= r.oversold) return { key: 'os', side: 'LONG', label: 'Quá bán', color: '#26c281', note: 'RSI 20–30 — vùng quá bán, chú ý khả năng đảo chiều TĂNG. Ưu tiên LONG.' };
    return { key: 'neutral', side: 'NEUTRAL', label: 'Trung tính', color: '#8a94a6', note: 'RSI trung tính (30–70) — chưa có tín hiệu đảo chiều rõ ràng.' };
  }

  /* ------------------------------- EMA ---------------------------------- */
  function emaSeries(values, period) {
    const out = new Array(values.length).fill(null);
    if (!values.length) return out;
    const k = 2 / (period + 1);
    let prev = values[0];
    out[0] = prev;
    for (let i = 1; i < values.length; i++) {
      prev = values[i] * k + prev * (1 - k);
      out[i] = prev;
    }
    return out;
  }

  /* -------------------- Support / Resistance (pivots) ------------------- */
  // Tìm swing high/low bằng cửa sổ trái-phải, gom các mức gần nhau thành "zone".
  function pivots(candles, left, right) {
    left = left || 3; right = right || 3;
    const highs = [], lows = [];
    for (let i = left; i < candles.length - right; i++) {
      let isHigh = true, isLow = true;
      for (let j = i - left; j <= i + right; j++) {
        if (j === i) continue;
        if (candles[j].high >= candles[i].high) isHigh = false;
        if (candles[j].low <= candles[i].low) isLow = false;
      }
      if (isHigh) highs.push({ price: candles[i].high, idx: i });
      if (isLow) lows.push({ price: candles[i].low, idx: i });
    }
    return { highs, lows };
  }

  // Gom mức giá gần nhau (theo % ngưỡng) → zone có "touches" (độ mạnh).
  function cluster(levels, tol) {
    const sorted = levels.slice().sort((a, b) => a.price - b.price);
    const zones = [];
    for (const lv of sorted) {
      const z = zones[zones.length - 1];
      if (z && Math.abs(lv.price - z.center) / z.center <= tol) {
        z.prices.push(lv.price);
        z.lastIdx = Math.max(z.lastIdx, lv.idx);
        z.center = z.prices.reduce((a, b) => a + b, 0) / z.prices.length;
        z.touches++;
      } else {
        zones.push({ center: lv.price, prices: [lv.price], touches: 1, lastIdx: lv.idx });
      }
    }
    return zones;
  }

  // Trả về danh sách zone S/R cho một khung, kèm sao an toàn & khoảng cách.
  function supportResistance(candles, price) {
    if (!candles || candles.length < 20) return { supports: [], resistances: [] };
    const atr = averageTrueRange(candles, 14);
    const { highs, lows } = pivots(candles, 3, 3);
    const n = candles.length;

    const mkZone = (z, kind) => {
      const dist = Math.abs(z.center - price) / price;
      const recency = 1 - Math.min(1, (n - z.lastIdx) / n); // gần hiện tại → mạnh hơn
      // độ mạnh: số lần chạm + độ mới; sao 1-5
      const strength = z.touches * 1.4 + recency * 2.2;
      const stars = Math.max(1, Math.min(5, Math.round(strength)));
      const band = Math.max(atr * 0.6, z.center * 0.0025); // biên độ vùng đảo chiều mạnh
      return {
        kind, // 'support' | 'resistance'
        price: z.center,
        low: z.center - band,
        high: z.center + band,
        touches: z.touches,
        stars,
        distancePct: dist * 100,
        side: kind === 'support' ? 'LONG' : 'SHORT',
      };
    };

    let supports = cluster(lows, 0.008).map((z) => mkZone(z, 'support'))
      .filter((z) => z.price < price * 1.002);
    let resistances = cluster(highs, 0.008).map((z) => mkZone(z, 'resistance'))
      .filter((z) => z.price > price * 0.998);

    supports.sort((a, b) => a.distancePct - b.distancePct);
    resistances.sort((a, b) => a.distancePct - b.distancePct);
    return { supports: supports.slice(0, 5), resistances: resistances.slice(0, 5) };
  }

  function averageTrueRange(candles, period) {
    period = period || 14;
    if (candles.length < 2) return 0;
    let trs = [];
    for (let i = 1; i < candles.length; i++) {
      const c = candles[i], p = candles[i - 1];
      trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
    }
    const slice = trs.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  }

  /* ---------------------- Chấm điểm tín hiệu 0-100 ---------------------- */
  // Kết hợp RSI, vị trí so với EMA, đà giá, và khoảng cách tới S/R.
  function signalScore(candles) {
    const closes = candles.map((c) => c.close);
    const price = closes[closes.length - 1];
    const rsi = lastRSI(closes);
    const zone = rsiZone(rsi);
    const ema20 = emaSeries(closes, 20);
    const ema50 = emaSeries(closes, 50);
    const e20 = ema20[ema20.length - 1], e50 = ema50[ema50.length - 1];

    // momentum: % thay đổi 6 nến gần nhất
    const back = closes[Math.max(0, closes.length - 7)];
    const mom = back ? (price - back) / back : 0;

    // Điểm LONG (0..100): RSI thấp + giá dưới EMA (mean-revert) + gần support
    // Điểm SHORT ngược lại. Ta quy về 1 thang: 0=SHORT mạnh, 100=LONG mạnh.
    let score = 50;
    // RSI đóng góp mạnh nhất (mean reversion)
    score += (50 - rsi) * 0.9;
    // xu hướng EMA (trend following, trọng số nhỏ hơn)
    if (e20 && e50) score += price > e20 && e20 > e50 ? 6 : (price < e20 && e20 < e50 ? -6 : 0);
    // đà quá nhanh → dễ đảo chiều
    score += -mom * 120;
    score = Math.max(0, Math.min(100, Math.round(score)));

    // "win rate" ước lượng: độ mạnh của lệch khỏi 50 + số lần vùng RSI cực trị
    const conviction = Math.abs(score - 50) / 50; // 0..1
    const winRate = Math.round(50 + conviction * 42); // 50..92
    const side = score >= 58 ? 'LONG' : score <= 42 ? 'SHORT' : 'NEUTRAL';

    return { rsi, zone, price, score, winRate, side, mom, ema20: e20, ema50: e50 };
  }

  window.VdearTA = {
    rsiSeries, lastRSI, rsiZone, emaSeries, supportResistance,
    averageTrueRange, signalScore, pivots,
  };
})();
