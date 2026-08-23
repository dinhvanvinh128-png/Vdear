/**
 * Shared conventions for every VDEAR indicator.
 *
 * RULE: an indicator returns an array the SAME LENGTH as its input, with `null`
 * for every bar inside the warm-up period. It never back-fills, never seeds with
 * a zero, and never shortens the series. Downstream scoring can then tell
 * "not enough history yet" apart from "the value is 0" — which is the difference
 * between honestly withholding a score and inventing one.
 */

export type Series = readonly number[];
/** Same length as the input; null where the value is not yet defined. */
export type IndicatorSeries = (number | null)[];

export function filled(length: number): IndicatorSeries {
  return new Array<number | null>(length).fill(null);
}

/** Last defined value of an indicator series, or null if there is none. */
export function last(series: IndicatorSeries): number | null {
  for (let i = series.length - 1; i >= 0; i--) {
    const v = series[i];
    if (v != null && Number.isFinite(v)) return v;
  }
  return null;
}

/** Value `n` bars back from the end, or null. */
export function nth(series: IndicatorSeries, fromEnd: number): number | null {
  const i = series.length - 1 - fromEnd;
  if (i < 0 || i >= series.length) return null;
  const v = series[i];
  return v != null && Number.isFinite(v) ? v : null;
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Percentage change from `from` to `to`. Null when `from` is 0 or missing. */
export function pctChange(from: number | null, to: number | null): number | null {
  if (from == null || to == null || !Number.isFinite(from) || !Number.isFinite(to)) return null;
  if (from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

/** Clamp to [min, max]. Used everywhere a 0..100 score is produced. */
export function clamp(v: number, min = 0, max = 100): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

/**
 * Map a value onto 0..100 by linear interpolation between `lo` and `hi`.
 * Values at or below `lo` score 0; at or above `hi` score 100.
 */
export function scale(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value) || hi === lo) return 50;
  return clamp(((value - lo) / (hi - lo)) * 100);
}

/** Symmetric version: `center` scores 50, ±`span` reaches 0 / 100. */
export function scaleAround(value: number, center: number, span: number): number {
  if (!Number.isFinite(value) || span === 0) return 50;
  return clamp(50 + ((value - center) / span) * 50);
}

export function mean(values: Series): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Population standard deviation. */
export function stdev(values: Series): number | null {
  const m = mean(values);
  if (m == null || values.length === 0) return null;
  let acc = 0;
  for (const v of values) acc += (v - m) ** 2;
  return Math.sqrt(acc / values.length);
}

export function sum(values: Series): number {
  let s = 0;
  for (const v of values) s += v;
  return s;
}
