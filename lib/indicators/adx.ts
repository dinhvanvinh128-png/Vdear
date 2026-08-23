/**
 * Wilder's ADX with +DI / -DI.
 *
 * VDEAR uses ADX only as a TREND-STRENGTH gate, never as a direction signal:
 * a high Trend Score with ADX < 20 is a range, not a trend, and the regime
 * engine downgrades it accordingly.
 */
import { filled, type IndicatorSeries } from '@/lib/indicators/series';
import { trueRange, type Bar } from '@/lib/indicators/atr';

export interface AdxResult {
  adx: IndicatorSeries;
  plusDi: IndicatorSeries;
  minusDi: IndicatorSeries;
}

export function adx(bars: readonly Bar[], period = 14): AdxResult {
  const n = bars.length;
  const result: AdxResult = { adx: filled(n), plusDi: filled(n), minusDi: filled(n) };
  if (period <= 0 || n < period * 2) return result;

  const tr = trueRange(bars);
  const plusDm: number[] = new Array(n).fill(0);
  const minusDm: number[] = new Array(n).fill(0);

  for (let i = 1; i < n; i++) {
    const up = bars[i]!.high - bars[i - 1]!.high;
    const down = bars[i - 1]!.low - bars[i]!.low;
    plusDm[i] = up > down && up > 0 ? up : 0;
    minusDm[i] = down > up && down > 0 ? down : 0;
  }

  // Wilder's running sums, seeded over the first `period` bars after index 0.
  let trSum = 0;
  let plusSum = 0;
  let minusSum = 0;
  for (let i = 1; i <= period; i++) {
    trSum += tr[i] ?? 0;
    plusSum += plusDm[i]!;
    minusSum += minusDm[i]!;
  }

  const dx: (number | null)[] = filled(n);
  for (let i = period; i < n; i++) {
    if (i > period) {
      trSum = trSum - trSum / period + (tr[i] ?? 0);
      plusSum = plusSum - plusSum / period + plusDm[i]!;
      minusSum = minusSum - minusSum / period + minusDm[i]!;
    }
    if (trSum === 0) continue;
    const pdi = (plusSum / trSum) * 100;
    const mdi = (minusSum / trSum) * 100;
    result.plusDi[i] = pdi;
    result.minusDi[i] = mdi;
    const denom = pdi + mdi;
    dx[i] = denom === 0 ? 0 : (Math.abs(pdi - mdi) / denom) * 100;
  }

  // ADX = Wilder smoothing of DX, seeded with the mean of the first `period` DX.
  const firstAdxIndex = period * 2 - 1;
  if (firstAdxIndex >= n) return result;
  let seed = 0;
  for (let i = period; i < firstAdxIndex + 1; i++) seed += dx[i] ?? 0;
  let prev = seed / period;
  result.adx[firstAdxIndex] = prev;
  for (let i = firstAdxIndex + 1; i < n; i++) {
    prev = (prev * (period - 1) + (dx[i] ?? 0)) / period;
    result.adx[i] = prev;
  }
  return result;
}
