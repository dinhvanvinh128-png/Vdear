/**
 * DEFI LIQUIDITY ENGINE (spec: DEFI DATA).
 *
 * TVL and DEX activity are the on-chain mirror of CEX liquidity: capital that
 * is deployed rather than parked. Rising TVL with rising DEX volume is risk
 * appetite; rising TVL with falling volume is capital sitting still.
 */
import type { DexVolume, TvlSnapshot } from '@/lib/providers/defillama/types';
import type { DexActivity } from '@/lib/providers/geckoterminal/types';
import { clamp, scaleAround } from '@/lib/indicators/series';

export interface DefiMetrics {
  tvlUsd: number | null;
  tvlChange1d: number | null;
  tvlChange7d: number | null;
  tvlChange30d: number | null;
  topChains: { name: string; tvl: number; share: number }[];

  dexVolume24h: number | null;
  dexVolumeChange1d: number | null;
  dexVolumeChange7d: number | null;
  topDexes: { name: string; volume24h: number }[];

  /** From GeckoTerminal pools, when available. */
  poolLiquidityUsd: number | null;
  dexBuyRatio: number | null;
  dexBuyers24h: number | null;
  dexSellers24h: number | null;

  score: number;
  /** Which inputs actually contributed — the rest are absent, not zero. */
  inputs: string[];
  observedAt: number;
}

export function computeDefiMetrics(
  tvl: TvlSnapshot | null,
  dex: DexVolume | null,
  pools: DexActivity | null,
  now = Date.now(),
): DefiMetrics {
  const inputs: string[] = [];
  if (tvl) inputs.push('tvl');
  if (dex) inputs.push('dex_volume');
  if (pools) inputs.push('pool_activity');

  const topChains = (tvl?.chains ?? []).slice(0, 8).map((c) => ({
    name: c.name,
    tvl: c.tvl,
    share: tvl && tvl.totalUsd > 0 ? (c.tvl / tvl.totalUsd) * 100 : 0,
  }));

  const metrics: Omit<DefiMetrics, 'score'> = {
    tvlUsd: tvl?.totalUsd ?? null,
    tvlChange1d: tvl?.change1d ?? null,
    tvlChange7d: tvl?.change7d ?? null,
    tvlChange30d: tvl?.change30d ?? null,
    topChains,
    dexVolume24h: dex?.total24h ?? null,
    dexVolumeChange1d: dex?.change1d ?? null,
    dexVolumeChange7d: dex?.change7d ?? null,
    topDexes: (dex?.protocols ?? []).slice(0, 8).map((p) => ({ name: p.name, volume24h: p.volume24h })),
    poolLiquidityUsd: pools?.totalLiquidityUsd ?? null,
    dexBuyRatio: pools?.buyRatio ?? null,
    dexBuyers24h: pools?.totalBuyers24h ?? null,
    dexSellers24h: pools?.totalSellers24h ?? null,
    inputs,
    observedAt: now,
  };

  return { ...metrics, score: scoreDefi(metrics) };
}

/** 0..100. Missing inputs are dropped and weights renormalised. */
export function scoreDefi(m: Omit<DefiMetrics, 'score'>): number {
  const parts: { value: number; weight: number }[] = [];

  // TVL moves slowly; ±5% over 7d is a large shift.
  if (m.tvlChange7d != null) parts.push({ value: scaleAround(m.tvlChange7d, 0, 5), weight: 0.3 });
  if (m.tvlChange1d != null) parts.push({ value: scaleAround(m.tvlChange1d, 0, 2), weight: 0.15 });
  // DEX volume is far more volatile; ±40% day-over-day is routine.
  if (m.dexVolumeChange1d != null) parts.push({ value: scaleAround(m.dexVolumeChange1d, 0, 40), weight: 0.25 });
  if (m.dexVolumeChange7d != null) parts.push({ value: scaleAround(m.dexVolumeChange7d, 0, 30), weight: 0.15 });
  // On-chain taker skew, where pool data is available.
  if (m.dexBuyRatio != null) parts.push({ value: scaleAround(m.dexBuyRatio, 0.5, 0.15), weight: 0.15 });

  if (parts.length === 0) return 50;
  const wsum = parts.reduce((s, p) => s + p.weight, 0);
  return clamp(parts.reduce((s, p) => s + p.value * p.weight, 0) / wsum);
}
