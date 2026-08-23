/**
 * Market structure from swing points: HH / HL / LH / LL.
 *
 * A "swing high" is a bar whose high is the highest within +/- `strength` bars.
 * Structure is what separates a trending market from a strong-looking bounce in
 * a downtrend, so the Trend Score uses it alongside the moving averages rather
 * than trusting price-vs-EMA alone.
 */

export interface StructureBar {
  high: number;
  low: number;
  close: number;
}

export interface SwingPoint {
  index: number;
  price: number;
  kind: 'high' | 'low';
}

export type StructureLabel =
  | 'uptrend'        // higher highs AND higher lows
  | 'downtrend'      // lower highs AND lower lows
  | 'range'          // neither sequence is consistent
  | 'reversal_up'    // was making lower lows, last low is higher
  | 'reversal_down'  // was making higher highs, last high is lower
  | 'undefined';     // not enough swings to say anything

export interface StructureResult {
  label: StructureLabel;
  swings: SwingPoint[];
  highs: number[];
  lows: number[];
  /** 0..100 — how cleanly the structure holds. Null when undefined. */
  strength: number | null;
}

export function findSwings(bars: readonly StructureBar[], strength = 3): SwingPoint[] {
  const out: SwingPoint[] = [];
  if (bars.length < strength * 2 + 1) return out;
  for (let i = strength; i < bars.length - strength; i++) {
    const b = bars[i]!;
    let isHigh = true;
    let isLow = true;
    for (let j = i - strength; j <= i + strength; j++) {
      if (j === i) continue;
      if (bars[j]!.high >= b.high) isHigh = false;
      if (bars[j]!.low <= b.low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) out.push({ index: i, price: b.high, kind: 'high' });
    else if (isLow) out.push({ index: i, price: b.low, kind: 'low' });
  }
  return out;
}

export function analyzeStructure(bars: readonly StructureBar[], strength = 3): StructureResult {
  const swings = findSwings(bars, strength);
  const highs = swings.filter((s) => s.kind === 'high').map((s) => s.price);
  const lows = swings.filter((s) => s.kind === 'low').map((s) => s.price);

  if (highs.length < 2 || lows.length < 2) {
    return { label: 'undefined', swings, highs, lows, strength: null };
  }

  const hh = highs[highs.length - 1]! > highs[highs.length - 2]!;
  const hl = lows[lows.length - 1]! > lows[lows.length - 2]!;
  const lh = highs[highs.length - 1]! < highs[highs.length - 2]!;
  const ll = lows[lows.length - 1]! < lows[lows.length - 2]!;

  let label: StructureLabel;
  if (hh && hl) label = 'uptrend';
  else if (lh && ll) label = 'downtrend';
  else if (hl && lh) label = 'reversal_up';   // lows rising while highs cap: compression up
  else if (hh && ll) label = 'reversal_down'; // highs rising while lows break: distribution
  else label = 'range';

  return { label, swings, highs, lows, strength: consistency(highs, lows, label) };
}

/** Share of recent swing pairs that agree with the label, as 0..100. */
function consistency(highs: number[], lows: number[], label: StructureLabel): number | null {
  if (label === 'undefined') return null;
  const up = label === 'uptrend' || label === 'reversal_up';
  const down = label === 'downtrend' || label === 'reversal_down';
  if (!up && !down) return 50; // a range is, by definition, neutral

  let agree = 0;
  let total = 0;
  const check = (arr: number[]) => {
    for (let i = 1; i < arr.length; i++) {
      total++;
      const rising = arr[i]! > arr[i - 1]!;
      if ((up && rising) || (down && !rising)) agree++;
    }
  };
  check(highs.slice(-4));
  check(lows.slice(-4));
  return total === 0 ? null : (agree / total) * 100;
}
