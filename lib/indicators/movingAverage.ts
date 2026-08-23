/** Simple and exponential moving averages. */
import { filled, type IndicatorSeries, type Series } from '@/lib/indicators/series';

export function sma(values: Series, period: number): IndicatorSeries {
  const out = filled(values.length);
  if (period <= 0 || values.length < period) return out;
  let window = 0;
  for (let i = 0; i < values.length; i++) {
    window += values[i]!;
    if (i >= period) window -= values[i - period]!;
    if (i >= period - 1) out[i] = window / period;
  }
  return out;
}

/**
 * EMA seeded with the SMA of the first `period` bars (Wilder/TA-Lib convention),
 * so the value at index period-1 matches every charting package.
 */
export function ema(values: Series, period: number): IndicatorSeries {
  const out = filled(values.length);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i]!;
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's smoothing (used by RSI / ATR / ADX): alpha = 1/period. */
export function wilder(values: Series, period: number): IndicatorSeries {
  const out = filled(values.length);
  if (period <= 0 || values.length < period) return out;
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i]!;
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = prev + (values[i]! - prev) / period;
    out[i] = prev;
  }
  return out;
}
