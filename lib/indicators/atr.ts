/** True Range and Wilder-smoothed ATR. */
import { filled, type IndicatorSeries } from '@/lib/indicators/series';

export interface Bar {
  high: number;
  low: number;
  close: number;
}

export function trueRange(bars: readonly Bar[]): IndicatorSeries {
  const out = filled(bars.length);
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    if (i === 0) {
      out[i] = b.high - b.low;
      continue;
    }
    const prevClose = bars[i - 1]!.close;
    out[i] = Math.max(
      b.high - b.low,
      Math.abs(b.high - prevClose),
      Math.abs(b.low - prevClose),
    );
  }
  return out;
}

export function atr(bars: readonly Bar[], period = 14): IndicatorSeries {
  const out = filled(bars.length);
  if (period <= 0 || bars.length < period + 1) return out;
  const tr = trueRange(bars);

  let seed = 0;
  for (let i = 1; i <= period; i++) seed += tr[i] ?? 0;
  let prev = seed / period;
  out[period] = prev;

  for (let i = period + 1; i < bars.length; i++) {
    prev = (prev * (period - 1) + (tr[i] ?? 0)) / period;
    out[i] = prev;
  }
  return out;
}

/** ATR as a percentage of price — the comparable form across assets. */
export function atrPercent(bars: readonly Bar[], period = 14): IndicatorSeries {
  const a = atr(bars, period);
  return a.map((v, i) => {
    const c = bars[i]?.close;
    if (v == null || c == null || c === 0) return null;
    return (v / c) * 100;
  });
}
