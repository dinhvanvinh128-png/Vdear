/**
 * SCORING LAYER.
 *
 * These tests encode the product's central promises: weights live in one place,
 * a missing input lowers confidence rather than manufacturing a score, a good
 * number with contradicting evidence is not reported as a bullish signal, and no
 * user-facing string claims certainty.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MONEY_FLOW_WEIGHTS, assertWeightsValid, sumWeights, REGIME_BANDS, SIGNAL_BANDS,
  HIGH_CONFIDENCE_MIN_DATA_QUALITY, ADX_TREND_MINIMUM,
} from '@/lib/scoring/config';
import {
  computeMoneyFlowScore, directionOf, rankContributions, MIN_COVERAGE_FOR_SCORE,
} from '@/lib/scoring/moneyFlow';
import { computeTrendScore, scoreTimeframe, scoreEmaAlignment, trendStrengthLabel } from '@/lib/scoring/trend';
import { computeLiquidityScore, scoreDepth, scoreSpread, scoreVolume, liquidityDirection } from '@/lib/scoring/liquidity';
import { computeAccDist, isDistributionWarning } from '@/lib/scoring/accDist';
import { computeRegime, bandFor, isBullish, isBearish, MIN_COVERAGE_FOR_EXTREME } from '@/lib/scoring/regime';
import { computeSignal, stateFor, findContradictions } from '@/lib/scoring/signal';
import { findViolations, isCompliant, assertCompliant, describeBias, describeConfidence } from '@/lib/scoring/language';
import type { Candle } from '@/lib/types';

/* ================================ CONFIG ================================== */

test('the money flow weights are exactly the spec split and sum to 100', () => {
  assert.equal(MONEY_FLOW_WEIGHTS.spotFlow, 20);
  assert.equal(MONEY_FLOW_WEIGHTS.marketBreadth, 15);
  assert.equal(MONEY_FLOW_WEIGHTS.stablecoinLiquidity, 15);
  assert.equal(MONEY_FLOW_WEIGHTS.trend, 20);
  assert.equal(MONEY_FLOW_WEIGHTS.onChain, 10);
  assert.equal(MONEY_FLOW_WEIGHTS.whaleFlow, 10);
  assert.equal(MONEY_FLOW_WEIGHTS.defiLiquidity, 5);
  assert.equal(MONEY_FLOW_WEIGHTS.derivativesConfirmation, 5);
  assert.equal(sumWeights(MONEY_FLOW_WEIGHTS), 100);
});

test('every weight set validates, so a mis-edited config fails loudly', () => {
  assert.doesNotThrow(() => assertWeightsValid());
});

test('score bands are ordered and cover the whole 0..100 range', () => {
  for (const bands of [REGIME_BANDS, SIGNAL_BANDS]) {
    const mins = bands.map((b) => b.min);
    assert.deepEqual(mins, [...mins].sort((a, b) => b - a), 'descending so the first match wins');
    assert.equal(mins[mins.length - 1], 0, 'the last band catches everything');
  }
});

/* ============================== MONEY FLOW ================================ */

const allComponents = {
  spotFlow: 70, marketBreadth: 70, stablecoinLiquidity: 70, trend: 70,
  onChain: 70, whaleFlow: 70, defiLiquidity: 70, derivativesConfirmation: 70,
};

test('a full set of equal components scores exactly that value', () => {
  const r = computeMoneyFlowScore({ scores: allComponents });
  assert.equal(r.score, 70);
  assert.equal(r.coverage, 1);
  assert.equal(r.missing.length, 0);
  assert.equal(r.direction, 'INFLOW');
});

test('components are weighted, not averaged', () => {
  // Trend (20) and spot flow (20) carry twice the weight of on-chain (10).
  const r = computeMoneyFlowScore({
    scores: { ...allComponents, spotFlow: 100, trend: 100, onChain: 0 },
  });
  const plain = (100 + 100 + 0 + 70 * 5) / 8;
  assert.ok(r.score > plain, `weighting must beat a flat mean (${r.score} vs ${plain})`);
});

test('A MISSING COMPONENT IS DROPPED AND RENORMALISED, NEVER DEFAULTED TO 50', () => {
  // This is the central honesty guarantee of the whole scoring layer.
  const r = computeMoneyFlowScore({
    scores: { spotFlow: 80, marketBreadth: 80, trend: 80 },
    reasons: { whaleFlow: 'CryptoQuant not configured' },
  });

  assert.equal(r.score, 80, 'the available evidence says 80, so the score says 80');
  assert.equal(r.covered.length, 3);
  assert.equal(r.missing.length, 5);
  assert.ok(Math.abs(r.coverage - 0.55) < 0.01, '20+15+20 of 100 weight');

  // Had the five missing components been defaulted to 50, the composite would
  // have read 66.5 — a confident-looking mid number invented from nothing.
  const ifDefaulted = (80 * 55 + 50 * 45) / 100;
  assert.equal(ifDefaulted, 66.5);
  assert.notEqual(r.score, ifDefaulted);

  assert.ok(r.confidence < 60, 'the missing inputs cost CONFIDENCE instead');
});

test('missing components carry their reason through to the UI', () => {
  const r = computeMoneyFlowScore({
    scores: { spotFlow: 80 },
    reasons: { whaleFlow: 'CryptoQuant not configured', onChain: 'no Coin Metrics coverage' },
  });
  const whale = r.components.find((c) => c.component === 'whaleFlow')!;
  assert.equal(whale.score, null);
  assert.equal(whale.unavailableReason, 'CryptoQuant not configured');
  assert.equal(whale.effectiveWeight, 0);

  const spot = r.components.find((c) => c.component === 'spotFlow')!;
  assert.equal(spot.effectiveWeight, 100, 'the only available component carries all the weight');
});

test('effective weights always sum to 100 across available components', () => {
  const r = computeMoneyFlowScore({ scores: { spotFlow: 60, trend: 40, onChain: 50 } });
  const total = r.components.reduce((s, c) => s + c.effectiveWeight, 0);
  assert.ok(Math.abs(total - 100) < 1e-9);
});

test('direction is forced NEUTRAL below the coverage floor, however extreme', () => {
  const thin = computeMoneyFlowScore({ scores: { defiLiquidity: 100 } });
  assert.equal(thin.score, 100, 'the one input available is unambiguous');
  assert.equal(thin.direction, 'NEUTRAL',
    '5% of the evidence base is not grounds to claim a market-wide inflow');
  assert.ok(thin.coverage < MIN_COVERAGE_FOR_SCORE);

  assert.equal(directionOf(90, 1), 'INFLOW');
  assert.equal(directionOf(10, 1), 'OUTFLOW');
  assert.equal(directionOf(50, 1), 'NEUTRAL');
});

test('confidence tracks both coverage and input quality', () => {
  const strong = computeMoneyFlowScore({
    scores: allComponents,
    confidences: Object.fromEntries(Object.keys(allComponents).map((k) => [k, 95])),
  });
  const weakInputs = computeMoneyFlowScore({
    scores: allComponents,
    confidences: Object.fromEntries(Object.keys(allComponents).map((k) => [k, 45])),
  });
  assert.ok(strong.confidence > weakInputs.confidence);
  assert.equal(strong.score, weakInputs.score, 'input quality never moves the score itself');
});

test('a data-quality penalty reduces confidence but not the score', () => {
  const clean = computeMoneyFlowScore({ scores: allComponents });
  const flagged = computeMoneyFlowScore({ scores: allComponents, qualityPenalty: 30 });
  assert.equal(clean.score, flagged.score);
  assert.equal(flagged.confidence, clean.confidence - 30);
});

test('with no components at all the score is neutral and coverage is zero', () => {
  const r = computeMoneyFlowScore({ scores: {} });
  assert.equal(r.score, 50);
  assert.equal(r.coverage, 0);
  assert.equal(r.confidence, 0);
  assert.equal(r.direction, 'NEUTRAL');
});

test('contributions are ranked by signed push away from neutral', () => {
  const r = computeMoneyFlowScore({
    scores: { ...allComponents, spotFlow: 95, whaleFlow: 10 },
  });
  const ranked = rankContributions(r);
  assert.equal(ranked.length, 8);
  assert.ok(Math.abs(ranked[0]!.contribution) >= Math.abs(ranked[1]!.contribution));
  const whale = ranked.find((c) => c.component === 'whaleFlow')!;
  assert.ok(whale.contribution < 0, 'a weak component shows as a negative contribution');
});

/* ================================ TREND =================================== */

function trendCandles(n: number, from: number, to: number, noise = 0): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const base = from + ((to - from) * i) / (n - 1);
    const wobble = noise === 0 ? 0 : Math.sin(i / 2) * noise;
    const close = base + wobble;
    return {
      time: i * 86400, open: close, high: close * 1.01, low: close * 0.99,
      close, volume: 1000,
    };
  });
}

test('EMA alignment scores distance, not just which side of the line', () => {
  const barelyAbove = scoreEmaAlignment(100.1, 100, 99, 98)!;
  const wellAbove = scoreEmaAlignment(130, 100, 99, 98)!;
  assert.ok(wellAbove > barelyAbove, 'a 30% trend is not the same as a 0.1% cross');
  assert.equal(scoreEmaAlignment(null, 1, 1, 1), null);
});

test('a stacked bullish EMA set beats the same distances in a tangle', () => {
  const stacked = scoreEmaAlignment(110, 105, 100, 95)!;
  const tangled = scoreEmaAlignment(110, 95, 100, 105)!;
  assert.ok(stacked > tangled);
});

test('a clean uptrend scores high across timeframes', () => {
  const r = computeTrendScore('BTC', [
    { timeframe: '1d', candles: trendCandles(250, 100, 400) },
    { timeframe: '4h', candles: trendCandles(200, 300, 400) },
  ]);
  assert.ok(r.score > 70, `expected a strong trend score, got ${r.score}`);
  assert.deepEqual(r.covered, ['1d', '4h']);
  assert.equal(r.rangebound, false);
});

test('a clean downtrend scores low', () => {
  const r = computeTrendScore('BTC', [
    { timeframe: '1d', candles: trendCandles(250, 400, 100) },
  ]);
  assert.ok(r.score < 30, `expected a weak trend score, got ${r.score}`);
});

test('THE ADX GATE PULLS A TIDY-LOOKING RANGE BACK TOWARD NEUTRAL', () => {
  // A market drifting up 2% over a year sits above every moving average and
  // is going nowhere. Without the gate this reads as a healthy uptrend.
  const drift = trendCandles(250, 100, 102, 3);
  const tf = scoreTimeframe({ timeframe: '1d', candles: drift });
  assert.ok(tf.adx != null && tf.adx < ADX_TREND_MINIMUM, `expected weak ADX, got ${tf.adx}`);
  assert.ok(Math.abs(tf.score - 50) < 20, `the gate should hold this near neutral, got ${tf.score}`);

  const real = computeTrendScore('BTC', [{ timeframe: '1d', candles: drift }]);
  assert.equal(real.rangebound, true);
});

test('a timeframe with too little history is reported, not scored as neutral', () => {
  const r = computeTrendScore('BTC', [
    { timeframe: '1d', candles: trendCandles(250, 100, 400) },
    { timeframe: '15m', candles: trendCandles(5, 100, 101) },
  ]);
  assert.deepEqual(r.missing, ['15m']);
  assert.deepEqual(r.covered, ['1d']);
  // Weight renormalises onto the daily rather than diluting it with a fake 50.
  const dailyOnly = computeTrendScore('BTC', [{ timeframe: '1d', candles: trendCandles(250, 100, 400) }]);
  assert.equal(r.score, dailyOnly.score);
});

test('trend strength labels follow ADX', () => {
  assert.equal(trendStrengthLabel(50), 'strong');
  assert.equal(trendStrengthLabel(25), 'trending');
  assert.equal(trendStrengthLabel(10), 'weak');
  assert.equal(trendStrengthLabel(null), 'unknown');
});

/* ============================== LIQUIDITY ================================= */

test('depth and volume are log-scaled, matching how liquidity actually feels', () => {
  // The gap between $10k and $110k matters; $5m vs $5.1m does not.
  const jumpAtLow = scoreDepth(110_000) - scoreDepth(10_000);
  const jumpAtHigh = scoreDepth(5_100_000) - scoreDepth(5_000_000);
  assert.ok(jumpAtLow > jumpAtHigh * 10);
  assert.equal(scoreDepth(0), 0);
  assert.ok(scoreVolume(1e9) > scoreVolume(1e6));
});

test('spread scoring is inverted and bounded', () => {
  assert.equal(scoreSpread(0.005), 100, 'tighter than the floor is perfect');
  assert.equal(scoreSpread(1), 0, 'wider than the ceiling is zero');
  assert.ok(scoreSpread(0.05) > scoreSpread(0.3));
});

test('liquidity score renormalises over available inputs and lists the rest', () => {
  const r = computeLiquidityScore({
    depthUsd: 5_000_000, spreadPct: 0.02,
    cexVolume24hUsd: null, stablecoinScore: null, defiScore: null,
  });
  assert.equal(r.components.length, 2);
  assert.equal(r.missing.length, 3);
  assert.ok(r.missing.includes('CEX volume'));
  assert.ok(r.score > 50);
});

test('liquidity direction reads change, not level', () => {
  // A deep market getting thinner is contracting, even while depth still scores well.
  assert.equal(liquidityDirection({
    depthUsd: 50_000_000, spreadPct: 0.01,
    cexVolume24hUsd: 5e8, cexVolume7dAgoUsd: 2e9,
    stablecoinScore: 30, defiScore: 30,
  }), 'contracting');

  assert.equal(liquidityDirection({
    depthUsd: 1000, spreadPct: 0.4,
    cexVolume24hUsd: 2e9, cexVolume7dAgoUsd: 5e8,
    stablecoinScore: 75, defiScore: 70,
  }), 'expanding');

  assert.equal(liquidityDirection({
    depthUsd: null, spreadPct: null, cexVolume24hUsd: null,
    stablecoinScore: null, defiScore: null,
  }), 'stable', 'no evidence means no claim');
});

/* =========================== ACC / DIST =================================== */

test("the spec's ACCUMULATION example is detected", () => {
  // Price sideways + CVD rising + whale accumulation + exchange outflow +
  // stablecoin supply rising.
  const r = computeAccDist({
    priceChangePct: 0.5,
    cvdChange: 50_000_000, totalVolume: 500_000_000,
    whaleScore: 75,
    exchangeNetflowZ: -2.0,
    stablecoinScore: 78,
    breadthScore: 60,
  });
  assert.equal(r.phase, 'ACCUMULATION');
  assert.equal(r.priceSideways, true);
  assert.ok(r.divergences.some((e) => /flat while cumulative delta rises/.test(e)));
  assert.ok(r.evidence.some((e) => /leaving exchanges/.test(e)));
  assert.ok(r.evidence.some((e) => /Stablecoin supply is expanding/.test(e)));
  assert.ok(r.strength > 40);
});

test("the spec's DISTRIBUTION WARNING example is detected", () => {
  // Price rising + CVD falling + whale exchange inflow + breadth falling.
  const r = computeAccDist({
    priceChangePct: 8,
    cvdChange: -40_000_000, totalVolume: 500_000_000,
    whaleScore: 25,
    exchangeNetflowZ: 2.2,
    stablecoinScore: 40,
    breadthScore: 30,
  });
  assert.equal(r.phase, 'DISTRIBUTION');
  assert.ok(r.divergences.some((e) => /rising while cumulative delta falls/.test(e)));
  assert.ok(r.evidence.some((e) => /arriving on exchanges/.test(e)));
  assert.ok(r.divergences.some((e) => /advance is narrow/.test(e)));
  assert.equal(isDistributionWarning(r, 8), true, 'price still rising = the warning case');
});

test('price and flow agreeing is a trend, not accumulation', () => {
  const r = computeAccDist({
    priceChangePct: 10,
    cvdChange: 50_000_000, totalVolume: 500_000_000,
    whaleScore: 55, exchangeNetflowZ: 0, stablecoinScore: 55, breadthScore: 55,
  });
  assert.equal(r.divergences.length, 0, 'price and flow point the same way');
  assert.equal(r.phase, 'NEUTRAL', 'no divergence means nothing to detect');
  assert.ok(r.bias > 50, 'the bias still leans positive — it just is not a phase');
});

test('supporting context alone cannot manufacture a phase', () => {
  // Everything bullish and agreeing: strong whale flow, expanding stablecoins,
  // rising price, rising CVD. Constructive, but not accumulation.
  const r = computeAccDist({
    priceChangePct: 12,
    cvdChange: 80_000_000, totalVolume: 400_000_000,
    whaleScore: 80, exchangeNetflowZ: -1.5, stablecoinScore: 80, breadthScore: 70,
  });
  assert.ok(r.bias > 70, 'the bias is strongly positive');
  assert.ok(r.evidence.length > 0, 'and there is supporting context');
  assert.equal(r.divergences.length, 0);
  assert.equal(r.phase, 'NEUTRAL', 'but agreement is a trend, not a phase');
});

test('acc/dist reports missing inputs rather than assuming them', () => {
  const r = computeAccDist({
    priceChangePct: null, cvdChange: null, totalVolume: null,
    whaleScore: null, exchangeNetflowZ: null, stablecoinScore: null, breadthScore: null,
  });
  assert.equal(r.phase, 'NEUTRAL');
  assert.equal(r.bias, 50);
  assert.equal(r.missing.length, 5);
});

/* ================================ REGIME ================================== */

const baseRegimeInput = {
  compositeScore: 50, trendScore: 50, breadthScore: 50, adx: 30,
  priceChangePct: 0, accDist: null, volumeZ: 0, spotFlowScore: 50, coverage: 1,
};

test('bands provide the starting regime', () => {
  assert.equal(bandFor(85), 'STRONG_BULL');
  assert.equal(bandFor(70), 'BULL');
  assert.equal(bandFor(50), 'NEUTRAL');
  assert.equal(bandFor(35), 'BEAR');
  assert.equal(bandFor(20), 'STRONG_BEAR');
  assert.equal(bandFor(5), 'CAPITULATION');
});

test('DISTRIBUTION overrides a bullish band — a top looks bullish by the numbers', () => {
  const r = computeRegime({
    ...baseRegimeInput, compositeScore: 70, trendScore: 75,
    accDist: {
      phase: 'DISTRIBUTION', strength: 60, bias: 20, priceSideways: false,
      divergences: [], evidence: [], missing: [], scoredAt: 0,
    },
  });
  assert.equal(r.baseRegime, 'BULL');
  assert.equal(r.regime, 'DISTRIBUTION');
  assert.match(r.overrideReason!, /sold into/);
});

test('BULL_ACCUMULATION overrides a mid band — a base being built', () => {
  const r = computeRegime({
    ...baseRegimeInput, compositeScore: 52,
    accDist: {
      phase: 'ACCUMULATION', strength: 55, bias: 78, priceSideways: true,
      divergences: [], evidence: [], missing: [], scoredAt: 0,
    },
  });
  assert.equal(r.baseRegime, 'NEUTRAL');
  assert.equal(r.regime, 'BULL_ACCUMULATION');
  assert.ok(isBullish(r.regime));
});

test('RANGE overrides NEUTRAL when ADX says there is no trend', () => {
  const r = computeRegime({ ...baseRegimeInput, compositeScore: 50, adx: 12 });
  assert.equal(r.regime, 'RANGE');
  assert.match(r.overrideReason!, /ADX/);
});

test('CAPITULATION requires the volume and flow evidence, not just a low score', () => {
  const noEvidence = computeRegime({
    ...baseRegimeInput, compositeScore: 8, trendScore: 10, breadthScore: 10,
    volumeZ: 0.2, spotFlowScore: 45,
  });
  assert.equal(noEvidence.baseRegime, 'CAPITULATION');
  assert.equal(noEvidence.regime, 'STRONG_BEAR', 'a bad score alone is a downtrend');
  assert.match(noEvidence.overrideReason!, /without the volume spike/);

  const withEvidence = computeRegime({
    ...baseRegimeInput, compositeScore: 8, trendScore: 10, breadthScore: 10,
    volumeZ: 3.5, spotFlowScore: 12,
  });
  assert.equal(withEvidence.regime, 'CAPITULATION');
  assert.ok(isBearish(withEvidence.regime));
});

test('an extreme regime is softened when coverage is thin', () => {
  const thin = computeRegime({
    ...baseRegimeInput, compositeScore: 88, trendScore: 90, breadthScore: 85, coverage: 0.4,
  });
  assert.equal(thin.baseRegime, 'STRONG_BULL');
  assert.equal(thin.regime, 'BULL', 'not a broad enough evidence base for an extreme');
  assert.match(thin.overrideReason!, /40%/);
  assert.ok(MIN_COVERAGE_FOR_EXTREME > 0.5);

  const broad = computeRegime({
    ...baseRegimeInput, compositeScore: 88, trendScore: 90, breadthScore: 85, coverage: 1,
  });
  assert.equal(broad.regime, 'STRONG_BULL');
});

test('conviction rises with agreement and coverage', () => {
  const agreeing = computeRegime({
    ...baseRegimeInput, compositeScore: 85, trendScore: 85, breadthScore: 82,
    spotFlowScore: 80, coverage: 1,
  });
  const disagreeing = computeRegime({
    ...baseRegimeInput, compositeScore: 85, trendScore: 30, breadthScore: 35,
    spotFlowScore: 40, coverage: 1,
  });
  assert.ok(agreeing.conviction > disagreeing.conviction + 20);
});

/* ================================ SIGNAL ================================== */

const baseSignalInput = {
  compositeScore: 50, dataConfidence: 90, coverage: 1,
  regime: 'NEUTRAL' as const, regimeConviction: 50, accDist: null,
  trendScore: 50, breadthScore: 50, spotFlowScore: 50,
};

test('signal states follow the bands', () => {
  assert.equal(stateFor(85), 'HIGH_CONFIDENCE_BULLISH');
  assert.equal(stateFor(65), 'BULLISH');
  assert.equal(stateFor(50), 'NEUTRAL');
  assert.equal(stateFor(38), 'CAUTION');
  assert.equal(stateFor(25), 'BEARISH');
  assert.equal(stateFor(10), 'HIGH_CONFIDENCE_BEARISH');
});

test('A HIGH-CONFIDENCE STATE REQUIRES HIGH-CONFIDENCE DATA', () => {
  // 90/100 built on a quarter of the inputs is not a high-confidence reading.
  const thin = computeSignal({
    ...baseSignalInput, compositeScore: 88, dataConfidence: 45, coverage: 0.25,
    trendScore: 85, breadthScore: 85, spotFlowScore: 85,
  });
  assert.equal(thin.rawState, 'HIGH_CONFIDENCE_BULLISH');
  assert.equal(thin.state, 'BULLISH', 'downgraded, not published as high confidence');
  assert.match(thin.downgradeReason!, /Data confidence/);
  assert.match(thin.downgradeReason!, /25%/);
  assert.ok(HIGH_CONFIDENCE_MIN_DATA_QUALITY >= 70);

  const solid = computeSignal({
    ...baseSignalInput, compositeScore: 88, dataConfidence: 92, coverage: 1,
    trendScore: 85, breadthScore: 85, spotFlowScore: 85,
  });
  assert.equal(solid.state, 'HIGH_CONFIDENCE_BULLISH');
  assert.equal(solid.downgradeReason, null);
});

test('a bullish score with contradicting evidence is reported as CAUTION', () => {
  const r = computeSignal({
    ...baseSignalInput, compositeScore: 68,
    trendScore: 75, breadthScore: 30, spotFlowScore: 35,
  });
  assert.equal(r.rawState, 'BULLISH');
  assert.equal(r.state, 'CAUTION');
  assert.ok(r.contradictions.length >= 2);
  assert.ok(r.contradictions.some((c) => /not backed by aggressive buying/.test(c)));
  assert.ok(r.contradictions.some((c) => /narrow set of assets/.test(c)));
});

test('a distribution phase never presents as bullish, whatever the score', () => {
  const r = computeSignal({
    ...baseSignalInput, compositeScore: 72, trendScore: 70, breadthScore: 65, spotFlowScore: 62,
    accDist: {
      phase: 'DISTRIBUTION', strength: 65, bias: 18, priceSideways: false,
      divergences: [], evidence: [], missing: [], scoredAt: 0,
    },
  });
  assert.equal(r.state, 'CAUTION');
  assert.match(r.downgradeReason!, /distribution/i);
});

test('derivative warnings become contradictions the user sees', () => {
  const r = computeSignal({
    ...baseSignalInput, compositeScore: 70, trendScore: 70, breadthScore: 68, spotFlowScore: 66,
    derivativeWarnings: ['Funding is rich (120% annualised) — long positioning is crowded.'],
  });
  assert.ok(r.contradictions.some((c) => /crowded/.test(c)));
});

test('signal confidence falls with each contradiction', () => {
  const clean = computeSignal({ ...baseSignalInput, compositeScore: 75, regimeConviction: 80,
    trendScore: 75, breadthScore: 72, spotFlowScore: 74 });
  const messy = computeSignal({ ...baseSignalInput, compositeScore: 75, regimeConviction: 80,
    trendScore: 75, breadthScore: 30, spotFlowScore: 35 });
  assert.ok(messy.confidence < clean.confidence);
});

test('every rule that fired is recorded, so a signal is auditable', () => {
  const r = computeSignal({
    ...baseSignalInput, compositeScore: 88, dataConfidence: 40, coverage: 0.2,
    trendScore: 85, breadthScore: 85, spotFlowScore: 85,
  });
  assert.ok(r.rulesFired.length >= 2);
  assert.ok(r.rulesFired.some((x) => /composite/.test(x)));
  assert.ok(r.rulesFired.some((x) => /guard/.test(x)));
});

test('contradictions are found in both directions', () => {
  const absorbing = findContradictions({
    ...baseSignalInput, compositeScore: 40, trendScore: 30, spotFlowScore: 70,
  });
  assert.ok(absorbing.some((c) => /selling is being absorbed/i.test(c)));
});

/* ============================== LANGUAGE ================================== */

test('forbidden certainty language is caught', () => {
  const bad = [
    'BTC chắc chắn tăng trong tuần này',
    'This is a guaranteed setup',
    'Our win rate is 92%',
    'It will definitely break out',
    'A risk-free entry',
    "You can't lose here",
    'This is a sure thing',
    'MUST BUY now',
    'This is financial advice',
    'SOL is mooning',
  ];
  for (const text of bad) {
    assert.ok(!isCompliant(text), `should have been rejected: "${text}"`);
    assert.ok(findViolations(text)[0]!.why.length > 0, 'and explain why');
  }
});

test('probability language passes', () => {
  const good = [
    'Spot flow and breadth are consistent with continued upside, though funding is elevated.',
    'Confidence is moderate: 5 of 8 inputs were available.',
    'The probability of a short-term pullback is elevated as open interest builds.',
    'Derivatives confirm the move; the main risk is crowded long positioning.',
  ];
  for (const text of good) {
    assert.ok(isCompliant(text), `should have passed: "${text}"`);
  }
  assert.doesNotThrow(() => assertCompliant(good));
});

test('assertCompliant fails loudly and names the offending phrase', () => {
  assert.throws(
    () => assertCompliant(['Fine text', 'This is a guaranteed win']),
    /guaranteed/,
  );
});

test('the phrase helpers themselves stay compliant', () => {
  for (const v of [0, 25, 50, 75, 100]) {
    assert.ok(isCompliant(describeConfidence(v)));
    assert.ok(isCompliant(describeBias(v)));
  }
  assert.equal(describeBias(80), 'strongly favours upside');
  assert.equal(describeConfidence(85), 'a high-confidence reading');
});
