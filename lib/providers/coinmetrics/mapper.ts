/** Coin Metrics timeseries -> VDEAR series. Pure. */
import { CM_METRICS, type CmMetricKey, type CmPoint } from '@/lib/providers/coinmetrics/types';

/** Reverse lookup: "AdrActCnt" -> "activeAddresses". */
export const CM_METRIC_BY_ID: Record<string, CmMetricKey> = Object.fromEntries(
  Object.entries(CM_METRICS).map(([k, v]) => [v, k as CmMetricKey]),
) as Record<string, CmMetricKey>;

/** A row is `{ asset, time, <metricId>: "<value as string>" }`. */
export interface RawCmRow {
  asset?: string;
  time?: string;
  [metric: string]: string | undefined;
}

/**
 * Coin Metrics returns numbers as strings and omits a field entirely when the
 * value is unavailable for that day. An omitted field must stay omitted — a 0
 * would read as "no on-chain activity", which is a very different claim.
 */
export function mapRows(
  rows: RawCmRow[],
  wanted: readonly CmMetricKey[],
): Partial<Record<CmMetricKey, CmPoint[]>> {
  const out: Partial<Record<CmMetricKey, CmPoint[]>> = {};
  if (!Array.isArray(rows)) return out;

  for (const row of rows) {
    const t = row?.time ? Date.parse(row.time) : NaN;
    if (!Number.isFinite(t)) continue;
    for (const key of wanted) {
      const raw = row[CM_METRICS[key]];
      if (raw == null || raw === '') continue;
      const value = typeof raw === 'number' ? raw : parseFloat(raw);
      if (!Number.isFinite(value)) continue;
      (out[key] ??= []).push({ time: t, value });
    }
  }

  for (const key of Object.keys(out) as CmMetricKey[]) {
    out[key]!.sort((a, b) => a.time - b.time);
  }
  return out;
}

export function valuesOf(points: CmPoint[] | undefined): number[] {
  return (points ?? []).map((p) => p.value);
}

export function latestOf(points: CmPoint[] | undefined): CmPoint | null {
  if (!points || points.length === 0) return null;
  return points[points.length - 1]!;
}
