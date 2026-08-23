/**
 * MARKET BREADTH ENGINE (spec: MARKET BREADTH ENGINE).
 *
 * "Không chỉ phân tích BTC" — breadth is what separates a real market advance
 * from BTC dragging a dead field along. Computed over the whole USDT universe:
 * % advancing, % above EMA20/50/200, advance/decline, new highs/lows, and
 * advancing vs declining volume.
 *
 * Two rules keep this honest:
 *  - A coin whose EMA200 has not warmed up is EXCLUDED from that ratio, not
 *    counted as "below". Each ratio therefore reports its own sample size.
 *  - Stablecoins are excluded entirely; they neither advance nor decline in a
 *    way that says anything about risk appetite.
 */
import { ema } from '@/lib/indicators/movingAverage';
import { last } from '@/lib/indicators/series';
import { clamp, scale } from '@/lib/indicators/series';

export interface BreadthInput {
  base: string;
  /** Daily closes, oldest first. */
  closes: number[];
  priceChange24h: number;
  volume24h: number;
  /** Highest and lowest close over the lookback (usually 30d). */
  periodHigh?: number;
  periodLow?: number;
}

export interface Ratio {
  /** 0..100 */
  pct: number | null;
  count: number;
  /** How many assets had enough history to be judged. */
  sample: number;
}

export interface MarketBreadth {
  universe: number;
  advancing: Ratio;
  declining: Ratio;
  aboveEma20: Ratio;
  aboveEma50: Ratio;
  aboveEma200: Ratio;
  newHighs: Ratio;
  newLows: Ratio;
  /** advancing - declining, in asset count. */
  advanceDecline: number;
  advancingVolumeUsd: number;
  decliningVolumeUsd: number;
  /** advancingVolume / totalVolume, 0..1. Null when nothing traded. */
  volumeRatio: number | null;
  /** 0..100 */
  score: number;
  scoredAt: number;
}

function ratio(count: number, sample: number): Ratio {
  return { pct: sample > 0 ? (count / sample) * 100 : null, count, sample };
}

/** Is `close` above the EMA of `period`, or is there not enough history? */
export function aboveEma(closes: readonly number[], period: number): boolean | null {
  if (closes.length < period) return null; // unknown, not "below"
  const value = last(ema(closes, period));
  const price = closes[closes.length - 1];
  if (value == null || price == null) return null;
  return price > value;
}

export function computeBreadth(assets: readonly BreadthInput[], now = Date.now()): MarketBreadth {
  let advancing = 0;
  let declining = 0;
  let advVol = 0;
  let decVol = 0;
  let above20 = 0, sample20 = 0;
  let above50 = 0, sample50 = 0;
  let above200 = 0, sample200 = 0;
  let newHighs = 0, newLows = 0, sampleExtremes = 0;

  for (const a of assets) {
    if (a.priceChange24h > 0) { advancing++; advVol += a.volume24h; }
    else if (a.priceChange24h < 0) { declining++; decVol += a.volume24h; }

    const e20 = aboveEma(a.closes, 20);
    if (e20 !== null) { sample20++; if (e20) above20++; }
    const e50 = aboveEma(a.closes, 50);
    if (e50 !== null) { sample50++; if (e50) above50++; }
    const e200 = aboveEma(a.closes, 200);
    if (e200 !== null) { sample200++; if (e200) above200++; }

    const price = a.closes[a.closes.length - 1];
    if (price != null && a.periodHigh != null && a.periodLow != null && a.periodHigh > a.periodLow) {
      sampleExtremes++;
      if (price >= a.periodHigh) newHighs++;
      else if (price <= a.periodLow) newLows++;
    }
  }

  const totalVol = advVol + decVol;
  const breadth: Omit<MarketBreadth, 'score'> = {
    universe: assets.length,
    advancing: ratio(advancing, assets.length),
    declining: ratio(declining, assets.length),
    aboveEma20: ratio(above20, sample20),
    aboveEma50: ratio(above50, sample50),
    aboveEma200: ratio(above200, sample200),
    newHighs: ratio(newHighs, sampleExtremes),
    newLows: ratio(newLows, sampleExtremes),
    advanceDecline: advancing - declining,
    advancingVolumeUsd: advVol,
    decliningVolumeUsd: decVol,
    volumeRatio: totalVol > 0 ? advVol / totalVol : null,
    scoredAt: now,
  };

  return { ...breadth, score: scoreBreadth(breadth) };
}

/**
 * Breadth score 0..100.
 *
 * Weighted toward participation over trend-following: % advancing and the
 * volume ratio say what is happening today, the EMA ratios say how durable the
 * backdrop is. The 200-EMA ratio carries the most weight of the three because
 * it is the slowest to flip and hardest to fake.
 *
 * Components with no sample are dropped and the weights renormalised — a young
 * universe with no 200-day history must not be scored as if it were all below.
 */
export function scoreBreadth(b: Omit<MarketBreadth, 'score'>): number {
  const parts: { value: number; weight: number }[] = [];

  if (b.advancing.pct != null) parts.push({ value: b.advancing.pct, weight: 0.25 });
  if (b.volumeRatio != null) parts.push({ value: b.volumeRatio * 100, weight: 0.2 });
  if (b.aboveEma20.pct != null) parts.push({ value: b.aboveEma20.pct, weight: 0.15 });
  if (b.aboveEma50.pct != null) parts.push({ value: b.aboveEma50.pct, weight: 0.15 });
  if (b.aboveEma200.pct != null) parts.push({ value: b.aboveEma200.pct, weight: 0.2 });

  // New highs vs new lows, as a net skew mapped onto 0..100.
  if (b.newHighs.pct != null && b.newLows.pct != null) {
    parts.push({ value: scale(b.newHighs.pct - b.newLows.pct, -20, 20), weight: 0.05 });
  }

  if (parts.length === 0) return 50;
  const wsum = parts.reduce((s, p) => s + p.weight, 0);
  const acc = parts.reduce((s, p) => s + p.value * p.weight, 0);
  return clamp(acc / wsum);
}

export type BreadthLabel =
  | 'very_strong' | 'strong' | 'neutral' | 'weak' | 'very_weak';

export function breadthLabel(score: number): BreadthLabel {
  if (score >= 75) return 'very_strong';
  if (score >= 60) return 'strong';
  if (score >= 40) return 'neutral';
  if (score >= 25) return 'weak';
  return 'very_weak';
}
