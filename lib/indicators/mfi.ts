/**
 * Money Flow Index — volume-weighted RSI.
 *
 * Why this exists alongside CVD: only Binance publishes a taker-buy split, so
 * for most pairs the exact buy/sell breakdown simply does not exist. MFI infers
 * direction from where the typical price moved instead of from who crossed the
 * spread, which means it needs nothing but OHLCV — data every venue publishes.
 *
 * It is strictly the weaker measurement and must never be presented as CVD. A
 * bar that closes up is counted entirely as inflow even if most of its volume
 * was aggressive selling into a bid-driven rally; CVD would know the difference.
 * MFI is what you use when the better instrument is unavailable, and the reading
 * carries lower confidence to say so.
 */
import { filled, type IndicatorSeries } from '@/lib/indicators/series';
import { typicalPrice } from '@/lib/indicators/vwap';

/**
 * MFI needs the same OHLC a VWAP bar carries, plus the bar's volume, so it
 * reuses vwap.ts's `typicalPrice` rather than defining a second one — the
 * barrel re-exports both modules, and two functions of that name would collide.
 */
export interface MfiBar {
  high: number;
  low: number;
  close: number;
  /** Quote volume for the bar. */
  volume: number;
}

/**
 * Wilder's MFI over `period` bars.
 *
 * Follows the indicator contract in series.ts: same length as the input, null
 * through the warm-up. The first defined value lands at index `period`, because
 * the direction of bar 0 is unknowable without a prior bar.
 */
export function mfi(bars: readonly MfiBar[], period = 14): IndicatorSeries {
  const out = filled(bars.length);
  if (period <= 0 || bars.length <= period) return out;

  const tp = bars.map((b) => typicalPrice(b));
  const raw = bars.map((b, i) => tp[i]! * b.volume);

  for (let i = period; i < bars.length; i++) {
    let positive = 0;
    let negative = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const now = tp[j]!;
      const prev = tp[j - 1]!;
      // An unchanged typical price is neither inflow nor outflow. Assigning it
      // to a side would be inventing a direction the bar did not express.
      if (now > prev) positive += raw[j]!;
      else if (now < prev) negative += raw[j]!;
    }

    const total = positive + negative;
    // A window with no directional volume at all has no money flow to index.
    // Null, not 50 — the same rule the whole platform runs on.
    out[i] = total === 0 ? null : (positive / total) * 100;
  }
  return out;
}

/**
 * Map an MFI reading onto VDEAR's 0..100 flow score.
 *
 * MFI is already 0..100 and already oriented the right way — 100 is pure
 * inflow — so this is deliberately the identity, not a rescale. It exists as a
 * named function so the mapping is one visible decision rather than an implicit
 * assumption scattered across callers, and so a future recalibration has one
 * place to live.
 */
export function scoreMfi(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, value));
}
