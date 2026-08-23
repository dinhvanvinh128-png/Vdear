/**
 * Volume-Weighted Average Price — session, daily, weekly (spec: VWAP section).
 *
 * VWAP resets at the start of each session. Everything is computed from real
 * candle timestamps in UTC; there is no assumed "market open", because crypto
 * has none — the daily anchor is 00:00 UTC, which is what every venue rolls
 * its 24h statistics on.
 */
import { filled, type IndicatorSeries } from '@/lib/indicators/series';

export interface VwapBar {
  /** Seconds epoch (matches lib/types Candle.time). */
  time: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type VwapAnchor = 'session' | 'daily' | 'weekly';

/** Typical price — the standard VWAP input. */
export function typicalPrice(b: VwapBar): number {
  return (b.high + b.low + b.close) / 3;
}

const DAY_SECONDS = 86_400;
const WEEK_SECONDS = DAY_SECONDS * 7;
/**
 * 1970-01-01 was a Thursday, i.e. 3 days into a Monday-start week. Shifting the
 * epoch by 3 days puts every week boundary on Monday 00:00 UTC.
 */
const MONDAY_OFFSET = DAY_SECONDS * 3;

function bucketOf(timeSeconds: number, anchor: VwapAnchor): number {
  if (anchor === 'daily') return Math.floor(timeSeconds / DAY_SECONDS);
  if (anchor === 'weekly') return Math.floor((timeSeconds + MONDAY_OFFSET) / WEEK_SECONDS);
  return 0; // 'session' = the whole supplied range, one continuous accumulation
}

/**
 * Rolling VWAP, reset at each anchor boundary.
 * Bars with zero volume contribute nothing but do not break the accumulation.
 */
export function vwap(bars: readonly VwapBar[], anchor: VwapAnchor = 'daily'): IndicatorSeries {
  const out = filled(bars.length);
  let bucket: number | null = null;
  let pv = 0;
  let vol = 0;

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    const thisBucket = bucketOf(b.time, anchor);
    if (bucket === null || thisBucket !== bucket) {
      bucket = thisBucket;
      pv = 0;
      vol = 0;
    }
    const v = Number.isFinite(b.volume) && b.volume > 0 ? b.volume : 0;
    pv += typicalPrice(b) * v;
    vol += v;
    out[i] = vol > 0 ? pv / vol : null;
  }
  return out;
}

/** Current price relative to VWAP, in percent. Positive = trading above VWAP. */
export function vwapDeviation(price: number, vwapValue: number | null): number | null {
  if (vwapValue == null || vwapValue === 0 || !Number.isFinite(price)) return null;
  return ((price - vwapValue) / vwapValue) * 100;
}
