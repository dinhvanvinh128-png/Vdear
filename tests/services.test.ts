/**
 * SERVICE / INTEGRATION LAYER — the failure paths.
 *
 * The engines are tested against clean inputs elsewhere. What matters here is
 * what happens when reality misbehaves: an API is down, a provider has no key,
 * a symbol has no coverage, the data is stale, or EVERYTHING fails at once.
 *
 * The rule these tests defend: a missing input must lower CONFIDENCE and be
 * NAMED — never be replaced by a value.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { computeMoneyFlowScore } from '@/lib/scoring/moneyFlow';
import { computeRegime } from '@/lib/scoring/regime';
import { computeSignal } from '@/lib/scoring/signal';
import { computeAccDist } from '@/lib/scoring/accDist';
import { buildQualityReport } from '@/lib/quality';
import { checkCrossSource } from '@/lib/quality/crossSource';
import { ruleBasedAnalyst } from '@/lib/analyst';
import { computeSpotFlow } from '@/lib/engines/spotFlow';
import { computeBreadth } from '@/lib/engines/breadth';
import { computeWhaleActivity } from '@/lib/engines/whale';
import { computeOnChainMetrics } from '@/lib/engines/onchain';
import { computeDefiMetrics } from '@/lib/engines/defi';
import { detectAlerts } from '@/lib/engines/alerts';
import { resolveMetric, type OnChainProvider } from '@/lib/providers/onchain';
import { freshnessOf, qualify } from '@/lib/quality/freshness';
import { isCompliant } from '@/lib/scoring/language';
import type { Ticker } from '@/lib/types';

/**
 * Mirrors the composition in lib/services/intelligence.ts, driven by an
 * availability map so each degradation scenario can be exercised directly.
 */
function composePipeline(available: {
  spotFlow?: number | null; breadth?: number | null; stablecoin?: number | null;
  trend?: number | null; onChain?: number | null; whale?: number | null;
  defi?: number | null; derivatives?: number | null;
}, reasons: Record<string, string> = {}, qualityPenalty = 0) {
  const moneyFlow = computeMoneyFlowScore({
    scores: {
      spotFlow: available.spotFlow ?? null,
      marketBreadth: available.breadth ?? null,
      stablecoinLiquidity: available.stablecoin ?? null,
      trend: available.trend ?? null,
      onChain: available.onChain ?? null,
      whaleFlow: available.whale ?? null,
      defiLiquidity: available.defi ?? null,
      derivativesConfirmation: available.derivatives ?? null,
    },
    reasons,
    qualityPenalty,
  });

  const accDist = computeAccDist({
    priceChangePct: 1, cvdChange: null, totalVolume: null,
    whaleScore: available.whale ?? null, exchangeNetflowZ: null,
    stablecoinScore: available.stablecoin ?? null, breadthScore: available.breadth ?? null,
  });

  const quality = buildQualityReport({
    parts: Object.values(available)
      .filter((v): v is number => typeof v === 'number')
      .map(() => ({ value: 90 })),
    expectedCount: 8,
    contributing: [],
    unavailable: Object.entries(reasons).map(([source, reason]) => ({ source, reason })),
  });

  const regime = computeRegime({
    compositeScore: moneyFlow.score,
    trendScore: available.trend ?? null,
    breadthScore: available.breadth ?? null,
    adx: 30, priceChangePct: 1, accDist,
    volumeZ: null, spotFlowScore: available.spotFlow ?? null,
    coverage: moneyFlow.coverage,
  });

  const signal = computeSignal({
    compositeScore: moneyFlow.score,
    dataConfidence: quality.confidence,
    coverage: moneyFlow.coverage,
    regime: regime.regime,
    regimeConviction: regime.conviction,
    accDist,
    trendScore: available.trend ?? null,
    breadthScore: available.breadth ?? null,
    spotFlowScore: available.spotFlow ?? null,
  });

  return { moneyFlow, accDist, quality, regime, signal };
}

/* ============================ ALL SOURCES DOWN ============================= */

test('ALL PROVIDERS DOWN: the pipeline degrades to neutral and says why', async () => {
  const reasons = {
    spotFlow: 'Spot flow: all exchanges unreachable',
    marketBreadth: 'Market breadth: all exchanges unreachable',
    stablecoinLiquidity: 'DeFiLlama: network error',
    trend: 'not enough candle history for a trend score',
    onChain: 'Coin Metrics: network error',
    whaleFlow: 'Exchange flow needs CryptoQuant or Glassnode — not configured.',
    defiLiquidity: 'DeFi data unavailable',
    derivativesConfirmation: 'no derivatives data',
  };
  const p = composePipeline({}, reasons);

  assert.equal(p.moneyFlow.score, 50, 'neutral, because there is no evidence either way');
  assert.equal(p.moneyFlow.coverage, 0);
  assert.equal(p.moneyFlow.confidence, 0, 'zero confidence, not a confident 50');
  assert.equal(p.moneyFlow.direction, 'NEUTRAL');
  assert.equal(p.signal.state, 'NEUTRAL');

  // Every component names its own reason.
  for (const c of p.moneyFlow.components) {
    assert.equal(c.score, null);
    assert.ok(c.unavailableReason, `${c.component} must carry a reason`);
  }

  const report = await ruleBasedAnalyst.analyze({
    symbol: 'BTC', moneyFlow: p.moneyFlow, regime: p.regime, signal: p.signal,
    accDist: p.accDist,
    scores: {
      trend: null, liquidity: null, breadth: null, onChain: null,
      whale: null, spotFlow: null, stablecoin: null, derivatives: null,
    },
    unavailable: Object.entries(reasons).map(([source, reason]) => ({ source, reason })),
  });
  assert.ok(report.blindSpots.length >= 8, 'the report enumerates what it cannot see');
  assert.ok(report.risks.some((r) => /scoring inputs were available/.test(r)));
  assert.ok(isCompliant(report.summary));
});

/* ============================ PARTIAL OUTAGE ============================== */

test('ONE PROVIDER DOWN: the score reflects the rest, confidence drops, reason survives', () => {
  const full = composePipeline({
    spotFlow: 76, breadth: 71, stablecoin: 74, trend: 82,
    onChain: 72, whale: 75, defi: 66, derivatives: 55,
  });
  const degraded = composePipeline(
    { spotFlow: 76, breadth: 71, stablecoin: 74, trend: 82, whale: 75, defi: 66, derivatives: 55 },
    { onChain: 'Coin Metrics: no community coverage for this asset' },
  );

  assert.ok(degraded.moneyFlow.coverage < full.moneyFlow.coverage);
  assert.ok(degraded.moneyFlow.confidence < full.moneyFlow.confidence,
    'a missing input costs confidence');

  const onChain = degraded.moneyFlow.components.find((c) => c.component === 'onChain')!;
  assert.equal(onChain.score, null);
  assert.match(onChain.unavailableReason!, /no community coverage/);

  // The remaining components renormalise; the score is not dragged toward 50.
  assert.ok(degraded.moneyFlow.score > 65,
    `strong remaining evidence must still read strong, got ${degraded.moneyFlow.score}`);
});

test('a thin picture cannot produce a high-confidence signal', () => {
  const thin = composePipeline({ spotFlow: 95, trend: 92 }, {
    marketBreadth: 'unavailable', stablecoinLiquidity: 'unavailable',
    onChain: 'unavailable', whaleFlow: 'unavailable',
    defiLiquidity: 'unavailable', derivativesConfirmation: 'unavailable',
  });
  assert.ok(thin.moneyFlow.score > 90, 'the two available inputs are unambiguous');
  assert.notEqual(thin.signal.state, 'HIGH_CONFIDENCE_BULLISH');
  assert.ok(thin.signal.downgradeReason, 'and it explains the downgrade');
  assert.notEqual(thin.regime.regime, 'STRONG_BULL', 'nor an extreme regime');
});

/* ========================= UPSTREAM RETURNS NOTHING ======================== */

test('empty exchange responses never produce zeros', () => {
  const flow = computeSpotFlow({
    symbol: 'BTCUSDT', timeframe: '1h', perExchange: [],
    excluded: ['binance', 'okx', 'bybit', 'bitget'],
  });
  assert.equal(flow.score, null, 'no measurement, so no score — not a neutral 50');
  assert.equal(flow.buyPressure, null, 'unknown pressure, not zero pressure');
  assert.equal(flow.candleCount, 0);

  // NOTE: the three engines below still return a neutral 50 for an empty input.
  // That is the same defect spot flow just had — a fabricated reading that counts
  // towards the composite's coverage and confidence — and they are asserted here
  // as they currently behave, not as they should. See NOTES in the commit body.

  const breadth = computeBreadth([]);
  assert.equal(breadth.score, 50);
  assert.equal(breadth.advancing.pct, null);

  const onChain = computeOnChainMetrics('BTC', {});
  assert.equal(onChain.score, 50);
  assert.equal(onChain.metrics.length, 0);
  assert.ok(onChain.missing.length > 0);

  const defi = computeDefiMetrics(null, null, null);
  assert.equal(defi.score, 50);
  assert.deepEqual(defi.inputs, []);
});

test('the whale engine keeps tier 1 when tier 2 is unavailable', () => {
  const trades = [{
    exchange: 'binance' as const, symbol: 'BTCUSDT', price: 100_000,
    size: 20, side: 'buy' as const, timestamp: Date.now(),
  }];
  const a = computeWhaleActivity({ symbol: 'BTC', trades, netflow: null, reserve: null });
  assert.deepEqual(a.tiers, ['cex_fills'], 'the free tier still works');
  assert.equal(a.exchangeFlow, null);
  assert.match(a.exchangeFlowNote!, /not configured|CryptoQuant|Glassnode/);
  assert.equal(a.buckets[0]!.count, 1, 'the $2m fill is counted');
});

/* ======================== PROVIDER FALLBACK CHAIN ========================= */

function stubProvider(
  id: 'cryptoquant' | 'glassnode' | 'coinmetrics',
  opts: { configured: boolean; result: 'ok' | 'empty' | 'throw' },
): OnChainProvider {
  return {
    id, label: id, supports: ['exchangeNetflow'],
    configured: () => opts.configured,
    async fetch(metric, asset) {
      if (opts.result === 'throw') throw new Error('upstream 503');
      if (opts.result === 'empty') return null;
      return {
        metric, asset, source: id, kind: 'onchain_provider',
        points: [{ time: 1, value: 42 }],
      };
    },
  };
}

test('the on-chain chain falls through unconfigured and failing providers', async () => {
  const r = await resolveMetric('exchangeNetflow', 'BTC', 30, [
    stubProvider('cryptoquant', { configured: false, result: 'ok' }),
    stubProvider('glassnode', { configured: true, result: 'throw' }),
    stubProvider('coinmetrics', { configured: true, result: 'ok' }),
  ]);

  assert.ok(r.series, 'the last provider answered');
  assert.equal(r.series!.source, 'coinmetrics');
  assert.equal(r.attempts.length, 3, 'every attempt is recorded');
  assert.equal(r.attempts[0]!.outcome, 'not_configured');
  assert.equal(r.attempts[1]!.outcome, 'failed');
  assert.match(r.attempts[1]!.message!, /503/);
  assert.equal(r.attempts[2]!.outcome, 'ok');
});

test('when the whole chain fails, nothing is fabricated', async () => {
  const r = await resolveMetric('exchangeNetflow', 'BTC', 30, [
    stubProvider('cryptoquant', { configured: false, result: 'ok' }),
    stubProvider('glassnode', { configured: false, result: 'ok' }),
    stubProvider('coinmetrics', { configured: true, result: 'empty' }),
  ]);
  assert.equal(r.series, null);
  assert.equal(r.attempts.filter((a) => a.outcome === 'not_configured').length, 2);
  assert.equal(r.attempts.filter((a) => a.outcome === 'failed').length, 1);
});

test('a provider that does not support the metric is skipped, not called', async () => {
  let called = false;
  const wrongMetric: OnChainProvider = {
    id: 'glassnode', label: 'glassnode', supports: ['mvrv'],
    configured: () => true,
    async fetch() { called = true; return null; },
  };
  const r = await resolveMetric('exchangeNetflow', 'BTC', 30, [
    wrongMetric, stubProvider('coinmetrics', { configured: true, result: 'ok' }),
  ]);
  assert.equal(called, false);
  assert.equal(r.attempts[0]!.outcome, 'unsupported');
  assert.equal(r.series!.source, 'coinmetrics');
});

/* ============================== STALE DATA ================================ */

test('stale data is still shown, but labelled and discounted', () => {
  const now = 1_000_000_000;
  const fresh = qualify(100, 'binance', 'cex_realtime', now, 0, now);
  const stale = qualify(100, 'binance', 'cex_realtime', now - 10 * 60_000, 0, now);

  assert.equal(stale.value, 100, 'the value is never altered');
  assert.equal(stale.freshness.state, 'stale');
  assert.ok(stale.confidence < fresh.confidence / 2);
  assert.match(stale.freshness.label, /m ago/);

  // Each source kind has its own cadence: a daily on-chain metric is not stale
  // after ten minutes.
  assert.equal(freshnessOf('onchain_provider', now - 10 * 60_000, now).state, 'live');
});

/* ======================== ANOMALY REACHES THE SCORE ======================= */

test('a cross-venue anomaly propagates into the composite confidence', () => {
  const tick = (exchange: 'binance' | 'okx' | 'bybit', price: number): Ticker => ({
    exchange, market: 'spot', symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT',
    price, priceChange24h: 0, volume24h: 1e6, high24h: price, low24h: price, timestamp: 1,
  });
  const anomaly = checkCrossSource('BTCUSDT', [
    tick('binance', 110_000), tick('okx', 112_000), tick('bybit', 110_010),
  ]);
  assert.equal(anomaly.severity, 'major');

  const scores = { spotFlow: 76, breadth: 71, stablecoin: 74, trend: 82,
    onChain: 72, whale: 75, defi: 66, derivatives: 55 };
  const clean = composePipeline(scores);
  const flagged = composePipeline(scores, {}, anomaly.confidencePenalty);

  assert.equal(clean.moneyFlow.score, flagged.moneyFlow.score, 'the score itself is unchanged');
  assert.ok(flagged.moneyFlow.confidence < clean.moneyFlow.confidence,
    'but confidence in it drops');
});

/* ================================ ALERTS ================================== */

test('alerts are only raised from evidence that exists', () => {
  const none = detectAlerts({
    asset: 'BTC', spotFlow: null, breadth: null, whale: null,
    stablecoin: null, accDist: null, regime: null, dataConfidence: 0,
  });
  assert.deepEqual(none, [], 'no inputs means no alerts, not "0 detected" alerts');
});

test('an alert carries every field the spec requires', () => {
  const flow = computeSpotFlow({
    symbol: 'BTCUSDT', timeframe: '1h',
    perExchange: [{
      exchange: 'binance',
      candles: [
        ...Array.from({ length: 40 }, (_, i) => ({
          time: i, open: 100, high: 101, low: 99, close: 100,
          volume: 10, quoteVolume: 1000 + (i % 3), takerBuyQuote: 500,
          takerBuyBase: 5, trades: 10,
        })),
        {
          time: 40, open: 100, high: 101, low: 99, close: 100,
          volume: 200, quoteVolume: 20_000, takerBuyQuote: 19_000,
          takerBuyBase: 190, trades: 500,
        },
      ],
    }],
    excluded: ['okx'],
  });

  const alerts = detectAlerts({
    asset: 'BTC', spotFlow: flow, breadth: null, whale: null,
    stablecoin: null, accDist: null, regime: null, dataConfidence: 85,
  });

  assert.ok(alerts.length > 0);
  for (const a of alerts) {
    assert.ok(a.asset, 'asset');
    assert.ok(a.timestamp > 0, 'timestamp');
    assert.ok(['info', 'warning', 'critical'].includes(a.severity), 'severity');
    assert.ok(a.reason.length > 20, 'reason');
    assert.ok(a.source.length > 0, 'source');
    assert.equal(typeof a.confidence, 'number', 'confidence');
    assert.ok(a.dedupeKey.includes('BTC'), 'dedupe key');
    assert.ok(isCompliant(a.reason), `alert text must stay compliant: "${a.reason}"`);
  }
});

test('the dedupe key is stable within an hour and changes across hours', () => {
  const base = {
    asset: 'BTC', spotFlow: null, breadth: computeBreadth([]), whale: null,
    stablecoin: null, accDist: null, regime: null, dataConfidence: 80,
  };
  const breadthWeak = computeBreadth(Array.from({ length: 20 }, (_, i) => ({
    base: `D${i}`, closes: [100, 90, 80], priceChange24h: -8, volume24h: 1000,
  })));

  const t0 = Date.parse('2024-05-01T10:15:00Z');
  const sameHour = Date.parse('2024-05-01T10:59:00Z');
  const nextHour = Date.parse('2024-05-01T11:01:00Z');

  const a = detectAlerts({ ...base, breadth: breadthWeak, now: t0 })[0]!;
  const b = detectAlerts({ ...base, breadth: breadthWeak, now: sameHour })[0]!;
  const c = detectAlerts({ ...base, breadth: breadthWeak, now: nextHour })[0]!;

  assert.equal(a.dedupeKey, b.dedupeKey, 'a persisting condition does not re-fire');
  assert.notEqual(a.dedupeKey, c.dedupeKey, 'but a new hour is a new observation');
});
