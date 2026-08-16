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

  /* =====================================================================
   * CHIẾN LƯỢC "THỰC CHIẾN" — mô phỏng theo backtest confluence
   * RSI H4 đảo chiều -> hướng; hợp tụ S&R đa khung + Price Action -> vào lệnh.
   * ===================================================================== */

  // Price action: nến engulfing hoặc pin bar tại vị trí i.
  function priceAction(candles, i) {
    if (i < 1) return null;
    const c = candles[i], p = candles[i - 1];
    const body = Math.abs(c.close - c.open);
    const rng = c.high - c.low;
    if (rng === 0) return null;
    // Bullish / bearish engulfing
    if (p.close < p.open && c.close > c.open && c.close >= p.open && c.open <= p.close) return 'bullish';
    if (p.close > p.open && c.close < c.open && c.close <= p.open && c.open >= p.close) return 'bearish';
    // Pin bar (bóng nến dài)
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const upperWick = c.high - Math.max(c.open, c.close);
    if (lowerWick > body * 2 && lowerWick > rng * 0.5) return 'bullish';
    if (upperWick > body * 2 && upperWick > rng * 0.5) return 'bearish';
    return null;
  }

  // Bắt đảo chiều RSI trong "lookback" nến gần nhất (giống rsi_reversal_direction).
  function rsiReversal(rsiSeries, idx, lookback) {
    const R = CFG.rsi;
    lookback = lookback || CFG.strategy.rsiLookback;
    if (idx < R.period + lookback) return null;
    let mn = Infinity, mx = -Infinity;
    for (let k = idx - lookback; k <= idx; k++) {
      const v = rsiSeries[k]; if (v == null) continue;
      if (v < mn) mn = v; if (v > mx) mx = v;
    }
    const now = rsiSeries[idx];
    if (now == null) return null;
    if (mn <= R.oversold && now > R.oversold)
      return { dir: 'bullish', note: mn < R.oversoldStrong ? 'quá bán mạnh (<20)' : 'quá bán (20–30)', rsi: now };
    if (mx >= R.overbought && now < R.overbought)
      return { dir: 'bearish', note: mx > R.overboughtStrong ? 'quá mua mạnh (>80)' : 'quá mua (70–80)', rsi: now };
    return null;
  }

  // Mức swing high/low (danh sách giá) cho một khung.
  function swingLevels(candles, window) {
    const { highs, lows } = pivots(candles, window || CFG.strategy.swingWindow, window || CFG.strategy.swingWindow);
    return [...highs.map((h) => h.price), ...lows.map((l) => l.price)];
  }

  function nearLevel(price, levels, tol) {
    tol = tol || CFG.strategy.srTolerance;
    return levels.some((lv) => Math.abs(price - lv) / lv <= tol);
  }

  // Kế hoạch vào lệnh theo quản lý vốn của backtest (TP/DCA/SL sau DCA).
  function tradePlan(entry, dir, leverage) {
    const M = CFG.money;
    const L = leverage || M.leverage;
    const moveTp = (M.tpMarginPct / 100) / L;
    const moveDca = (M.dcaTriggerPct / 100) / L;
    const long = dir === 'bullish' || dir === 'LONG';
    const tp0 = long ? entry * (1 + moveTp) : entry * (1 - moveTp);
    const dca = long ? entry * (1 - moveDca) : entry * (1 + moveDca);
    // Sau DCA: vào 2 phần đều nhau -> giá TB
    const units1 = L / entry, units2 = L / dca;
    const avg = (units1 * entry + units2 * dca) / (units1 + units2);
    const uT = units1 + units2, mT = 2;
    const slNew = long ? avg - (M.postDcaSlPct / 100) * mT / uT : avg + (M.postDcaSlPct / 100) * mT / uT;
    const tpNew = long ? avg + (M.postDcaTpPct / 100) * mT / uT : avg - (M.postDcaTpPct / 100) * mT / uT;
    return { leverage: L, entry, tp0, dca, avgAfterDca: avg, slAfterDca: slNew, tpAfterDca: tpNew };
  }

  // Tín hiệu thực chiến trên 1 khung (dùng cho quét dashboard nhanh).
  // candles = nến của khung phân tích (mặc định 4h).
  function combatSignal(candles) {
    const closes = candles.map((c) => c.close);
    const rsi = rsiSeries(closes);
    const last = candles.length - 1;
    const rev = rsiReversal(rsi, last);
    const price = closes[last];
    const levels = swingLevels(candles);
    const srNear = nearLevel(price, levels);
    const pa = priceAction(candles, last);
    const base = signalScore(candles); // điểm nền + winRate

    // Hội tụ: RSI đảo chiều + PA cùng hướng + gần vùng S&R
    let dir = rev ? rev.dir : (base.side === 'LONG' ? 'bullish' : base.side === 'SHORT' ? 'bearish' : null);
    const paMatch = pa && dir && pa === dir;
    const confluence = (rev ? 1 : 0) + (srNear ? 1 : 0) + (paMatch ? 1 : 0);
    const valid = !!rev && confluence >= 2; // "thực chiến": cần RSI đảo chiều + ≥1 xác nhận khác

    const side = dir === 'bullish' ? 'LONG' : dir === 'bearish' ? 'SHORT' : 'NEUTRAL';
    // win-rate điều chỉnh theo số xác nhận
    const winRate = Math.min(95, Math.round(base.winRate + confluence * 4 + (valid ? 6 : 0)));
    const plan = side !== 'NEUTRAL' ? tradePlan(price, side) : null;

    return {
      side, valid, confluence, srNear, paMatch: !!paMatch,
      rsi: base.rsi, rsiNote: rev ? rev.note : base.zone.label,
      zone: base.zone, score: base.score, winRate, price, plan,
    };
  }

  /* ===== Mô phỏng 1 lệnh theo ĐÚNG money-management của backtest ========
   * TP gốc +100% margin; nếu chạm -50% margin trước -> DCA 1 lần;
   * sau DCA: SL -50% / TP +100% trên TỔNG vốn. Trả win/loss (hoặc null nếu chưa dứt).
   */
  function simulateDCA(candles, entryIdx, direction, leverage) {
    const M = CFG.money, L = leverage;
    const E1 = candles[entryIdx].close;
    const moveTp = (M.tpMarginPct / 100) / L, moveDca = (M.dcaTriggerPct / 100) / L;
    const long = direction === 'bullish' || direction === 'LONG';
    const Ptp0 = long ? E1 * (1 + moveTp) : E1 * (1 - moveTp);
    const Pdca = long ? E1 * (1 - moveDca) : E1 * (1 + moveDca);
    let dcaDone = false, Psl = null, Ptp = null;
    const end = Math.min(entryIdx + (M.forwardScan || 1000), candles.length);
    for (let j = entryIdx + 1; j < end; j++) {
      const hi = candles[j].high, lo = candles[j].low;
      if (!dcaDone) {
        const hitDca = long ? lo <= Pdca : hi >= Pdca;
        const hitTp0 = long ? hi >= Ptp0 : lo <= Ptp0;
        if (hitDca) {
          const units1 = L / E1, units2 = L / Pdca;
          const unitsTot = units1 + units2, avg = (units1 * E1 + units2 * Pdca) / unitsTot, mT = 2;
          Psl = long ? avg - (M.postDcaSlPct / 100) * mT / unitsTot : avg + (M.postDcaSlPct / 100) * mT / unitsTot;
          Ptp = long ? avg + (M.postDcaTpPct / 100) * mT / unitsTot : avg - (M.postDcaTpPct / 100) * mT / unitsTot;
          dcaDone = true; continue;
        }
        if (hitTp0) return { win: true, outcome: 'win_no_dca', resolveIdx: j };
      } else {
        const hitSl = long ? lo <= Psl : hi >= Psl;
        const hitTp = long ? hi >= Ptp : lo <= Ptp;
        if (hitSl) return { win: false, outcome: 'loss_after_dca', resolveIdx: j };
        if (hitTp) return { win: true, outcome: 'win_after_dca', resolveIdx: j };
      }
    }
    return null;
  }

  // Backtest nhanh trên chuỗi nến 1 khung: bắt tín hiệu (RSI đảo chiều + gần S&R + PA)
  // rồi mô phỏng DCA với đòn bẩy cho trước -> win-rate THẬT theo phương pháp của bạn.
  function miniBacktest(candles, leverage) {
    if (!candles || candles.length < 60) return { trades: 0, wins: 0, winRate: null };
    const closes = candles.map((c) => c.close);
    const rsi = rsiSeries(closes);
    const levels = swingLevels(candles);
    const warmup = CFG.rsi.period + CFG.strategy.rsiLookback + CFG.strategy.swingWindow;
    let trades = 0, wins = 0, nextIdx = 0;
    for (let i = warmup; i < candles.length - 2; i++) {
      if (i < nextIdx) continue;
      const rev = rsiReversal(rsi, i);
      if (!rev) continue;
      if (!nearLevel(closes[i], levels)) continue;
      if (priceAction(candles, i) !== rev.dir) continue;
      const r = simulateDCA(candles, i, rev.dir, leverage);
      if (r) { trades++; if (r.win) wins++; nextIdx = r.resolveIdx + 1; }
    }
    return { trades, wins, winRate: trades ? Math.round((wins / trades) * 100) : null };
  }

  // Dò các mức đòn bẩy, chọn mức có win-rate cao nhất (đủ mẫu) — "ưu tiên win cao".
  function bestLeverage(candles) {
    let best = null;
    for (const L of CFG.money.leverageSamples) {
      const bt = miniBacktest(candles, L);
      if (bt.winRate == null) continue;
      const score = bt.winRate + Math.min(bt.trades, 20) * 0.2; // ưu tiên win cao + đủ mẫu
      if (!best || score > best.score || (score === best.score && L < best.lev))
        best = { lev: L, winRate: bt.winRate, trades: bt.trades, score };
    }
    return best || { lev: CFG.money.leverage, winRate: null, trades: 0 };
  }

  // Ước tính chi phí funding theo % vốn (margin). rate = %/8h.
  // Dương = mình PHẢI TRẢ funding; âm = mình ĐƯỢC NHẬN funding.
  function fundingCost(ratePct, side, leverage, holdDays) {
    if (ratePct == null || !isFinite(ratePct)) return null;
    const M = CFG.money;
    const L = leverage || M.leverage;
    const intervals = (M.fundingIntervalsPerDay || 3) * (holdDays || M.assumedHoldDays || 1);
    const sign = (side === 'LONG' || side === 'bullish') ? 1 : -1; // long trả khi rate>0
    return ratePct * L * intervals * sign; // % trên vốn margin
  }

  window.VdearTA = {
    rsiSeries, lastRSI, rsiZone, emaSeries, supportResistance,
    averageTrueRange, signalScore, pivots,
    priceAction, rsiReversal, swingLevels, nearLevel, tradePlan, combatSignal,
    fundingCost, simulateDCA, miniBacktest, bestLeverage,
  };
})();
