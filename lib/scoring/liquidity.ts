/**
 * VDEAR LIQUIDITY SCORE (spec: LIQUIDITY SCORE).
 *
 * Combines order-book depth, spread, CEX volume, stablecoin liquidity and DEX
 * liquidity into one 0..100 reading, plus a direction: is liquidity expanding
 * or contracting?
 *
 * Depth and spread are scored on absolute scales rather than relative ones,
 * because "deep" is not relative: a $2m book within 1% is a market you can
 * trade size in, whatever it looked like last week.
 */
import { clamp, scaleAround } from '@/lib/indicators/series';
import { LIQUIDITY_WEIGHTS, SPREAD_BOUNDS } from '@/lib/scoring/config';

export type LiquidityDirection = 'expanding' | 'stable' | 'contracting';

export interface LiquidityInput {
  /** Summed bid+ask depth within +/-1% across venues, USD. */
  depthUsd: number | null;
  /** Best bid/ask spread, percent. */
  spreadPct: number | null;
  /** 24h CEX volume for the asset, USD. */
  cexVolume24hUsd: number | null;
  /** 24h volume 7 days ago, for the direction read. */
  cexVolume7dAgoUsd?: number | null;
  /** Stablecoin engine score, 0..100. */
  stablecoinScore: number | null;
  /** DeFi engine score, 0..100. */
  defiScore: number | null;
  /** DEX pool liquidity, USD. */
  dexLiquidityUsd?: number | null;
}

export interface LiquidityScore {
  score: number;
  direction: LiquidityDirection;
  components: { name: string; value: number; weight: number }[];
  /** Inputs that were unavailable — reported, never defaulted. */
  missing: string[];
  depthUsd: number | null;
  spreadPct: number | null;
  scoredAt: number;
}

/**
 * Depth in USD -> 0..100 on a log scale.
 *
 * Linear scaling is wrong here: the difference between $10k and $110k of depth
 * is enormous, while $5m vs $5.1m is nothing. Log scale matches how liquidity
 * actually feels — $100k scores 25, $1m scores 50, $10m scores 75.
 */
export function scoreDepth(depthUsd: number): number {
  if (!Number.isFinite(depthUsd) || depthUsd <= 0) return 0;
  const decades = Math.log10(depthUsd);
  // 10^4 ($10k) -> 0, 10^8 ($100m) -> 100
  return clamp(((decades - 4) / 4) * 100);
}

/** Spread -> 0..100. Tight is good, so the scale is inverted. */
export function scoreSpread(spreadPct: number): number {
  if (!Number.isFinite(spreadPct) || spreadPct < 0) return 0;
  if (spreadPct <= SPREAD_BOUNDS.tight) return 100;
  if (spreadPct >= SPREAD_BOUNDS.wide) return 0;
  const span = SPREAD_BOUNDS.wide - SPREAD_BOUNDS.tight;
  return clamp(100 - ((spreadPct - SPREAD_BOUNDS.tight) / span) * 100);
}

/** 24h volume -> 0..100, also log-scaled. $1m -> 25, $100m -> 62.5, $1bn -> 75. */
export function scoreVolume(volumeUsd: number): number {
  if (!Number.isFinite(volumeUsd) || volumeUsd <= 0) return 0;
  const decades = Math.log10(volumeUsd);
  // 10^5 ($100k) -> 0, 10^13 ($10T) -> 100
  return clamp(((decades - 5) / 8) * 100);
}

export function computeLiquidityScore(input: LiquidityInput, now = Date.now()): LiquidityScore {
  const components: { name: string; value: number; weight: number }[] = [];
  const missing: string[] = [];

  if (input.depthUsd != null) {
    components.push({ name: 'Order book depth', value: scoreDepth(input.depthUsd), weight: LIQUIDITY_WEIGHTS.orderBookDepth });
  } else missing.push('order book depth');

  if (input.spreadPct != null) {
    components.push({ name: 'Spread', value: scoreSpread(input.spreadPct), weight: LIQUIDITY_WEIGHTS.spread });
  } else missing.push('spread');

  if (input.cexVolume24hUsd != null) {
    components.push({ name: 'CEX volume', value: scoreVolume(input.cexVolume24hUsd), weight: LIQUIDITY_WEIGHTS.cexVolume });
  } else missing.push('CEX volume');

  if (input.stablecoinScore != null) {
    components.push({ name: 'Stablecoin liquidity', value: input.stablecoinScore, weight: LIQUIDITY_WEIGHTS.stablecoinLiquidity });
  } else missing.push('stablecoin liquidity');

  if (input.defiScore != null) {
    components.push({ name: 'DEX liquidity', value: input.defiScore, weight: LIQUIDITY_WEIGHTS.dexLiquidity });
  } else missing.push('DEX liquidity');

  const wsum = components.reduce((s, c) => s + c.weight, 0);
  const score = wsum > 0
    ? clamp(components.reduce((s, c) => s + c.value * c.weight, 0) / wsum)
    : 50;

  return {
    score,
    direction: liquidityDirection(input),
    components,
    missing,
    depthUsd: input.depthUsd,
    spreadPct: input.spreadPct,
    scoredAt: now,
  };
}

/**
 * Expanding or contracting?
 *
 * Judged on CHANGE, not level: a deep market getting thinner is contracting
 * liquidity even while it still scores well on depth, and that is exactly the
 * condition worth warning about.
 */
export function liquidityDirection(input: LiquidityInput): LiquidityDirection {
  const signals: number[] = [];

  if (input.cexVolume24hUsd != null && input.cexVolume7dAgoUsd != null && input.cexVolume7dAgoUsd > 0) {
    const change = ((input.cexVolume24hUsd - input.cexVolume7dAgoUsd) / input.cexVolume7dAgoUsd) * 100;
    signals.push(scaleAround(change, 0, 50));
  }
  // The stablecoin and DeFi scores are already change-based.
  if (input.stablecoinScore != null) signals.push(input.stablecoinScore);
  if (input.defiScore != null) signals.push(input.defiScore);

  if (signals.length === 0) return 'stable';
  const avg = signals.reduce((s, v) => s + v, 0) / signals.length;
  if (avg >= 60) return 'expanding';
  if (avg <= 40) return 'contracting';
  return 'stable';
}
