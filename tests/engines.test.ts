/**
 * Calculation engines. These produce the numbers a user acts on, so the tests
 * are written against hand-computable cases and against the specific ways each
 * engine could quietly lie: imputing a missing input, treating "unknown" as
 * zero, or letting one venue's quirk move a market-wide figure.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCvd, mergeCvd, computeSpotFlow, computeTradeFlow, detectVolumeAnomaly, scoreSpotFlow,
} from '@/lib/engines/spotFlow';
import {
  computeOrderBookMetrics, depthWithin, bandImbalance, midPriceOf, scoreOrderBook,
} from '@/lib/engines/orderBook';
import { computeBreadth, aboveEma, scoreBreadth } from '@/lib/engines/breadth';
import { computeStablecoinMetrics, directionOf, scoreStablecoin } from '@/lib/engines/stablecoin';
import { computeDefiMetrics } from '@/lib/engines/defi';
import { computeOnChainMetrics, summarizeMetric } from '@/lib/engines/onchain';
import {
  computeWhaleActivity, bucketFills, toWhaleFills, summarizeExchangeFlow, WHALE_TIERS,
} from '@/lib/engines/whale';
import {
  computeDerivativesConfirmation, classifyPositioning, fundingConfirmation,
  positioningConfirmation, FUNDING_PERIODS_PER_YEAR, FUNDING_RICH_ANNUAL_PCT,
} from '@/lib/engines/derivatives';
import {
  computeSectorRotation, buildSectorMap, sectorOfCategory, scoreSector,
} from '@/lib/engines/sector';
import type { FlowCandle, OrderBook, Trade } from '@/lib/types';

/* =============================== SPOT FLOW ================================ */

const fc = (
  time: number, close: number, quoteVolume: number, takerBuyQuote: number | null,
): FlowCandle => ({
  time, open: close, high: close, low: close, close,
  volume: quoteVolume / (close || 1), quoteVolume, takerBuyQuote,
  takerBuyBase: takerBuyQuote == null ? null : takerBuyQuote / (close || 1),
  trades: 100,
});

test('CVD derives sell volume exactly, never by assumption', () => {
  // 700 of 1000 was aggressive buying, so selling is exactly 300.
  const points = buildCvd([fc(1, 100, 1000, 700)]);
  assert.equal(points.length, 1);
  assert.equal(points[0]!.buyVolume, 700);
  assert.equal(points[0]!.sellVolume, 300);
  assert.equal(points[0]!.delta, 400);
  assert.equal(points[0]!.cumulative, 400);
});

test('CVD accumulates across candles', () => {
  const points = buildCvd([
    fc(1, 100, 1000, 700),   // +400
    fc(2, 101, 1000, 300),   // -400
    fc(3, 102, 2000, 1500),  // +1000
  ]);
  assert.deepEqual(points.map((p) => p.delta), [400, -400, 1000]);
  assert.deepEqual(points.map((p) => p.cumulative), [400, 0, 1000]);
});

test('a candle with no taker split is SKIPPED, never halved', () => {
  // Imputing a 50/50 split here would insert a fabricated neutral reading.
  const points = buildCvd([fc(1, 100, 1000, 700), fc(2, 100, 5000, null)]);
  assert.equal(points.length, 1, 'the unsplit candle contributes nothing');
  assert.equal(points[0]!.cumulative, 400);
});

test('CVD clamps a taker-buy figure that exceeds total volume', () => {
  // Defensive: a bad upstream value must not produce negative sell volume.
  const points = buildCvd([fc(1, 100, 1000, 1500)]);
  assert.equal(points[0]!.buyVolume, 1000);
  assert.equal(points[0]!.sellVolume, 0);
});

test('merging venues sums volume per timestamp and re-accumulates', () => {
  const a = buildCvd([fc(1, 100, 1000, 700), fc(2, 100, 1000, 700)]);
  const b = buildCvd([fc(1, 100, 500, 100), fc(2, 100, 500, 100)]);
  const merged = mergeCvd([a, b]);

  assert.equal(merged.length, 2);
  assert.equal(merged[0]!.buyVolume, 800, '700 + 100');
  assert.equal(merged[0]!.sellVolume, 700, '300 + 400');
  assert.equal(merged[0]!.delta, 100);
  assert.equal(merged[1]!.cumulative, 200, 'cumulative recomputed on the merged series');
});

test('merging aligns by timestamp when venues cover different ranges', () => {
  const a = buildCvd([fc(1, 100, 1000, 600), fc(2, 100, 1000, 600)]);
  const b = buildCvd([fc(2, 100, 1000, 600)]); // joined late
  const merged = mergeCvd([a, b]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0]!.buyVolume, 600, 'only venue A existed at t=1');
  assert.equal(merged[1]!.buyVolume, 1200);
});

test('spot flow records excluded venues instead of imputing them', () => {
  const flow = computeSpotFlow({
    symbol: 'BTCUSDT', timeframe: '1h',
    perExchange: [{ exchange: 'binance', candles: [fc(1, 100, 1000, 800)] }],
    excluded: ['okx', 'bybit', 'bitget'],
  });
  assert.deepEqual(flow.sources, ['binance']);
  assert.deepEqual(flow.excluded, ['okx', 'bybit', 'bitget']);
  assert.equal(flow.buyPressure, 0.8);
  assert.equal(flow.sellPressure, 0.2);
  assert.ok(flow.score! > 60, 'heavy buying scores above neutral');
});

test('spot flow on an empty series reports nothing, and says which venue it wanted', () => {
  const flow = computeSpotFlow({
    symbol: 'BTCUSDT', timeframe: '1h', perExchange: [], excluded: ['binance'],
  });
  assert.equal(flow.score, null, 'unmeasured is not the same as neutral');
  assert.equal(flow.buyPressure, null, 'no trades is unknown pressure, not zero');
  assert.equal(flow.candleCount, 0);
  assert.deepEqual(flow.sources, []);
  assert.deepEqual(flow.excluded, ['binance'], 'the reader is told what was missing');
});

test('balanced flow scores 50, one-sided flow scores toward the extreme', () => {
  const balanced = buildCvd(Array.from({ length: 20 }, (_, i) => fc(i, 100, 1000, 500)));
  assert.equal(scoreSpotFlow(balanced), 50);

  const buying = buildCvd(Array.from({ length: 20 }, (_, i) => fc(i, 100, 1000, 900)));
  assert.ok(scoreSpotFlow(buying)! > 80);

  const selling = buildCvd(Array.from({ length: 20 }, (_, i) => fc(i, 100, 1000, 100)));
  assert.ok(scoreSpotFlow(selling)! < 20);
});

test('no taker split is null, NOT a neutral 50', () => {
  // The distinction this whole engine exists to protect. A pair nobody publishes
  // a taker split for must not arrive at the composite looking like a measured,
  // perfectly balanced market — that would inflate coverage and confidence with
  // evidence that was never gathered.
  assert.equal(scoreSpotFlow([]), null);

  // Candles that exist but carry no volume are equally unmeasured.
  const empty = buildCvd(Array.from({ length: 5 }, (_, i) => fc(i, 100, 0, 0)));
  assert.equal(scoreSpotFlow(empty), null);
});

test('a flow with no usable venue reports absence rather than zero', () => {
  const flow = computeSpotFlow({
    symbol: 'SPKUSDT', timeframe: '1h', excluded: ['okx', 'bybit', 'bitget'], perExchange: [],
  });
  // Every headline figure is null. $0.00 would read as "buying and selling
  // cancelled out", which is a claim about the market we are in no position
  // to make.
  assert.equal(flow.cvd, null);
  assert.equal(flow.volumeDelta, null);
  assert.equal(flow.cvdChange, null);
  assert.equal(flow.score, null);
  assert.equal(flow.candleCount, 0);
  assert.deepEqual(flow.excluded, ['okx', 'bybit', 'bitget']);
});

test('decelerating buying scores below accelerating buying at equal pressure', () => {
  // Same total buy share, different shape — the market is not the same.
  const accelerating = buildCvd([
    ...Array.from({ length: 10 }, (_, i) => fc(i, 100, 1000, 550)),
    ...Array.from({ length: 10 }, (_, i) => fc(10 + i, 100, 1000, 850)),
  ]);
  const decelerating = buildCvd([
    ...Array.from({ length: 10 }, (_, i) => fc(i, 100, 1000, 850)),
    ...Array.from({ length: 10 }, (_, i) => fc(10 + i, 100, 1000, 550)),
  ]);
  assert.ok(scoreSpotFlow(accelerating)! > scoreSpotFlow(decelerating)!);
});

test('volume anomaly is detected against the trailing window', () => {
  const quiet = Array.from({ length: 30 }, (_, i) => ({ quoteVolume: 1000 + (i % 3) * 10 }));
  const spike = detectVolumeAnomaly([...quiet, { quoteVolume: 10_000 }], 30);
  assert.equal(spike.label, 'spike');
  assert.ok(spike.zScore! > 2.5);
  assert.equal(spike.latestVolume, 10_000);
  assert.ok(spike.averageVolume! < 1100, 'baseline excludes the spike itself');

  const normal = detectVolumeAnomaly([...quiet, { quoteVolume: 1010 }], 30);
  assert.equal(normal.label, 'normal');
});

test('volume anomaly withholds a label without enough history', () => {
  const a = detectVolumeAnomaly([{ quoteVolume: 1 }, { quoteVolume: 100 }], 30);
  assert.equal(a.zScore, null);
  assert.equal(a.label, null, 'no claim rather than a guessed one');
});

test('trade flow reports its own short window so it cannot be mistaken for CVD', () => {
  const trades: Trade[] = [
    { exchange: 'binance', symbol: 'BTCUSDT', price: 100, size: 10, side: 'buy', timestamp: 1000 },
    { exchange: 'okx', symbol: 'BTCUSDT', price: 100, size: 4, side: 'sell', timestamp: 5000 },
  ];
  const f = computeTradeFlow(trades);
  assert.equal(f.buyVolumeUsd, 1000);
  assert.equal(f.sellVolumeUsd, 400);
  assert.equal(f.delta, 600);
  assert.ok(Math.abs(f.buyPressure! - 1000 / 1400) < 1e-9);
  assert.equal(f.windowMs, 4000, 'the sample covers 4 seconds, and says so');
  assert.deepEqual(f.sources.sort(), ['binance', 'okx']);
});

test('trade flow on no trades reports null pressure', () => {
  const f = computeTradeFlow([]);
  assert.equal(f.buyPressure, null);
  assert.equal(f.windowMs, 0);
});

/* ============================== ORDER BOOK ================================ */

const book = (
  exchange: 'binance' | 'okx',
  bids: [number, number][], asks: [number, number][],
): OrderBook => ({
  exchange, symbol: 'BTCUSDT',
  bids: bids.map(([price, size]) => ({ price, size })),
  asks: asks.map(([price, size]) => ({ price, size })),
  timestamp: 1000,
});

test('depth is measured in quote currency, not base units', () => {
  // 10 units at 100 is a $1000 wall; 10 units at 50 is a $500 wall.
  const levels = [{ price: 100, size: 10 }];
  assert.equal(depthWithin(levels, 100, 1, 'bid'), 1000);
});

test('depth bands exclude levels outside the band', () => {
  const bids = [
    { price: 99.9, size: 1 },   // within 0.25%
    { price: 99.0, size: 1 },   // within 2% only
    { price: 90.0, size: 100 }, // far away — must never count as support
  ];
  assert.equal(depthWithin(bids, 100, 0.25, 'bid'), 99.9);
  assert.ok(Math.abs(depthWithin(bids, 100, 2, 'bid') - (99.9 + 99.0)) < 1e-9);
});

test('imbalance is bid share of banded depth', () => {
  const b = book('binance', [[99.9, 3]], [[100.1, 1]]);
  const r = bandImbalance(b, 100, 1);
  assert.ok(r.imbalance! > 0.7, 'three times the bid depth');
  assert.equal(midPriceOf(b), 100);
});

test('an empty band reports null, not balanced', () => {
  const b = book('binance', [[90, 1]], [[110, 1]]);
  const r = bandImbalance(b, 100, 0.25);
  assert.equal(r.imbalance, null, 'nothing within 0.25% is unknown, not 50/50');
});

test('order book metrics merge venues and pick the true best bid/ask', () => {
  const m = computeOrderBookMetrics('BTCUSDT', [
    book('binance', [[99.95, 10]], [[100.05, 10]]),
    book('okx', [[99.98, 10]], [[100.02, 10]]),
  ]);
  assert.equal(m.bestBid, 99.98, 'highest bid across venues');
  assert.equal(m.bestAsk, 100.02, 'lowest ask across venues');
  assert.ok(Math.abs(m.spreadAbs! - 0.04) < 1e-9);
  assert.deepEqual(m.sources.sort(), ['binance', 'okx']);
  assert.equal(m.bands.length, 4);
});

test('order book metrics degrade cleanly with no books at all', () => {
  const m = computeOrderBookMetrics('BTCUSDT', []);
  assert.equal(m.midPrice, null);
  assert.equal(m.headlineImbalance, null);
  assert.equal(m.score, 50);
  assert.deepEqual(m.sources, []);
});

test('near-touch depth dominates the order book score', () => {
  // Bid-heavy right at the touch, ask-heavy far away: the near band should win.
  const nearBid = scoreOrderBook([
    { band: 0.25, bidDepthUsd: 900, askDepthUsd: 100, imbalance: 0.9 },
    { band: 2, bidDepthUsd: 100, askDepthUsd: 900, imbalance: 0.1 },
  ]);
  assert.ok(nearBid > 55, `near-touch bid support should lead, got ${nearBid}`);
});

/* ================================ BREADTH ================================= */

function closes(n: number, from: number, to: number): number[] {
  return Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
}

test('aboveEma returns null rather than "below" when history is short', () => {
  assert.equal(aboveEma([1, 2, 3], 200), null, 'unknown, not below');
  assert.equal(aboveEma(closes(60, 100, 200), 50), true);
  assert.equal(aboveEma(closes(60, 200, 100), 50), false);
});

test('breadth reports sample size per ratio and excludes unqualified assets', () => {
  const b = computeBreadth([
    { base: 'A', closes: closes(250, 100, 200), priceChange24h: 5, volume24h: 1000 },
    { base: 'B', closes: closes(30, 100, 200), priceChange24h: 3, volume24h: 500 },  // no EMA200
    { base: 'C', closes: closes(250, 200, 100), priceChange24h: -4, volume24h: 800 },
  ]);
  assert.equal(b.universe, 3);
  assert.equal(b.advancing.count, 2);
  assert.equal(b.declining.count, 1);
  assert.equal(b.advanceDecline, 1);
  assert.equal(b.aboveEma200.sample, 2, 'B lacks 200 days and is excluded from that ratio');
  assert.equal(b.aboveEma200.count, 1);
  assert.equal(b.aboveEma200.pct, 50, '1 of the 2 that qualify');
  assert.equal(b.aboveEma20.sample, 3, 'all three qualify for EMA20');
});

test('breadth volume ratio weights participation by turnover', () => {
  const b = computeBreadth([
    { base: 'BIG', closes: closes(30, 100, 110), priceChange24h: 1, volume24h: 9000 },
    { base: 'S1', closes: closes(30, 110, 100), priceChange24h: -1, volume24h: 500 },
    { base: 'S2', closes: closes(30, 110, 100), priceChange24h: -1, volume24h: 500 },
  ]);
  assert.equal(b.advancing.pct! < 50, true, 'more decliners by count');
  assert.equal(b.volumeRatio, 0.9, 'but 90% of the volume is in the advancer');
});

test('breadth score renormalises when the 200-EMA sample is empty', () => {
  // A young universe must not be scored as though everything were below EMA200.
  const young = computeBreadth([
    { base: 'A', closes: closes(30, 100, 200), priceChange24h: 5, volume24h: 1000 },
    { base: 'B', closes: closes(30, 100, 180), priceChange24h: 4, volume24h: 900 },
  ]);
  assert.equal(young.aboveEma200.pct, null);
  assert.ok(young.score > 70, `broad strength should score high, got ${young.score}`);
});

test('breadth of an empty universe is neutral, not zero', () => {
  const b = computeBreadth([]);
  assert.equal(b.score, 50);
  assert.equal(b.advancing.pct, null);
  assert.equal(b.volumeRatio, null);
});

test('breadth score bounds hold at both extremes', () => {
  const allUp = computeBreadth(Array.from({ length: 20 }, (_, i) => ({
    base: `U${i}`, closes: closes(250, 100, 300), priceChange24h: 8, volume24h: 1000,
  })));
  assert.ok(allUp.score > 90);

  const allDown = computeBreadth(Array.from({ length: 20 }, (_, i) => ({
    base: `D${i}`, closes: closes(250, 300, 100), priceChange24h: -8, volume24h: 1000,
  })));
  assert.ok(allDown.score < 10);
  assert.ok(scoreBreadth(allDown) >= 0 && scoreBreadth(allUp) <= 100);
});

/* ============================== STABLECOIN ================================= */

test('stablecoin direction ignores sub-noise moves', () => {
  assert.equal(directionOf(0.2, null), 'stable', 'under the noise floor');
  assert.equal(directionOf(2.0, null), 'expansion');
  assert.equal(directionOf(-2.0, null), 'contraction');
  assert.equal(directionOf(null, null), 'stable');
  assert.equal(directionOf(null, 3.0), 'expansion', 'falls back to the 30d window');
});

test('stablecoin metrics carry direction, concentration and chain split', () => {
  const m = computeStablecoinMetrics({
    totalUsd: 200e9, totalPrevDay: 199e9, totalPrevWeek: 190e9, totalPrevMonth: 180e9,
    change1d: 0.5, change7d: 5.26, change30d: 11.1,
    assets: [
      { id: '1', name: 'Tether', symbol: 'USDT', pegType: 'peggedUSD',
        circulating: 120e9, circulatingPrevDay: 119e9, circulatingPrevWeek: 115e9,
        circulatingPrevMonth: 110e9, chains: ['Ethereum'] },
      { id: '2', name: 'USD Coin', symbol: 'USDC', pegType: 'peggedUSD',
        circulating: 80e9, circulatingPrevDay: 80e9, circulatingPrevWeek: 75e9,
        circulatingPrevMonth: 70e9, chains: ['Ethereum'] },
    ],
    byChain: [{ chain: 'Ethereum', usd: 200e9, share: 100 }],
    observedAt: 5,
  });
  assert.equal(m.direction, 'expansion');
  assert.equal(m.topAssetShare, 60);
  assert.equal(m.net7dUsd, 10e9);
  assert.ok(m.score > 80, 'a 5% weekly supply expansion is a strong liquidity signal');
  assert.equal(m.observedAt, 5);
});

test('stablecoin score is neutral when no change window is known', () => {
  assert.equal(scoreStablecoin({
    totalUsd: 1, change1d: null, change7d: null, change30d: null,
    net7dUsd: null, net30dUsd: null, direction: 'stable',
    topAssetShare: null, topAssets: [], byChain: [], observedAt: 0,
  }), 50);
});

/* ================================= DEFI =================================== */

test('defi metrics record which inputs were available', () => {
  const m = computeDefiMetrics(
    { totalUsd: 100e9, chains: [{ name: 'Ethereum', tvl: 60e9, geckoId: null, tokenSymbol: null }],
      change1d: 1, change7d: 6, change30d: 10, observedAt: 1 },
    null, null, 7,
  );
  assert.deepEqual(m.inputs, ['tvl']);
  assert.equal(m.dexVolume24h, null, 'absent, not zero');
  assert.equal(m.topChains[0]!.share, 60);
  assert.ok(m.score > 60);
});

test('defi score is neutral with no inputs at all', () => {
  const m = computeDefiMetrics(null, null, null);
  assert.equal(m.score, 50);
  assert.deepEqual(m.inputs, []);
});

/* ================================ ONCHAIN ================================= */

const DAY = 86_400_000;
const series = (metric: 'activeAddresses' | 'txCount', values: number[]) => ({
  metric, asset: 'BTC', source: 'coinmetrics' as const, kind: 'onchain_provider' as const,
  points: values.map((value, i) => ({ time: (i + 1) * DAY, value })),
});

test('on-chain summary computes change windows and a z-score', () => {
  const values = Array.from({ length: 40 }, (_, i) => 900_000 + (i % 3) * 1000);
  const s = summarizeMetric(series('activeAddresses', [...values, 1_200_000]));
  assert.ok(s);
  assert.equal(s!.latest, 1_200_000);
  assert.ok(s!.zScore! > 3, 'a big jump against a quiet baseline');
  assert.ok(s!.change7d! > 0);
  assert.equal(s!.source, 'coinmetrics');
});

test('a metric no provider could serve is listed as missing, never defaulted', () => {
  const r = computeOnChainMetrics('BTC', {
    activeAddresses: series('activeAddresses', Array.from({ length: 40 }, () => 900_000)),
  });
  assert.equal(r.metrics.length, 1);
  assert.ok(r.missing.includes('txCount'), 'absent metrics are reported');
  assert.ok(r.missing.includes('feesUsd'));
  assert.deepEqual(r.sources, ['coinmetrics']);
});

test('on-chain score is neutral when nothing resolved', () => {
  const r = computeOnChainMetrics('BTC', {});
  assert.equal(r.score, 50);
  assert.equal(r.metrics.length, 0);
  assert.equal(r.missing.length, 5);
});

/* ================================= WHALE ================================== */

const trade = (usd: number, side: 'buy' | 'sell', ts = 1000): Trade =>
  ({ exchange: 'binance', symbol: 'BTCUSDT', price: 100, size: usd / 100, side, timestamp: ts });

test('whale buckets are cumulative and split by side', () => {
  const fills = toWhaleFills([
    trade(150_000, 'buy'), trade(600_000, 'buy'), trade(2_000_000, 'sell'), trade(50_000, 'buy'),
  ]);
  assert.equal(fills.length, 3, 'the $50k fill is below the smallest tier');

  const buckets = bucketFills(fills);
  assert.equal(buckets[0]!.threshold, WHALE_TIERS[0]);
  assert.equal(buckets[0]!.count, 3, '>= $100k');
  assert.equal(buckets[1]!.count, 2, '>= $500k');
  assert.equal(buckets[2]!.count, 1, '>= $1m');
  assert.equal(buckets[0]!.netUsd, 150_000 + 600_000 - 2_000_000);
});

test('whale activity says WHY exchange flow is missing rather than faking it', () => {
  const a = computeWhaleActivity({
    symbol: 'BTC', trades: [trade(1_000_000, 'buy')], netflow: null, reserve: null,
  });
  assert.equal(a.exchangeFlow, null);
  assert.ok(a.exchangeFlowNote);
  assert.match(a.exchangeFlowNote!, /CryptoQuant|Glassnode/);
  assert.match(a.exchangeFlowNote!, /not configured/);
  assert.deepEqual(a.tiers, ['cex_fills'], 'only tier 1 contributed');
});

test('exchange outflow raises the whale score, inflow lowers it', () => {
  const baseline = Array.from({ length: 30 }, (_, i) => ({ time: (i + 1) * DAY, value: 0 }));
  const flowSeries = (finalValue: number) => ({
    metric: 'exchangeNetflow' as const, asset: 'BTC',
    source: 'cryptoquant' as const, kind: 'onchain_provider' as const,
    points: [
      ...baseline.map((p, i) => ({ ...p, value: (i % 2 === 0 ? 100 : -100) })),
      { time: 31 * DAY, value: finalValue },
    ],
  });

  const outflow = computeWhaleActivity({
    symbol: 'BTC', trades: [], netflow: flowSeries(-5000), reserve: null,
  });
  const inflow = computeWhaleActivity({
    symbol: 'BTC', trades: [], netflow: flowSeries(5000), reserve: null,
  });

  assert.ok(outflow.score > 50, 'coins leaving exchanges is accumulation');
  assert.ok(inflow.score < 50, 'coins arriving on exchanges is supply to be sold');
  assert.deepEqual(outflow.tiers, ['exchange_flow']);
});

test('exchange flow summary inverts nothing on its own — it reports raw netflow', () => {
  const s = summarizeExchangeFlow({
    metric: 'exchangeNetflow', asset: 'BTC', source: 'cryptoquant', kind: 'onchain_provider',
    points: [{ time: DAY, value: 100 }, { time: 2 * DAY, value: -200 }],
  }, null);
  assert.equal(s!.netflowLatest, -200, 'sign preserved; interpretation happens in the score');
  assert.equal(s!.source, 'cryptoquant');
});

test('whale score is neutral with neither tier available', () => {
  const a = computeWhaleActivity({ symbol: 'BTC', trades: [], netflow: null, reserve: null });
  assert.equal(a.score, 50);
  assert.equal(a.whaleBuyRatio, null);
  assert.deepEqual(a.tiers, []);
});

/* ============================== DERIVATIVES =============================== */

test('positioning regimes are classified from OI, price and funding together', () => {
  assert.equal(classifyPositioning(10, 3, 0.0002), 'long_crowding');
  assert.equal(classifyPositioning(10, 3, -0.0002), 'short_squeeze', 'shorts paying into a rally');
  assert.equal(classifyPositioning(10, -3, 0.0001), 'short_build');
  assert.equal(classifyPositioning(-5, -3, 0.0001), 'long_unwind');
  assert.equal(classifyPositioning(-20, 1, 0.0001), 'deleveraging');
  assert.equal(classifyPositioning(null, 5, 0.0001), 'balanced', 'no OI means no claim');
});

test('extreme funding is flagged as fragility, not strength', () => {
  const rich = computeDerivativesConfirmation({
    symbol: 'BTC', fundingRate: 0.001, openInterestUsd: 110, openInterestUsd24hAgo: 100,
    priceChange24h: 5, longPct: 75, sources: ['binance'],
  });
  const healthy = computeDerivativesConfirmation({
    symbol: 'BTC', fundingRate: 0.0001, openInterestUsd: 110, openInterestUsd24hAgo: 100,
    priceChange24h: 5, longPct: 55, sources: ['binance'],
  });

  assert.ok(rich.fundingAnnualizedPct! > 100);
  assert.ok(rich.warnings.length >= 2, 'rich funding and one-sided positioning both flagged');
  assert.ok(rich.warnings.some((w) => /crowded/.test(w)));
  assert.ok(rich.score < healthy.score,
    'crowded leverage confirms LESS than healthy positioning');
});

test('the funding curve is a tent: it turns down once the trade is crowded', () => {
  const R = FUNDING_RICH_ANNUAL_PCT;
  assert.equal(fundingConfirmation(0), 50, 'flat funding is neutral');
  assert.equal(fundingConfirmation(R), 75, 'peak confirmation at the rich threshold');
  assert.ok(fundingConfirmation(R / 2) > 50 && fundingConfirmation(R / 2) < 75, 'rising into the peak');
  assert.equal(fundingConfirmation(2 * R), 50, 'crowding has cancelled the momentum');
  assert.ok(fundingConfirmation(3 * R) < 50, 'extreme funding actively subtracts');
  assert.ok(fundingConfirmation(10 * R) >= 0, 'and stays inside bounds');
  // Symmetric: deeply negative funding is squeeze fuel, not a bearish reading.
  assert.equal(fundingConfirmation(-R), 25);
  assert.ok(fundingConfirmation(-3 * R) > 50);
});

test('positioning confirmation decays once the crowd IS the trade', () => {
  assert.equal(positioningConfirmation(50), 50, 'balanced');
  assert.equal(positioningConfirmation(70), 75, 'peak at the crowded threshold');
  assert.ok(positioningConfirmation(85) < positioningConfirmation(70),
    'past the peak the marginal buyer is already in');
  assert.ok(positioningConfirmation(30) < 50, 'a crowded short lean is symmetric');
});

test('funding annualisation uses the 8h perpetual schedule', () => {
  const r = computeDerivativesConfirmation({
    symbol: 'BTC', fundingRate: 0.0001, openInterestUsd: null, openInterestUsd24hAgo: null,
    priceChange24h: null, longPct: null, sources: [],
  });
  assert.equal(FUNDING_PERIODS_PER_YEAR, 1095, '3 payments a day');
  assert.ok(Math.abs(r.fundingAnnualizedPct! - 10.95) < 1e-9);
});

test('derivatives report whether they confirm the spot direction', () => {
  const bullishConfirm = computeDerivativesConfirmation({
    symbol: 'BTC', fundingRate: -0.0001, openInterestUsd: 120, openInterestUsd24hAgo: 100,
    priceChange24h: 4, longPct: 52, sources: ['binance'],
  });
  assert.equal(bullishConfirm.regime, 'short_squeeze');
  assert.equal(bullishConfirm.confirms, true);

  const noPrice = computeDerivativesConfirmation({
    symbol: 'BTC', fundingRate: null, openInterestUsd: null, openInterestUsd24hAgo: null,
    priceChange24h: null, longPct: null, sources: [],
  });
  assert.equal(noPrice.confirms, null, 'nothing to confirm against');
});

/* ================================ SECTORS ================================= */

test('category ids map onto the spec sectors, most specific first', () => {
  assert.equal(sectorOfCategory('artificial-intelligence'), 'ai');
  assert.equal(sectorOfCategory('meme-token'), 'meme');
  assert.equal(sectorOfCategory('layer-1'), 'layer1');
  assert.equal(sectorOfCategory('layer-2'), 'layer2');
  assert.equal(sectorOfCategory('oracle'), 'oracle');
  assert.equal(sectorOfCategory('real-world-assets-rwa'), 'rwa');
  assert.equal(sectorOfCategory('depin'), 'depin');
  assert.equal(sectorOfCategory('something-unheard-of'), null);
});

test('an AI L1 is classified as AI, which is how rotation is discussed', () => {
  const map = buildSectorMap([
    { id: 'layer-1', name: 'L1', marketCap: 1, marketCapChange24h: 0, volume24h: 1,
      topCoins: ['near'], updatedAt: null },
    { id: 'artificial-intelligence', name: 'AI', marketCap: 1, marketCapChange24h: 0, volume24h: 1,
      topCoins: ['near'], updatedAt: null },
  ]);
  assert.equal(map.get('near'), 'ai');
});

test('sector changes are market-cap weighted so a micro-cap cannot swing them', () => {
  const coin = (id: string, marketCap: number, change24h: number) => ({
    id, symbol: id.toUpperCase(), name: id, image: '', price: 1,
    marketCap, marketCapRank: 1, fullyDilutedValuation: null, volume24h: marketCap / 10,
    change1h: null, change24h, change7d: null, change30d: null,
    circulatingSupply: null, totalSupply: null, ath: null, athChangePct: null,
    atl: null, lastUpdated: 0,
  });

  const map = new Map([['big', 'ai' as const], ['tiny', 'ai' as const]]);
  const r = computeSectorRotation([coin('big', 100e9, 1), coin('tiny', 10e6, 500)], map);
  const ai = r.sectors.find((s) => s.sector === 'ai')!;
  assert.ok(ai.change24h! < 2, `a +500% micro-cap must not define the sector, got ${ai.change24h}`);
  assert.equal(ai.memberCount, 2);
});

test('sector rotation ranks leaders and counts what it could not classify', () => {
  const coin = (id: string, change24h: number) => ({
    id, symbol: id.toUpperCase(), name: id, image: '', price: 1,
    marketCap: 1e9, marketCapRank: 1, fullyDilutedValuation: null, volume24h: 1e8,
    change1h: null, change24h, change7d: change24h * 2, change30d: null,
    circulatingSupply: null, totalSupply: null, ath: null, athChangePct: null,
    atl: null, lastUpdated: 0,
  });

  const r = computeSectorRotation(
    [coin('a', 15), coin('b', -8), coin('unknown', 3)],
    new Map([['a', 'ai' as const], ['b', 'defi' as const]]),
  );
  assert.equal(r.leaders[0], 'ai');
  assert.equal(r.laggards[0], 'defi');
  assert.equal(r.unclassified, 1, 'unmatched assets are reported, not hidden');
  assert.equal(r.totalMarketCapUsd, 2e9);
});

test('sector score is neutral without any change data', () => {
  assert.equal(scoreSector({
    sector: 'ai', label: 'AI', marketCapUsd: 1, volume24hUsd: 0,
    change24h: null, change7d: null, turnover: null, memberCount: 0, topMovers: [],
  }), 50);
});

/* --------------------- MFI fallback inside spot flow ----------------------- */

const ob = (time: number, price: number, volume: number) =>
  ({ time, high: price + 2, low: price - 2, close: price, volume });

test('with no taker split, spot flow falls back to MFI and says so', () => {
  const flow = computeSpotFlow({
    symbol: 'SPKUSDT', timeframe: '1h',
    perExchange: [], excluded: ['okx', 'bybit', 'bitget'],
    ohlcv: Array.from({ length: 30 }, (_, i) => ob(i, 100 + i, 1000)),
  });
  assert.equal(flow.method, 'mfi', 'the reader is told which instrument this is');
  assert.ok(flow.score != null, 'a real reading, not a fabricated neutral');
  assert.equal(flow.mfi, 100, 'an unbroken advance is pure inflow');
  assert.ok(flow.mfiPoints.length > 0, 'there is something to draw');

  // The CVD figures stay null. MFI is a different measurement and must never
  // be quietly written into the fields that mean "exact taker split".
  assert.equal(flow.cvd, null);
  assert.equal(flow.volumeDelta, null);
  assert.equal(flow.points.length, 0);
});

test('CVD always wins when it exists — MFI never overrides the better instrument', () => {
  const flow = computeSpotFlow({
    symbol: 'BTCUSDT', timeframe: '1h',
    perExchange: [{
      exchange: 'binance',
      candles: Array.from({ length: 20 }, (_, i) => fc(i, 100 + i, 1000, 100)),
    }],
    excluded: ['okx'],
    // Price rising hard would push MFI to 100, the opposite of what the taker
    // split says. The split must win.
    ohlcv: Array.from({ length: 30 }, (_, i) => ob(i, 100 + i, 1000)),
  });
  assert.equal(flow.method, 'cvd');
  assert.ok(flow.score! < 20, 'heavy taker selling, regardless of the price trend');
  assert.ok(flow.cvd != null);
});

test('neither instrument available leaves the score null', () => {
  const flow = computeSpotFlow({
    symbol: 'NEWUSDT', timeframe: '1h',
    perExchange: [], excluded: ['binance', 'okx', 'bybit', 'bitget'],
    ohlcv: [], // brand-new listing: no history at all
  });
  assert.equal(flow.method, null);
  assert.equal(flow.score, null);
  assert.equal(flow.mfi, null);
  assert.deepEqual(flow.mfiPoints, []);
});
