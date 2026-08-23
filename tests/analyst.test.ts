/**
 * ANALYST.
 *
 * The spec's constraint is that the analyst EXPLAINS and never produces data.
 * These tests verify that structurally: every figure in the output must appear
 * in the input, and nothing it emits may claim certainty.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ruleBasedAnalyst, analyze, selectAnalyst } from '@/lib/analyst';
import type { AnalystInput } from '@/lib/analyst/types';
import { computeMoneyFlowScore } from '@/lib/scoring/moneyFlow';
import { computeRegime } from '@/lib/scoring/regime';
import { computeSignal } from '@/lib/scoring/signal';
import { computeAccDist } from '@/lib/scoring/accDist';
import { isCompliant, findViolations } from '@/lib/scoring/language';

function buildInput(overrides: Partial<AnalystInput> = {}): AnalystInput {
  const moneyFlow = computeMoneyFlowScore({
    scores: {
      spotFlow: 76, marketBreadth: 71, stablecoinLiquidity: 74, trend: 82,
      onChain: 72, whaleFlow: 75, defiLiquidity: 66, derivativesConfirmation: 55,
    },
  });
  const accDist = computeAccDist({
    priceChangePct: 1.2, cvdChange: 40_000_000, totalVolume: 500_000_000,
    whaleScore: 75, exchangeNetflowZ: -1.6, stablecoinScore: 74, breadthScore: 71,
  });
  const regime = computeRegime({
    compositeScore: moneyFlow.score, trendScore: 82, breadthScore: 71, adx: 32,
    priceChangePct: 1.2, accDist, volumeZ: 0.8, spotFlowScore: 76, coverage: 1,
  });
  const signal = computeSignal({
    compositeScore: moneyFlow.score, dataConfidence: moneyFlow.confidence,
    coverage: moneyFlow.coverage, regime: regime.regime,
    regimeConviction: regime.conviction, accDist,
    trendScore: 82, breadthScore: 71, spotFlowScore: 76,
  });

  return {
    symbol: 'BTC', moneyFlow, regime, signal, accDist,
    scores: {
      trend: 82, liquidity: 71, breadth: 71, onChain: 72,
      whale: 75, spotFlow: 76, stablecoin: 74, derivatives: 55,
    },
    context: {
      priceChange24h: 1.2, fundingAnnualizedPct: 42, oiChange24hPct: 18,
      stablecoinChange7dPct: 1.8, btcDominance: 54.2,
    },
    ...overrides,
  };
}

test('the analyst produces WHY, RISKS, contradictions and scenarios', async () => {
  const r = await ruleBasedAnalyst.analyze(buildInput());
  assert.equal(r.symbol, 'BTC');
  assert.ok(r.summary.length > 40);
  assert.ok(r.why.length > 0);
  assert.ok(r.risks.length > 0);
  assert.ok(r.scenarios.length > 0);
  assert.equal(r.provider, 'rule-based');
});

test('EVERY NUMBER IN THE OUTPUT APPEARS IN THE INPUT', async () => {
  // The structural guarantee: the analyst formats, it does not compute.
  const input = buildInput();
  const r = await ruleBasedAnalyst.analyze(input);

  const allowed = new Set<number>();
  const allow = (v: number | null | undefined) => {
    if (v == null || !Number.isFinite(v)) return;
    allowed.add(Math.round(v));
    allowed.add(Math.round(v * 10) / 10);
    allowed.add(Math.round(v * 100) / 100);
  };

  allow(input.moneyFlow.score);
  allow(input.moneyFlow.confidence);
  allow(input.moneyFlow.coverage * 100);
  allow(input.regime.conviction);
  allow(input.signal.confidence);
  allow(input.signal.contradictions.length);
  for (const c of input.moneyFlow.components) allow(c.score);
  for (const v of Object.values(input.scores)) allow(v);
  for (const v of Object.values(input.context ?? {})) allow(v);
  // Structural constants that appear in fixed phrasing, not as data claims.
  [0, 1, 7, 24, 50, 100].forEach(allow);

  const text = [r.summary, ...r.why, ...r.risks,
    ...r.scenarios.flatMap((s) => [s.description, s.confirmation])].join(' ');

  const numbers = (text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  for (const n of numbers) {
    assert.ok(allowed.has(n), `analyst emitted ${n}, which is not in its input`);
  }
});

test('nothing the analyst writes claims certainty', async () => {
  const cases = [
    buildInput(),
    buildInput({ symbol: 'ETH' }),
  ];
  for (const input of cases) {
    const r = await ruleBasedAnalyst.analyze(input);
    const texts = [r.summary, ...r.why, ...r.risks, ...r.contradictions,
      ...r.blindSpots, ...r.scenarios.flatMap((s) => [s.name, s.description, s.confirmation])];
    for (const t of texts) {
      assert.ok(isCompliant(t), `non-compliant: "${t}" ${JSON.stringify(findViolations(t))}`);
    }
  }
});

test('crowded funding and building OI are surfaced as risks', async () => {
  const r = await ruleBasedAnalyst.analyze(buildInput());
  assert.ok(r.risks.some((x) => /[Ff]unding is elevated/.test(x)));
  assert.ok(r.risks.some((x) => /[Oo]pen interest is up/.test(x)));
  // And phrased as probability, not prediction.
  assert.ok(r.risks.some((x) => /probability/.test(x)));
});

test('THE ANALYST STATES WHAT IT CANNOT SEE', async () => {
  const moneyFlow = computeMoneyFlowScore({
    scores: { spotFlow: 80, trend: 78, marketBreadth: 70 },
    reasons: {
      whaleFlow: 'CryptoQuant not configured',
      onChain: 'Coin Metrics has no coverage for this asset',
    },
  });
  const input = buildInput({ moneyFlow });
  const r = await ruleBasedAnalyst.analyze(input);

  assert.ok(r.blindSpots.length >= 5, 'each missing component is named');
  assert.ok(r.blindSpots.some((b) => /CryptoQuant not configured/.test(b)));
  assert.ok(r.blindSpots.some((b) => /no coverage/.test(b)));
  assert.ok(r.risks.some((x) => /scoring inputs were available/.test(x)),
    'thin coverage is raised as a risk, not hidden');
});

test('an unavailable provider is reported by name', async () => {
  const r = await ruleBasedAnalyst.analyze(buildInput({
    unavailable: [{ source: 'Glassnode', reason: 'not configured' }],
  }));
  assert.ok(r.blindSpots.some((b) => /Glassnode: not configured/.test(b)));
});

test('a distribution phase produces a top-forming risk scenario', async () => {
  const accDist = computeAccDist({
    priceChangePct: 9, cvdChange: -50_000_000, totalVolume: 500_000_000,
    whaleScore: 25, exchangeNetflowZ: 2.1, stablecoinScore: 38, breadthScore: 28,
  });
  assert.equal(accDist.phase, 'DISTRIBUTION');

  const r = await ruleBasedAnalyst.analyze(buildInput({ accDist }));
  assert.ok(r.scenarios.some((s) => s.kind === 'risk' && /Top forms/.test(s.name)));
  assert.ok(r.why.some((w) => /cumulative delta falls/.test(w)));
});

test('an accumulation phase produces a base-resolving scenario', async () => {
  const accDist = computeAccDist({
    priceChangePct: 0.4, cvdChange: 60_000_000, totalVolume: 500_000_000,
    whaleScore: 78, exchangeNetflowZ: -2.1, stablecoinScore: 76, breadthScore: 62,
  });
  assert.equal(accDist.phase, 'ACCUMULATION');

  const r = await ruleBasedAnalyst.analyze(buildInput({ accDist }));
  assert.ok(r.scenarios.some((s) => /Base resolves upward/.test(s.name)));
  // And it says a base can persist — no timing claim.
  assert.ok(r.scenarios.some((s) => /persist far longer than expected/.test(s.description)));
});

test('every scenario names what would confirm it', async () => {
  const r = await ruleBasedAnalyst.analyze(buildInput());
  for (const s of r.scenarios) {
    assert.ok(s.confirmation.length > 20, `scenario "${s.name}" has no confirmation criteria`);
    assert.ok(['primary', 'alternate', 'risk'].includes(s.kind));
  }
});

test('the analyst is deterministic — same input, same prose', async () => {
  const input = buildInput();
  const a = await ruleBasedAnalyst.analyze(input);
  const b = await ruleBasedAnalyst.analyze(input);
  assert.equal(a.summary, b.summary);
  assert.deepEqual(a.why, b.why);
  assert.deepEqual(a.risks, b.risks);
  assert.deepEqual(a.scenarios.map((s) => s.name), b.scenarios.map((s) => s.name));
});

test('a neutral, low-coverage picture is described as such, not padded', async () => {
  const moneyFlow = computeMoneyFlowScore({ scores: { defiLiquidity: 52 } });
  const r = await ruleBasedAnalyst.analyze(buildInput({
    moneyFlow,
    scores: {
      trend: null, liquidity: null, breadth: null, onChain: null,
      whale: null, spotFlow: null, stablecoin: null, derivatives: null,
    },
    context: {},
  }));
  assert.ok(r.risks.some((x) => /scoring inputs were available/.test(x)));
  assert.ok(r.blindSpots.length >= 7);
  assert.ok(isCompliant(r.summary));
});

test('the default provider is always available and needs no key', () => {
  assert.equal(ruleBasedAnalyst.available(), true);
  assert.equal(selectAnalyst().id, 'rule-based');
});

test('the module-level analyze() delegates to the selected provider', async () => {
  const r = await analyze(buildInput());
  assert.equal(r.provider, 'rule-based');
});
