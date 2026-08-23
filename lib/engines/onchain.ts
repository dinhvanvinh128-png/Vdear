/**
 * ON-CHAIN ENGINE (spec: ON-CHAIN DATA).
 *
 * Network activity scored against its OWN 30-day baseline via z-scores, not
 * against absolute thresholds: 900k active addresses is normal for BTC and
 * impossible for a mid-cap, and what counts as "busy" changes with the cycle.
 *
 * Every series arrives through the OnChainProvider resolver, so the score
 * records which vendor answered for each metric. A metric nobody could serve is
 * absent from the breakdown — it is never defaulted to a neutral 50.
 */
import type { OnChainMetric, OnChainSeries } from '@/lib/providers/onchain/types';
import { latestZScore } from '@/lib/indicators/zscore';
import { clamp, pctChange, scaleAround } from '@/lib/indicators/series';
import type { ProviderId } from '@/lib/providers/types';

export interface OnChainMetricResult {
  metric: OnChainMetric;
  latest: number;
  /** Percent change vs 7 and 30 days ago, when the history reaches back. */
  change7d: number | null;
  change30d: number | null;
  /** z-score of the latest value against the trailing baseline. */
  zScore: number | null;
  source: ProviderId;
  observedAt: number;
}

export interface OnChainMetrics {
  asset: string;
  metrics: OnChainMetricResult[];
  /** 0..100. */
  score: number;
  /** Metrics that no configured provider could supply. */
  missing: OnChainMetric[];
  sources: ProviderId[];
  observedAt: number;
}

/** Metrics that feed the score, and how much each contributes. */
export const ONCHAIN_WEIGHTS: Partial<Record<OnChainMetric, number>> = {
  activeAddresses: 0.3,
  newAddresses: 0.2,
  txCount: 0.2,
  transferValueUsd: 0.2,
  feesUsd: 0.1,
};

function valueAt(points: { time: number; value: number }[], daysBack: number): number | null {
  if (points.length === 0) return null;
  const target = points[points.length - 1]!.time - daysBack * 86_400_000;
  // Nearest point at or before the target; null if the history is too short.
  let best: number | null = null;
  for (const p of points) {
    if (p.time <= target) best = p.value;
    else break;
  }
  return best;
}

export function summarizeMetric(series: OnChainSeries, lookback = 30): OnChainMetricResult | null {
  const points = series.points;
  if (points.length === 0) return null;
  const latestPoint = points[points.length - 1]!;
  const values = points.map((p) => p.value);
  return {
    metric: series.metric,
    latest: latestPoint.value,
    change7d: pctChange(valueAt(points, 7), latestPoint.value),
    change30d: pctChange(valueAt(points, 30), latestPoint.value),
    zScore: latestZScore(values, Math.min(lookback, Math.max(2, values.length - 1))),
    source: series.source,
    observedAt: latestPoint.time,
  };
}

export function computeOnChainMetrics(
  asset: string,
  resolved: Partial<Record<OnChainMetric, OnChainSeries>>,
  requested: readonly OnChainMetric[] = Object.keys(ONCHAIN_WEIGHTS) as OnChainMetric[],
  now = Date.now(),
): OnChainMetrics {
  const metrics: OnChainMetricResult[] = [];
  const missing: OnChainMetric[] = [];

  for (const metric of requested) {
    const series = resolved[metric];
    const summary = series ? summarizeMetric(series) : null;
    if (summary) metrics.push(summary);
    else missing.push(metric);
  }

  return {
    asset: asset.toUpperCase(),
    metrics,
    score: scoreOnChain(metrics),
    missing,
    sources: Array.from(new Set(metrics.map((m) => m.source))),
    observedAt: metrics.length > 0 ? Math.max(...metrics.map((m) => m.observedAt)) : now,
  };
}

/**
 * 0..100 from z-scores, blended with the 30d trend.
 *
 * A z of ±2 is treated as full scale — two standard deviations above a 30-day
 * baseline is genuinely unusual network activity.
 */
export function scoreOnChain(metrics: readonly OnChainMetricResult[]): number {
  const parts: { value: number; weight: number }[] = [];

  for (const m of metrics) {
    const weight = ONCHAIN_WEIGHTS[m.metric] ?? 0.1;
    const sub: number[] = [];
    if (m.zScore != null) sub.push(scaleAround(m.zScore, 0, 2));
    if (m.change30d != null) sub.push(scaleAround(m.change30d, 0, 40));
    if (sub.length === 0) continue;
    parts.push({ value: sub.reduce((s, v) => s + v, 0) / sub.length, weight });
  }

  if (parts.length === 0) return 50;
  const wsum = parts.reduce((s, p) => s + p.weight, 0);
  return clamp(parts.reduce((s, p) => s + p.value * p.weight, 0) / wsum);
}
