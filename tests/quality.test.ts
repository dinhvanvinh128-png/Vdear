/**
 * DATA QUALITY ENGINE.
 *
 * The spec's own worked example is the centrepiece: Binance 110,000 vs OKX
 * 110,050 is normal; Binance 110,000 vs OKX 112,000 is a DATA ANOMALY that must
 * never be silently averaged in.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  checkCrossSource, filterOutliers, median, spreadOf,
  DEVIATION_THRESHOLDS, MIN_SOURCES_TO_EXCLUDE,
} from '@/lib/quality/crossSource';
import { freshnessOf, humanAge, qualify } from '@/lib/quality/freshness';
import { buildQualityReport } from '@/lib/quality';
import type { ExchangeId, Ticker } from '@/lib/types';

const tick = (exchange: ExchangeId, price: number): Ticker => ({
  exchange, market: 'spot', symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT',
  price, priceChange24h: 0, volume24h: 1_000_000, high24h: price, low24h: price,
  timestamp: 1000,
});

test('median is unmoved by a single bad print', () => {
  assert.equal(median([100, 101, 102]), 101);
  assert.equal(median([100, 102]), 101);
  assert.equal(median([100, 101, 102, 999999]), 101.5, 'an outlier barely shifts it');
  assert.equal(median([]), null);
  assert.equal(median([0, -5]), null, 'non-positive prices are not prices');
});

test("the spec's normal case: a 0.045% gap is not an anomaly", () => {
  const c = checkCrossSource('BTCUSDT', [tick('binance', 110_000), tick('okx', 110_050)]);
  assert.equal(c.severity, 'none');
  assert.equal(c.message, null);
  assert.deepEqual(c.outliers, []);
  assert.equal(c.confidencePenalty, 0);
  assert.ok(c.spreadPct! < 0.1);
});

test("the spec's anomaly case: a 2000-point gap is flagged and excluded", () => {
  const c = checkCrossSource('BTCUSDT', [
    tick('binance', 110_000), tick('okx', 112_000), tick('bybit', 110_010),
  ]);
  assert.equal(c.severity, 'major');
  assert.deepEqual(c.outliers, ['okx']);
  assert.match(c.message!, /DATA ANOMALY/);
  assert.match(c.message!, /okx/);
  assert.match(c.message!, /excluded/);
  assert.ok(c.confidencePenalty >= 30, 'the score must lose confidence, not just log');
});

test('the median reference stops a bad print from hiding behind the mean', () => {
  // With a mean reference, 112,000 pulls the average to ~110,670 and its own
  // deviation shrinks to ~1.2% while the two good venues look ~0.6% off.
  const c = checkCrossSource('BTCUSDT', [
    tick('binance', 110_000), tick('okx', 112_000), tick('bybit', 110_010),
  ]);
  const okx = c.deviations.find((d) => d.exchange === 'okx')!;
  const binance = c.deviations.find((d) => d.exchange === 'binance')!;
  assert.ok(Math.abs(okx.deviationPct) > 1.5, 'the outlier owns its full deviation');
  assert.ok(Math.abs(binance.deviationPct) < 0.05, 'the good venues stay clean');
  assert.equal(binance.outlier, false);
});

test('excluded venues are removed from the set used for aggregation', () => {
  const tickers = [tick('binance', 110_000), tick('okx', 112_000), tick('bybit', 110_010)];
  const kept = filterOutliers(tickers, checkCrossSource('BTCUSDT', tickers));
  assert.equal(kept.length, 2);
  assert.equal(kept.some((t) => t.exchange === 'okx'), false);
});

test('both the raw and the trusted spread are reported', () => {
  const c = checkCrossSource('BTCUSDT', [
    tick('binance', 110_000), tick('okx', 112_000), tick('bybit', 110_010),
  ]);
  assert.ok(c.rawSpreadPct! > 1.5, 'the divergence itself is visible');
  assert.ok(c.spreadPct! < 0.05, 'but the index is built on the venues that agree');
});

test('a wider-than-usual but tradeable gap is flagged without exclusion', () => {
  const c = checkCrossSource('BTCUSDT', [tick('binance', 110_000), tick('okx', 110_800)]);
  assert.equal(c.severity, 'minor');
  assert.deepEqual(c.outliers, [], 'still tradeable, so still counted');
  assert.match(c.message!, /within tradeable range/);
  assert.ok(c.confidencePenalty > 0 && c.confidencePenalty < 30);
});

test('severity keys off the venue spread, not deviation from the median', () => {
  // Two venues 0.73% apart each sit only ~0.36% from the median between them.
  // Keying severity off deviation would let this real divergence slip through.
  assert.ok(Math.abs(spreadOf([110_000, 110_800]) - 0.727) < 0.01);
  const c = checkCrossSource('BTCUSDT', [tick('binance', 110_000), tick('okx', 110_800)]);
  const maxDeviation = Math.max(...c.deviations.map((d) => Math.abs(d.deviationPct)));
  assert.ok(maxDeviation < DEVIATION_THRESHOLDS.minor, 'each deviation is under the threshold');
  assert.equal(c.severity, 'minor', 'but the spread between them is not');
});

test('two disagreeing venues are flagged without blaming either', () => {
  // With no majority there is no way to know which venue is wrong. Excluding
  // one at random would be worse than excluding neither.
  const c = checkCrossSource('BTCUSDT', [tick('binance', 110_000), tick('okx', 112_000)]);
  assert.equal(c.severity, 'major');
  assert.deepEqual(c.outliers, [], 'neither can be identified as the bad one');
  assert.match(c.message!, /no majority/);
  assert.ok(c.confidencePenalty >= 30, 'confidence still drops sharply');
  assert.equal(MIN_SOURCES_TO_EXCLUDE, 3);
});

test('a critical divergence carries the heaviest penalty', () => {
  const c = checkCrossSource('BTCUSDT', [
    tick('binance', 110_000), tick('okx', 150_000), tick('bybit', 110_010),
  ]);
  assert.equal(c.severity, 'critical');
  assert.ok(c.confidencePenalty > 50);
  assert.ok(DEVIATION_THRESHOLDS.critical > DEVIATION_THRESHOLDS.major);
});

test('a single source says so instead of implying corroboration', () => {
  const c = checkCrossSource('BTCUSDT', [tick('binance', 110_000)]);
  assert.equal(c.severity, 'none');
  assert.match(c.message!, /Single source/);
  assert.ok(c.confidencePenalty > 0, 'uncorroborated data is worth slightly less');
});

test('no sources at all yields no claim', () => {
  const c = checkCrossSource('BTCUSDT', []);
  assert.equal(c.median, null);
  assert.equal(c.severity, 'none');
  assert.equal(c.confidencePenalty, 0);
});

test('invalid prices are ignored rather than treated as zero', () => {
  const c = checkCrossSource('BTCUSDT', [
    tick('binance', 110_000), tick('okx', 0), tick('bybit', 110_010),
  ]);
  assert.equal(c.deviations.length, 2, 'the zero-price venue never enters the comparison');
  assert.equal(c.severity, 'none');
});

/* ------------------------------- freshness -------------------------------- */

test('freshness states follow each source kind own cadence', () => {
  const now = 1_000_000_000;
  assert.equal(freshnessOf('cex_realtime', now, now).state, 'live');
  assert.equal(freshnessOf('cex_realtime', now - 20_000, now).state, 'recent');
  assert.equal(freshnessOf('cex_realtime', now - 5 * 60_000, now).state, 'stale');
  // Daily on-chain data an hour old is completely normal, not stale.
  assert.equal(freshnessOf('onchain_provider', now - 60 * 60_000, now).state, 'live');
});

test('age labels are locale-stable for SSR/CSR parity', () => {
  assert.equal(humanAge(500), 'just now');
  assert.equal(humanAge(5_000), '5s ago');
  assert.equal(humanAge(120_000), '2m ago');
  assert.equal(humanAge(7_200_000), '2h ago');
  assert.equal(humanAge(3 * 86_400_000), '3d ago');
});

test('qualify attaches source, freshness and a penalised confidence', () => {
  const now = 1_000_000_000;
  const clean = qualify(42, 'binance', 'cex_realtime', now, 0, now);
  assert.equal(clean.value, 42);
  assert.equal(clean.source, 'binance');
  assert.equal(clean.freshness.state, 'live');
  assert.equal(clean.confidence, 95);

  const flagged = qualify(42, 'binance', 'cex_realtime', now, 30, now);
  assert.equal(flagged.confidence, 65, 'the anomaly penalty is applied to confidence');
  assert.equal(flagged.value, 42, 'but the value itself is never altered');
});

/* ----------------------------- quality report ------------------------------ */

test('the report is penalised by the WORST anomaly, not the average', () => {
  const clean = checkCrossSource('ETHUSDT', [tick('binance', 3000), tick('okx', 3001)]);
  const broken = checkCrossSource('BTCUSDT', [
    tick('binance', 110_000), tick('okx', 112_000), tick('bybit', 110_010),
  ]);

  const good = buildQualityReport({
    parts: [{ value: 90 }, { value: 90 }], expectedCount: 2,
    contributing: ['binance', 'okx'], unavailable: [], anomalies: [clean],
  });
  const bad = buildQualityReport({
    parts: [{ value: 90 }, { value: 90 }], expectedCount: 2,
    contributing: ['binance', 'okx'], unavailable: [], anomalies: [clean, broken],
  });

  assert.ok(bad.confidence < good.confidence - 25, 'one clean pair cannot mask a broken one');
  assert.equal(bad.anomalies.length, 1, 'only real anomalies are listed');
});

test('unavailable sources are listed with a reason and lower coverage', () => {
  const r = buildQualityReport({
    parts: [{ value: 90 }], expectedCount: 4,
    contributing: ['binance'],
    unavailable: [
      { source: 'glassnode', reason: 'not configured' },
      { source: 'okx', reason: 'circuit open' },
    ],
  });
  assert.equal(r.unavailable.length, 2);
  assert.ok(r.confidence < 40, '1-of-4 coverage must not look confident');
});

test('a full, clean picture reports high confidence', () => {
  const r = buildQualityReport({
    parts: [{ value: 95 }, { value: 92 }, { value: 90 }, { value: 88 }], expectedCount: 4,
    contributing: ['binance', 'okx', 'bybit', 'bitget'], unavailable: [], anomalies: [],
  });
  assert.ok(r.confidence >= 85);
  assert.equal(r.anomalies.length, 0);
});

/* --------------------- integration with the aggregator --------------------- */

test('the aggregator excludes an anomalous venue from the index it publishes', async () => {
  const { mergeTickers } = await import('@/lib/aggregate');

  const clean = mergeTickers('BTCUSDT',
    [tick('binance', 110_000), tick('okx', 110_010), tick('bybit', 110_005)],
    ['binance', 'okx', 'bybit', 'bitget']);
  assert.equal(clean.quality.severity, 'none');
  assert.equal(clean.sources.length, 3);
  assert.ok(Math.abs(clean.vdearIndex - 110_005) < 20);
  assert.deepEqual(clean.missing, ['bitget'], 'a venue that did not answer is still reported');

  const broken = mergeTickers('BTCUSDT',
    [tick('binance', 110_000), tick('okx', 112_000), tick('bybit', 110_010)],
    ['binance', 'okx', 'bybit']);
  assert.equal(broken.quality.severity, 'major');
  assert.deepEqual(broken.quality.outliers, ['okx']);
  assert.equal(broken.sources.length, 2, 'the bad venue is dropped from the breakdown');
  assert.ok(broken.vdearIndex < 110_100,
    `the 112,000 print must not lift the index, got ${broken.vdearIndex}`);
  assert.ok(broken.spreadPct < 0.05, 'the published spread reflects the trusted venues');
});

test('the aggregator still publishes when only one venue answers', async () => {
  const { mergeTickers } = await import('@/lib/aggregate');
  const one = mergeTickers('BTCUSDT', [tick('binance', 110_000)], ['binance', 'okx']);
  assert.equal(one.vdearIndex, 110_000);
  assert.match(one.quality.message!, /Single source/);
  assert.deepEqual(one.missing, ['okx']);
});
