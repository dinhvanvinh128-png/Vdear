/**
 * Rolling z-score — the backbone of every anomaly check in VDEAR
 * (volume spikes, on-chain activity, stablecoin supply moves, whale bursts).
 *
 * Using a z-score rather than a fixed threshold is deliberate: "volume > $1B"
 * means something different for BTC than for a mid-cap, and something different
 * in a bull market than in a dead one. A z-score is self-calibrating.
 */
import { filled, mean, stdev, type IndicatorSeries, type Series } from '@/lib/indicators/series';

/** z-score of each point against the `lookback` points BEFORE it. */
export function rollingZScore(values: Series, lookback = 30): IndicatorSeries {
  const out = filled(values.length);
  if (lookback < 2) return out;
  for (let i = lookback; i < values.length; i++) {
    const window = values.slice(i - lookback, i);
    const m = mean(window);
    const s = stdev(window);
    if (m == null || s == null || s === 0) continue;
    out[i] = (values[i]! - m) / s;
  }
  return out;
}

/** z-score of the final value against the preceding `lookback` values. */
export function latestZScore(values: Series, lookback = 30): number | null {
  if (values.length < lookback + 1) return null;
  const window = values.slice(values.length - 1 - lookback, values.length - 1);
  const m = mean(window);
  const s = stdev(window);
  if (m == null || s == null || s === 0) return null;
  return (values[values.length - 1]! - m) / s;
}

export type AnomalyLabel = 'spike' | 'expansion' | 'normal' | 'contraction' | 'drought';

export interface AnomalyThresholds {
  spike: number;
  expansion: number;
  contraction: number;
  drought: number;
}

export const DEFAULT_ANOMALY: AnomalyThresholds = {
  spike: 2.5,
  expansion: 1.0,
  contraction: -1.0,
  drought: -2.0,
};

export function classifyAnomaly(
  z: number | null,
  t: AnomalyThresholds = DEFAULT_ANOMALY,
): AnomalyLabel | null {
  if (z == null) return null; // not enough history — say nothing rather than guess
  if (z >= t.spike) return 'spike';
  if (z >= t.expansion) return 'expansion';
  if (z <= t.drought) return 'drought';
  if (z <= t.contraction) return 'contraction';
  return 'normal';
}
