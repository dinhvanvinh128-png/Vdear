/**
 * VDEAR TREND SCORE (spec: TREND SCORE).
 *
 * Multi-timeframe: 1D structure decides the regime, 4H the swing, 1H the
 * momentum, 15m only whether this is a reasonable moment inside it. Weights
 * live in lib/scoring/config.
 *
 * ADX is a GATE, not a component. A market can sit above every moving average
 * and still be going nowhere; when ADX says there is no trend, the score is
 * pulled toward neutral regardless of how tidy the averages look. Without that
 * gate a quiet range reads as a healthy uptrend, which is the single most
 * common way a trend score misleads.
 */
import type { Candle } from '@/lib/types';
import { ema } from '@/lib/indicators/movingAverage';
import { rsi } from '@/lib/indicators/rsi';
import { adx } from '@/lib/indicators/adx';
import { analyzeStructure, type StructureLabel } from '@/lib/indicators/structure';
import { clamp, last, scale, scaleAround } from '@/lib/indicators/series';
import {
  ADX_STRONG_TREND, ADX_TREND_MINIMUM, EMA_PERIODS,
  TREND_COMPONENT_WEIGHTS, TREND_TIMEFRAME_WEIGHTS, type TrendTimeframe,
} from '@/lib/scoring/config';

export interface TimeframeTrend {
  timeframe: TrendTimeframe;
  price: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  /** All EMAs stacked bullishly (20 > 50 > 200) or bearishly. */
  emaAlignment: 'bullish' | 'bearish' | 'mixed' | 'unknown';
  structure: StructureLabel;
  rsi: number | null;
  adx: number | null;
  /** Recent volume vs the window average, as a ratio. */
  volumeRatio: number | null;
  /** 0..100 for this timeframe alone. */
  score: number;
  /** True when there was not enough history to judge this timeframe. */
  insufficient: boolean;
}

export interface TrendScore {
  symbol: string;
  score: number;
  timeframes: TimeframeTrend[];
  /** Timeframes that had enough data. */
  covered: TrendTimeframe[];
  /** Timeframes skipped for lack of history — reported, never defaulted to 50. */
  missing: TrendTimeframe[];
  /** True when ADX says there is no trend to speak of on the daily. */
  rangebound: boolean;
  scoredAt: number;
}

function alignmentOf(
  price: number | null, e20: number | null, e50: number | null, e200: number | null,
): TimeframeTrend['emaAlignment'] {
  if (price == null || e20 == null || e50 == null) return 'unknown';
  // EMA200 may be absent on a young series; judge on what exists.
  const bullish = price > e20 && e20 > e50 && (e200 == null || e50 > e200);
  const bearish = price < e20 && e20 < e50 && (e200 == null || e50 < e200);
  if (bullish) return 'bullish';
  if (bearish) return 'bearish';
  return 'mixed';
}

/** 0..100 from where price sits relative to each EMA and how they are stacked. */
export function scoreEmaAlignment(
  price: number | null, e20: number | null, e50: number | null, e200: number | null,
): number | null {
  if (price == null) return null;
  const above: number[] = [];
  // Distance above/below each EMA, in percent, mapped onto 0..100. Using
  // distance rather than a boolean keeps a 0.1% cross from scoring the same as
  // a 15% trend.
  if (e20 != null) above.push(scaleAround(((price - e20) / e20) * 100, 0, 5));
  if (e50 != null) above.push(scaleAround(((price - e50) / e50) * 100, 0, 10));
  if (e200 != null) above.push(scaleAround(((price - e200) / e200) * 100, 0, 25));
  if (above.length === 0) return null;

  const positionScore = above.reduce((s, v) => s + v, 0) / above.length;

  // Stacking bonus/penalty: aligned EMAs are worth more than the same distances
  // in a tangle.
  const alignment = alignmentOf(price, e20, e50, e200);
  const bonus = alignment === 'bullish' ? 10 : alignment === 'bearish' ? -10 : 0;
  return clamp(positionScore + bonus);
}

const STRUCTURE_SCORES: Record<StructureLabel, number | null> = {
  uptrend: 85,
  reversal_up: 65,
  range: 50,
  reversal_down: 35,
  downtrend: 15,
  undefined: null, // no claim
};

export interface TimeframeInput {
  timeframe: TrendTimeframe;
  candles: Candle[];
}

export function scoreTimeframe(input: TimeframeInput): TimeframeTrend {
  const { timeframe, candles } = input;
  const closes = candles.map((c) => c.close);
  const price = closes.length > 0 ? closes[closes.length - 1]! : null;

  const empty: TimeframeTrend = {
    timeframe, price, ema20: null, ema50: null, ema200: null,
    emaAlignment: 'unknown', structure: 'undefined', rsi: null, adx: null,
    volumeRatio: null, score: 50, insufficient: true,
  };
  // Below ~30 bars nothing here is meaningful; say so rather than score noise.
  if (candles.length < 30) return empty;

  const e20 = last(ema(closes, EMA_PERIODS.fast));
  const e50 = last(ema(closes, EMA_PERIODS.mid));
  const e200 = last(ema(closes, EMA_PERIODS.slow));
  const rsiValue = last(rsi(closes, 14));
  const adxValue = last(adx(candles, 14).adx);
  const structure = analyzeStructure(candles, 3).label;

  const recent = candles.slice(-10);
  const baseline = candles.slice(-40, -10);
  const recentAvg = recent.length > 0
    ? recent.reduce((s, c) => s + c.volume, 0) / recent.length : 0;
  const baseAvg = baseline.length > 0
    ? baseline.reduce((s, c) => s + c.volume, 0) / baseline.length : 0;
  const volumeRatio = baseAvg > 0 ? recentAvg / baseAvg : null;

  const parts: { value: number; weight: number }[] = [];

  const emaScore = scoreEmaAlignment(price, e20, e50, e200);
  if (emaScore != null) parts.push({ value: emaScore, weight: TREND_COMPONENT_WEIGHTS.emaAlignment });

  const structureScore = STRUCTURE_SCORES[structure];
  if (structureScore != null) parts.push({ value: structureScore, weight: TREND_COMPONENT_WEIGHTS.structure });

  if (rsiValue != null) {
    // RSI as position, not as an overbought/oversold trigger: in a trend, RSI
    // sitting at 65 is strength, and treating it as a sell signal is how trend
    // scores get whipsawed.
    parts.push({ value: scale(rsiValue, 25, 75), weight: TREND_COMPONENT_WEIGHTS.momentum });
  }

  if (volumeRatio != null) {
    // Participation, direction-agnostic: it amplifies whatever the price is
    // doing, so it is folded in around neutral.
    const directional = price != null && e20 != null && price > e20 ? 1 : -1;
    const expansion = scaleAround(volumeRatio, 1, 0.8) - 50; // -50..+50
    parts.push({ value: clamp(50 + expansion * directional), weight: TREND_COMPONENT_WEIGHTS.volume });
  }

  const wsum = parts.reduce((s, p) => s + p.weight, 0);
  let score = wsum > 0 ? clamp(parts.reduce((s, p) => s + p.value * p.weight, 0) / wsum) : 50;

  // ADX gate. Below the minimum this is a range; pull the score toward neutral
  // in proportion to how weak the trend is.
  if (adxValue != null && adxValue < ADX_TREND_MINIMUM) {
    const strength = adxValue / ADX_TREND_MINIMUM; // 0..1
    score = clamp(50 + (score - 50) * strength);
  }

  return {
    timeframe, price, ema20: e20, ema50: e50, ema200: e200,
    emaAlignment: alignmentOf(price, e20, e50, e200),
    structure, rsi: rsiValue, adx: adxValue, volumeRatio,
    score, insufficient: false,
  };
}

export function computeTrendScore(
  symbol: string, inputs: readonly TimeframeInput[], now = Date.now(),
): TrendScore {
  const timeframes = inputs.map(scoreTimeframe);
  const usable = timeframes.filter((t) => !t.insufficient);

  const covered = usable.map((t) => t.timeframe);
  const missing = timeframes.filter((t) => t.insufficient).map((t) => t.timeframe);

  // Renormalise over the timeframes we actually have — a missing 1D must not be
  // silently scored 50 and drag a real signal to the middle.
  let score = 50;
  if (usable.length > 0) {
    const wsum = usable.reduce((s, t) => s + TREND_TIMEFRAME_WEIGHTS[t.timeframe], 0);
    score = clamp(
      usable.reduce((s, t) => s + t.score * TREND_TIMEFRAME_WEIGHTS[t.timeframe], 0) / wsum,
    );
  }

  const daily = timeframes.find((t) => t.timeframe === '1d');
  const rangebound = daily?.adx != null && daily.adx < ADX_TREND_MINIMUM;

  return { symbol: symbol.toUpperCase(), score, timeframes, covered, missing, rangebound, scoredAt: now };
}

export function trendStrengthLabel(adxValue: number | null): 'strong' | 'trending' | 'weak' | 'unknown' {
  if (adxValue == null) return 'unknown';
  if (adxValue >= ADX_STRONG_TREND) return 'strong';
  if (adxValue >= ADX_TREND_MINIMUM) return 'trending';
  return 'weak';
}
