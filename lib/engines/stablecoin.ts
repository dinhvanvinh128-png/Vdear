/**
 * STABLECOIN LIQUIDITY ENGINE (spec: STABLECOIN LIQUIDITY).
 *
 * Stablecoin supply is the closest thing crypto has to a money-supply figure:
 * new supply is capital arriving and waiting, shrinking supply is capital
 * leaving. It leads price far more reliably than price leads it, which is why
 * it carries 15% of the Money Flow Score.
 *
 * Expansion vs contraction is judged on the 7d and 30d windows rather than 1d —
 * daily mint/burn is operational noise (redemptions, chain migrations).
 */
import type { StablecoinSupply } from '@/lib/providers/defillama/types';
import { clamp, scaleAround } from '@/lib/indicators/series';

export type LiquidityDirection = 'expansion' | 'contraction' | 'stable';

export interface StablecoinMetrics {
  totalUsd: number;
  change1d: number | null;
  change7d: number | null;
  change30d: number | null;
  /** Absolute USD added/removed over each window. */
  net7dUsd: number | null;
  net30dUsd: number | null;
  direction: LiquidityDirection;
  /** Supply concentration — top asset's share of the total, 0..100. */
  topAssetShare: number | null;
  topAssets: { symbol: string; usd: number; share: number }[];
  byChain: { chain: string; usd: number; share: number }[];
  score: number;
  observedAt: number;
}

/**
 * A move under this over 7 days is operational noise, not a liquidity trend.
 * Total stablecoin supply is ~$150-250bn; 0.5% is ~$1bn, which is roughly the
 * scale of ordinary weekly mint/burn activity.
 */
export const STABLE_NOISE_PCT = 0.5;

export function directionOf(change7d: number | null, change30d: number | null): LiquidityDirection {
  const primary = change7d ?? change30d;
  if (primary == null) return 'stable';
  if (primary > STABLE_NOISE_PCT) return 'expansion';
  if (primary < -STABLE_NOISE_PCT) return 'contraction';
  return 'stable';
}

export function computeStablecoinMetrics(supply: StablecoinSupply): StablecoinMetrics {
  const topAssets = supply.assets.slice(0, 8).map((a) => ({
    symbol: a.symbol,
    usd: a.circulating,
    share: supply.totalUsd > 0 ? (a.circulating / supply.totalUsd) * 100 : 0,
  }));

  const metrics: Omit<StablecoinMetrics, 'score'> = {
    totalUsd: supply.totalUsd,
    change1d: supply.change1d,
    change7d: supply.change7d,
    change30d: supply.change30d,
    net7dUsd: supply.totalPrevWeek > 0 ? supply.totalUsd - supply.totalPrevWeek : null,
    net30dUsd: supply.totalPrevMonth > 0 ? supply.totalUsd - supply.totalPrevMonth : null,
    direction: directionOf(supply.change7d, supply.change30d),
    topAssetShare: topAssets[0]?.share ?? null,
    topAssets,
    byChain: supply.byChain.slice(0, 10),
    observedAt: supply.observedAt,
  };

  return { ...metrics, score: scoreStablecoin(metrics) };
}

/**
 * 0..100. 50 = flat supply.
 *
 * ±2% over 7d and ±5% over 30d are treated as the full-scale moves: total
 * stablecoin supply is enormous and slow, so a 2% weekly change is already a
 * significant capital rotation, not a marginal one.
 */
export function scoreStablecoin(m: Omit<StablecoinMetrics, 'score'>): number {
  const parts: { value: number; weight: number }[] = [];
  if (m.change7d != null) parts.push({ value: scaleAround(m.change7d, 0, 2), weight: 0.6 });
  if (m.change30d != null) parts.push({ value: scaleAround(m.change30d, 0, 5), weight: 0.4 });
  // 1d only as a tiebreaker when nothing longer is available.
  if (parts.length === 0 && m.change1d != null) {
    parts.push({ value: scaleAround(m.change1d, 0, 0.5), weight: 1 });
  }
  if (parts.length === 0) return 50;

  const wsum = parts.reduce((s, p) => s + p.weight, 0);
  return clamp(parts.reduce((s, p) => s + p.value * p.weight, 0) / wsum);
}
