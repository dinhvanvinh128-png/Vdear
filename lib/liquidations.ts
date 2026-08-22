/**
 * Exchange-derived liquidation ESTIMATOR (fallback when CoinGlass is not set).
 *
 * IMPORTANT: this is a transparent heuristic, NOT real liquidation data. It maps
 * open interest onto the price levels where common leverage tiers would be
 * force-liquidated. Every value it produces is flagged `estimated`. When a
 * CoinGlass key is configured, real data supersedes this (see lib/coinglass).
 *
 * Model: assume a distribution of leverage among open positions; each tier's
 * liquidation price sits ~ (1/leverage) away from entry (entry ≈ current price
 * as a first-order proxy). Longs liquidate below price, shorts above.
 */
import type { LiquidationZone } from '@/lib/types';

// Assumed share of OI at each leverage tier (sums to 1). Tunable.
const LEVERAGE_MIX: { lev: number; weight: number }[] = [
  { lev: 5, weight: 0.12 },
  { lev: 10, weight: 0.24 },
  { lev: 20, weight: 0.28 },
  { lev: 25, weight: 0.12 },
  { lev: 50, weight: 0.14 },
  { lev: 100, weight: 0.10 },
];

// Maintenance-margin cushion so liquidation sits slightly nearer than 1/lev.
const MMR = 0.005;

export interface LiquidationMapData {
  coin: string;
  currentPrice: number;
  longZones: LiquidationZone[]; // below price
  shortZones: LiquidationZone[]; // above price
  totalOiUsd: number;
  estimated: boolean;
}

function tierPrice(price: number, lev: number, side: 'long' | 'short'): number {
  const dist = 1 / lev - MMR;
  return side === 'long' ? price * (1 - dist) : price * (1 + dist);
}

export function estimateMap(coin: string, price: number, oiUsd: number): LiquidationMapData {
  const longZones: LiquidationZone[] = [];
  const shortZones: LiquidationZone[] = [];
  if (price > 0 && oiUsd > 0) {
    // Split OI 50/50 long/short as a neutral prior.
    const perSide = oiUsd / 2;
    const maxWeight = Math.max(...LEVERAGE_MIX.map((m) => m.weight));
    for (const { lev, weight } of LEVERAGE_MIX) {
      const est = perSide * weight;
      const intensity = weight / maxWeight;
      longZones.push({ price: tierPrice(price, lev, 'long'), side: 'long', estValueUsd: est, intensity });
      shortZones.push({ price: tierPrice(price, lev, 'short'), side: 'short', estValueUsd: est, intensity });
    }
  }
  longZones.sort((a, b) => b.price - a.price); // nearest (just below price) first
  shortZones.sort((a, b) => a.price - b.price); // nearest (just above price) first
  return { coin, currentPrice: price, longZones, shortZones, totalOiUsd: oiUsd, estimated: true };
}

/**
 * Estimated heatmap grid: price bands (rows) × time is not modelled here (we
 * have no historical OI stream without a data source), so we return a single
 * current-snapshot column of banded intensities suitable for a bar-style
 * heatmap. Real time-series heatmaps require CoinGlass.
 */
export function estimateHeatmapColumn(price: number, oiUsd: number, bands = 24): LiquidationZone[] {
  const map = estimateMap('', price, oiUsd);
  const all = [...map.longZones, ...map.shortZones];
  if (all.length === 0) return [];
  const hi = Math.max(...all.map((z) => z.price));
  const lo = Math.min(...all.map((z) => z.price));
  if (hi <= lo) return [];
  const step = (hi - lo) / bands;
  const rows: LiquidationZone[] = [];
  for (let i = 0; i < bands; i++) {
    const bandLo = lo + step * i;
    const bandHi = bandLo + step;
    const inBand = all.filter((z) => z.price >= bandLo && z.price < bandHi);
    const val = inBand.reduce((s, z) => s + z.estValueUsd, 0);
    const side: 'long' | 'short' = (bandLo + bandHi) / 2 < price ? 'long' : 'short';
    rows.push({ price: (bandLo + bandHi) / 2, side, estValueUsd: val, intensity: 0 });
  }
  const maxVal = Math.max(...rows.map((r) => r.estValueUsd), 1);
  return rows.map((r) => ({ ...r, intensity: r.estValueUsd / maxVal })).reverse();
}
