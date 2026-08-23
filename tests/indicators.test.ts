/**
 * Indicator correctness, checked against hand-computable values and against the
 * conventions charting packages use (SMA-seeded EMA, Wilder smoothing).
 *
 * The warm-up contract is tested explicitly: every indicator must return `null`
 * before it has enough data, never 0 and never a back-filled value. Scoring
 * depends on being able to tell "no data yet" from "the value is zero".
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { sma, ema, wilder } from '@/lib/indicators/movingAverage';
import { rsi } from '@/lib/indicators/rsi';
import { atr, trueRange, atrPercent, type Bar } from '@/lib/indicators/atr';
import { adx } from '@/lib/indicators/adx';
import { vwap, vwapDeviation, typicalPrice, type VwapBar } from '@/lib/indicators/vwap';
import { rollingZScore, latestZScore, classifyAnomaly } from '@/lib/indicators/zscore';
import { analyzeStructure, findSwings, type StructureBar } from '@/lib/indicators/structure';
import { last, nth, mean, stdev, pctChange, clamp, scale, scaleAround } from '@/lib/indicators/series';

const close = (v: number) => v;

/* --------------------------------- helpers -------------------------------- */

test('series helpers behave at the edges', () => {
  assert.equal(last([null, 1, 2]), 2);
  assert.equal(last([1, 2, null]), 2, 'skips trailing nulls');
  assert.equal(last([null, null]), null);
  assert.equal(nth([1, 2, 3], 0), 3);
  assert.equal(nth([1, 2, 3], 2), 1);
  assert.equal(nth([1, 2, 3], 9), null);

  assert.equal(mean([1, 2, 3, 4]), 2.5);
  assert.equal(mean([]), null);
  assert.equal(stdev([2, 2, 2, 2]), 0);
  assert.equal(stdev([1, 3]), 1);

  assert.equal(pctChange(100, 110), 10);
  assert.equal(pctChange(0, 5), null, 'no percent change from zero');
  assert.equal(pctChange(null, 5), null);

  assert.equal(clamp(150), 100);
  assert.equal(clamp(-5), 0);
  assert.equal(clamp(NaN), 0);

  assert.equal(scale(5, 0, 10), 50);
  assert.equal(scale(-1, 0, 10), 0);
  assert.equal(scale(99, 0, 10), 100);
  assert.equal(scaleAround(0, 0, 10), 50);
  assert.equal(scaleAround(10, 0, 10), 100);
  assert.equal(scaleAround(-10, 0, 10), 0);
});

/* ------------------------------ moving averages --------------------------- */

test('SMA matches a hand-computed window and honours warm-up', () => {
  const v = [1, 2, 3, 4, 5, 6];
  const out = sma(v, 3);
  assert.deepEqual(out.slice(0, 2), [null, null], 'no value before the window fills');
  assert.equal(out[2], 2);  // (1+2+3)/3
  assert.equal(out[3], 3);  // (2+3+4)/3
  assert.equal(out[5], 5);  // (4+5+6)/3
  assert.equal(out.length, v.length, 'same length as input');
});

test('EMA is seeded with the SMA of the first period (TA-Lib convention)', () => {
  const v = [1, 2, 3, 4, 5];
  const out = ema(v, 3);
  assert.deepEqual(out.slice(0, 2), [null, null]);
  assert.equal(out[2], 2, 'seed = SMA(1,2,3)');
  // k = 2/(3+1) = 0.5 → 4*0.5 + 2*0.5 = 3
  assert.equal(out[3], 3);
  // 5*0.5 + 3*0.5 = 4
  assert.equal(out[4], 4);
});

test('EMA of a flat series equals that constant', () => {
  const out = ema(new Array(50).fill(42), 20);
  assert.equal(out[49], 42);
});

test('moving averages return all-null when there is not enough history', () => {
  assert.deepEqual(sma([1, 2], 5), [null, null]);
  assert.deepEqual(ema([1, 2], 5), [null, null]);
  assert.deepEqual(wilder([1, 2], 5), [null, null]);
});

test("Wilder smoothing is slower than the equivalent EMA", () => {
  const v = [10, 10, 10, 10, 10, 20, 20, 20, 20, 20];
  const w = last(wilder(v, 5))!;
  const e = last(ema(v, 5))!;
  assert.ok(w < e, `wilder ${w} should lag ema ${e} on a step up`);
});

/* ----------------------------------- RSI ---------------------------------- */

test('RSI is 100 when every bar rises and 0 when every bar falls', () => {
  const up = Array.from({ length: 30 }, (_, i) => close(100 + i));
  assert.equal(last(rsi(up, 14)), 100);

  const down = Array.from({ length: 30 }, (_, i) => close(100 - i));
  assert.equal(last(rsi(down, 14)), 0);
});

test('RSI of a flat series is neutral, not a divide-by-zero', () => {
  const flat = new Array(30).fill(100);
  const r = last(rsi(flat, 14));
  assert.equal(r, 50, 'no gains and no losses is neutral by definition');
});

test('RSI warm-up is exactly `period` bars', () => {
  const v = Array.from({ length: 20 }, (_, i) => 100 + (i % 3));
  const out = rsi(v, 14);
  assert.equal(out[13], null, 'nothing at index period-1');
  assert.ok(out[14] != null, 'first value at index period');
});

test('RSI stays inside 0..100 on a volatile series', () => {
  const v = Array.from({ length: 200 }, (_, i) => 100 + Math.sin(i / 3) * 20 + (i % 7));
  for (const r of rsi(v, 14)) {
    if (r == null) continue;
    assert.ok(r >= 0 && r <= 100, `RSI out of range: ${r}`);
  }
});

/* --------------------------------- ATR/ADX -------------------------------- */

const bar = (high: number, low: number, closeV: number): Bar => ({ high, low, close: closeV });

test('true range takes the largest of the three gaps', () => {
  const bars = [bar(10, 8, 9), bar(12, 11, 11.5)];
  const tr = trueRange(bars);
  assert.equal(tr[0], 2, 'first bar has no previous close: high - low');
  // high-low = 1, |high-prevClose| = |12-9| = 3, |low-prevClose| = |11-9| = 2 → 3
  assert.equal(tr[1], 3, 'gap up makes |high - prevClose| dominate');
});

test('ATR of constant-range bars equals that range', () => {
  const bars = Array.from({ length: 40 }, () => bar(102, 100, 101));
  assert.equal(last(atr(bars, 14)), 2);
});

test('atrPercent normalises ATR against price', () => {
  const bars = Array.from({ length: 40 }, () => bar(102, 100, 100));
  assert.equal(last(atrPercent(bars, 14)), 2, '2 / 100 = 2%');
});

test('ADX is high in a clean trend and low in a range', () => {
  const trending: Bar[] = Array.from({ length: 80 }, (_, i) => bar(100 + i * 2, 99 + i * 2, 99.5 + i * 2));
  const trendAdx = last(adx(trending, 14).adx)!;
  assert.ok(trendAdx > 40, `expected a strong ADX in a clean trend, got ${trendAdx}`);

  const ranging: Bar[] = Array.from({ length: 80 }, (_, i) => {
    const p = 100 + (i % 2 === 0 ? 1 : -1);
    return bar(p + 0.5, p - 0.5, p);
  });
  const rangeAdx = last(adx(ranging, 14).adx)!;
  assert.ok(rangeAdx < 25, `expected a weak ADX in a chop, got ${rangeAdx}`);
});

test('ADX reports directional dominance via +DI / -DI', () => {
  const up: Bar[] = Array.from({ length: 80 }, (_, i) => bar(100 + i * 2, 99 + i * 2, 99.5 + i * 2));
  const r = adx(up, 14);
  assert.ok(last(r.plusDi)! > last(r.minusDi)!, '+DI leads in an uptrend');

  const downBars: Bar[] = Array.from({ length: 80 }, (_, i) => bar(300 - i * 2, 299 - i * 2, 299.5 - i * 2));
  const d = adx(downBars, 14);
  assert.ok(last(d.minusDi)! > last(d.plusDi)!, '-DI leads in a downtrend');
});

test('ADX returns all-null without enough bars', () => {
  const r = adx(Array.from({ length: 10 }, () => bar(1, 0, 0.5)), 14);
  assert.equal(last(r.adx), null);
});

/* ---------------------------------- VWAP ---------------------------------- */

const DAY = 86_400;
const vb = (time: number, price: number, volume: number): VwapBar =>
  ({ time, high: price, low: price, close: price, volume });

test('typical price is the HLC3 average', () => {
  assert.equal(typicalPrice({ time: 0, high: 12, low: 6, close: 9, volume: 1 }), 9);
});

test('VWAP is volume-weighted, not a simple average', () => {
  // 90% of volume trades at 100, 10% at 200 → VWAP must sit near 100.
  const bars = [vb(0, 100, 900), vb(60, 200, 100)];
  const v = last(vwap(bars, 'session'))!;
  assert.equal(v, 110);
  assert.ok(v < 150, 'a simple mean would be 150');
});

test('daily VWAP resets at 00:00 UTC', () => {
  const bars = [
    vb(0, 100, 10),          // day 0
    vb(3600, 100, 10),       // day 0
    vb(DAY, 500, 10),        // day 1 — fresh accumulation
  ];
  const out = vwap(bars, 'daily');
  assert.equal(out[1], 100);
  assert.equal(out[2], 500, 'day 1 does not inherit day 0 volume');
});

test('session VWAP does not reset', () => {
  const bars = [vb(0, 100, 10), vb(DAY, 300, 10)];
  assert.equal(last(vwap(bars, 'session')), 200, 'accumulates across the whole range');
});

test('weekly VWAP anchors to Monday 00:00 UTC', () => {
  // Epoch day 0 is a Thursday; the following Monday is day 4.
  const thursday = 0;
  const sunday = DAY * 3;
  const monday = DAY * 4;
  const out = vwap([vb(thursday, 100, 10), vb(sunday, 100, 10), vb(monday, 400, 10)], 'weekly');
  assert.equal(out[1], 100, 'Thursday and Sunday share a week');
  assert.equal(out[2], 400, 'Monday starts a new week');
});

test('VWAP ignores zero-volume bars without breaking the accumulation', () => {
  const out = vwap([vb(0, 100, 10), vb(60, 999, 0), vb(120, 100, 10)], 'session');
  assert.equal(last(out), 100);
});

test('vwapDeviation reports position relative to VWAP', () => {
  assert.equal(vwapDeviation(110, 100), 10);
  assert.equal(vwapDeviation(90, 100), -10);
  assert.equal(vwapDeviation(100, null), null);
  assert.equal(vwapDeviation(100, 0), null);
});

/* -------------------------------- z-score --------------------------------- */

test('latestZScore measures the last point against its history', () => {
  const flat = new Array(31).fill(10);
  assert.equal(latestZScore(flat, 30), null, 'zero variance yields no z-score');

  // A realistic history has some jitter; the spike must stand out against it.
  const history = Array.from({ length: 30 }, (_, i) => 10 + (i % 2 === 0 ? 0.5 : -0.5));
  const z = latestZScore([...history, 20], 30)!;
  assert.ok(z > 5, `a doubling against a quiet history is a big z, got ${z}`);

  // The same absolute jump in a noisy market is far less remarkable.
  const noisy = Array.from({ length: 30 }, (_, i) => 10 + (i % 5) * 3);
  const zNoisy = latestZScore([...noisy, 20], 30)!;
  assert.ok(zNoisy < z, 'the z-score self-calibrates to the regime volatility');
});

test('z-score returns null rather than guessing without enough history', () => {
  assert.equal(latestZScore([1, 2, 3], 30), null);
  assert.deepEqual(rollingZScore([1, 2, 3], 30), [null, null, null]);
});

test('rollingZScore looks only at prior bars (no lookahead)', () => {
  const base = Array.from({ length: 10 }, (_, i) => 5 + (i % 2 === 0 ? 0.2 : -0.2));
  const out = rollingZScore([...base, 100], 10);
  assert.equal(out[9], null, 'index 9 has only 9 prior points');
  assert.ok(out[10] != null && out[10]! > 0, 'the spike is scored against the run before it');
});

test('rollingZScore yields null where the window has no variance', () => {
  // Undefined, not zero: pretending a flat window scores 0 would mark a genuine
  // first move as "normal".
  const out = rollingZScore([...new Array(10).fill(5), 100], 10);
  assert.equal(out[10], null);
});

test('anomaly labels follow the configured thresholds', () => {
  assert.equal(classifyAnomaly(3.0), 'spike');
  assert.equal(classifyAnomaly(1.5), 'expansion');
  assert.equal(classifyAnomaly(0), 'normal');
  assert.equal(classifyAnomaly(-1.5), 'contraction');
  assert.equal(classifyAnomaly(-3), 'drought');
  assert.equal(classifyAnomaly(null), null, 'no history means no claim');
});

/* ------------------------------- structure -------------------------------- */

const sb = (high: number, low: number, closeV: number): StructureBar => ({ high, low, close: closeV });

function zigzag(pivots: number[], step = 4): StructureBar[] {
  // Build bars that interpolate between pivot prices so swings are unambiguous.
  const bars: StructureBar[] = [];
  for (let i = 0; i < pivots.length - 1; i++) {
    const from = pivots[i]!;
    const to = pivots[i + 1]!;
    for (let s = 0; s < step; s++) {
      const p = from + ((to - from) * s) / step;
      bars.push(sb(p + 0.5, p - 0.5, p));
    }
  }
  const lastP = pivots[pivots.length - 1]!;
  bars.push(sb(lastP + 0.5, lastP - 0.5, lastP));
  return bars;
}

test('findSwings needs room on both sides of a pivot', () => {
  assert.deepEqual(findSwings([sb(1, 0, 0.5)], 3), [], 'too few bars for a swing');
});

test('structure detects an uptrend (higher highs and higher lows)', () => {
  const bars = zigzag([100, 120, 110, 140, 130, 160]);
  const r = analyzeStructure(bars, 2);
  assert.equal(r.label, 'uptrend');
  assert.ok(r.strength != null && r.strength >= 50);
});

test('structure detects a downtrend (lower highs and lower lows)', () => {
  const bars = zigzag([160, 130, 145, 110, 125, 90]);
  assert.equal(analyzeStructure(bars, 2).label, 'downtrend');
});

test('structure reports `undefined` rather than guessing on too little data', () => {
  const r = analyzeStructure(zigzag([100, 110]), 2);
  assert.equal(r.label, 'undefined');
  assert.equal(r.strength, null);
});
