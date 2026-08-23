/**
 * Deterministic analyst — the default provider.
 *
 * Reads the score breakdown and writes WHY / RISKS / contradictions / scenarios
 * in probability language. Every figure it prints is taken verbatim from its
 * input; it performs no arithmetic beyond formatting, so it cannot produce a
 * number the scoring layer did not compute.
 *
 * Everything it returns passes through the language guard before it leaves this
 * module, so a phrasing that claims certainty fails loudly in development
 * instead of reaching a user.
 */
import type {
  AnalystInput, AnalystProvider, AnalystReport, Scenario,
} from '@/lib/analyst/types';
import { REGIME_LABELS } from '@/lib/scoring/config';
import { rankContributions } from '@/lib/scoring/moneyFlow';
import { assertCompliant, describeBias, describeConfidence } from '@/lib/scoring/language';
import { isBullish, isBearish } from '@/lib/scoring/regime';

const pct = (v: number | null | undefined, digits = 1): string =>
  v == null || !Number.isFinite(v) ? 'n/a' : `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`;

const score = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? 'unavailable' : `${Math.round(v)}/100`;

/* --------------------------------- WHY ------------------------------------ */

function buildWhy(input: AnalystInput): string[] {
  const why: string[] = [];
  const { moneyFlow, regime, accDist, scores, context } = input;

  // Lead with the components that actually moved the composite, in order.
  const ranked = rankContributions(moneyFlow).filter((c) => Math.abs(c.contribution) >= 1);
  const positive = ranked.filter((c) => c.contribution > 0).slice(0, 4);
  const negative = ranked.filter((c) => c.contribution < 0).slice(0, 3);

  if (positive.length > 0) {
    why.push(
      `Supporting the reading: ${positive.map((c) => `${c.label} at ${score(
        moneyFlow.components.find((x) => x.component === c.component)?.score,
      )}`).join(', ')}.`,
    );
  }
  if (negative.length > 0) {
    why.push(
      `Weighing against it: ${negative.map((c) => `${c.label} at ${score(
        moneyFlow.components.find((x) => x.component === c.component)?.score,
      )}`).join(', ')}.`,
    );
  }

  if (scores.spotFlow != null && scores.spotFlow >= 60) {
    why.push('Spot flow is net positive — aggressive buying is outpacing aggressive selling.');
  } else if (scores.spotFlow != null && scores.spotFlow <= 40) {
    why.push('Spot flow is net negative — aggressive selling is outpacing aggressive buying.');
  }

  if (scores.breadth != null && scores.breadth >= 60) {
    why.push('Market breadth is participating, so the move is not carried by a handful of assets.');
  } else if (scores.breadth != null && scores.breadth <= 40) {
    why.push('Market breadth is narrow — participation is limited.');
  }

  if (context?.stablecoinChange7dPct != null && Math.abs(context.stablecoinChange7dPct) > 0.5) {
    const direction = context.stablecoinChange7dPct > 0 ? 'expanding' : 'contracting';
    why.push(
      `Stablecoin supply is ${direction} (${pct(context.stablecoinChange7dPct, 2)} over 7 days) — `
      + `${direction === 'expanding' ? 'dry powder is building' : 'capital is leaving the system'}.`,
    );
  }

  if (accDist && accDist.divergences.length > 0) {
    why.push(...accDist.divergences);
  }

  if (regime.overrideReason) why.push(regime.overrideReason);

  if (why.length === 0) {
    why.push(
      `No component is far enough from neutral to explain a directional reading; the composite sits `
      + `at ${score(moneyFlow.score)} with ${Math.round(moneyFlow.coverage * 100)}% of inputs available.`,
    );
  }
  return why;
}

/* -------------------------------- RISKS ----------------------------------- */

function buildRisks(input: AnalystInput): string[] {
  const risks: string[] = [];
  const { moneyFlow, regime, signal, scores, context } = input;

  if (context?.fundingAnnualizedPct != null && context.fundingAnnualizedPct > 30) {
    risks.push(
      `Funding is elevated at ${pct(context.fundingAnnualizedPct)} annualised — leveraged long `
      + 'positioning is crowded, which raises the probability of a leverage-driven pullback.',
    );
  }
  if (context?.oiChange24hPct != null && context.oiChange24hPct > 15) {
    risks.push(
      `Open interest is up ${pct(context.oiChange24hPct)} in 24 hours — leverage is building `
      + 'quickly, so moves in either direction may be amplified.',
    );
  }
  if (context?.btcDominance != null && context.btcDominance > 55 && (scores.breadth ?? 50) < 50) {
    risks.push(
      `BTC dominance is ${context.btcDominance.toFixed(1)}% while breadth is ${score(scores.breadth)} — `
      + 'capital is concentrated rather than rotating outward.',
    );
  }

  if (moneyFlow.coverage < 0.6) {
    risks.push(
      `Only ${Math.round(moneyFlow.coverage * 100)}% of the scoring inputs were available, so this is `
      + `${describeConfidence(moneyFlow.confidence)} rather than a complete picture.`,
    );
  }

  if (signal.downgradeReason) risks.push(signal.downgradeReason);

  if (isBullish(regime.regime) && (scores.derivatives ?? 50) < 45) {
    risks.push('Derivatives positioning is not confirming the spot picture.');
  }
  if (isBearish(regime.regime) && (scores.stablecoin ?? 50) > 60) {
    risks.push(
      'Stablecoin liquidity is still expanding despite the weak reading — capital has not left, '
      + 'which cuts both ways.',
    );
  }

  if (regime.conviction < 40) {
    risks.push(
      `Regime conviction is ${score(regime.conviction)} — the independent inputs are not `
      + 'agreeing strongly, so this reading is more easily invalidated than usual.',
    );
  }

  if (risks.length === 0) {
    risks.push('No specific leverage, concentration or data-coverage risk stands out in the current inputs.');
  }
  return risks;
}

/* ------------------------------ SCENARIOS --------------------------------- */

function buildScenarios(input: AnalystInput): Scenario[] {
  const { regime, signal, scores, accDist } = input;
  const out: Scenario[] = [];
  const bull = isBullish(regime.regime);
  const bear = isBearish(regime.regime);

  if (bull) {
    out.push({
      kind: 'primary',
      name: 'Continuation',
      description:
        'If spot flow stays net positive and breadth holds, the current reading is consistent with '
        + 'continued upside.',
      confirmation:
        'Cumulative delta continuing to rise alongside price, and the share of assets above their '
        + '50-day average holding or improving.',
    });
    out.push({
      kind: 'risk',
      name: 'Leverage flush',
      description:
        'If funding stays rich while spot flow fades, a leverage-driven pullback becomes more '
        + 'probable even without a change in the underlying trend.',
      confirmation:
        'Open interest rising while cumulative delta flattens, followed by a sharp move against '
        + 'the crowded side.',
    });
  } else if (bear) {
    out.push({
      kind: 'primary',
      name: 'Continuation lower',
      description:
        'With flow and breadth both weak, the reading is consistent with further downside.',
      confirmation: 'Cumulative delta making lower lows alongside price, and breadth staying narrow.',
    });
    out.push({
      kind: 'alternate',
      name: 'Absorption',
      description:
        'If cumulative delta begins to rise while price is still falling, sellers are being '
        + 'absorbed and the probability of a base forming increases.',
      confirmation: 'Rising CVD against flat or falling price, plus exchange outflow.',
    });
  } else {
    out.push({
      kind: 'primary',
      name: 'Range persistence',
      description:
        'With no component decisively away from neutral, the reading is consistent with the '
        + 'market continuing to range.',
      confirmation: 'Trend strength staying low and breadth staying near the middle of its scale.',
    });
  }

  if (accDist?.phase === 'ACCUMULATION') {
    out.push({
      kind: 'alternate',
      name: 'Base resolves upward',
      description:
        'Flow is building underneath a quiet price. If that continues, the probability of an '
        + 'upside resolution increases — though a base can persist far longer than expected.',
      confirmation: 'Continued CVD expansion and exchange outflow while price stays contained.',
    });
  }
  if (accDist?.phase === 'DISTRIBUTION') {
    out.push({
      kind: 'risk',
      name: 'Top forms',
      description:
        'Supply is being distributed into strength. If breadth keeps narrowing while price holds up, '
        + 'the risk of a reversal increases.',
      confirmation: 'CVD continuing to fall against a flat or rising price, plus exchange inflow.',
    });
  }

  if (signal.contradictions.length >= 2) {
    out.push({
      kind: 'risk',
      name: 'Unresolved disagreement',
      description:
        'The inputs are pointing in different directions. Until they converge, confidence in any '
        + 'single path is reduced.',
      confirmation: 'Trend, spot flow and breadth moving back onto the same side of neutral.',
    });
  }
  return out;
}

/* -------------------------------- SUMMARY --------------------------------- */

function buildSummary(input: AnalystInput): string {
  const { symbol, moneyFlow, regime, signal, scores } = input;
  const parts: string[] = [];

  parts.push(
    `${symbol} is in a ${REGIME_LABELS[regime.regime]} regime with a Money Flow Score of `
    + `${score(moneyFlow.score)}, which ${describeBias(moneyFlow.score)}.`,
  );

  const named: string[] = [];
  if (scores.trend != null) named.push(`Trend ${score(scores.trend)}`);
  if (scores.spotFlow != null) named.push(`Spot Flow ${score(scores.spotFlow)}`);
  if (scores.breadth != null) named.push(`Breadth ${score(scores.breadth)}`);
  if (named.length > 0) parts.push(`${named.join(', ')}.`);

  parts.push(
    `The signal is ${signal.label} at ${score(signal.confidence)} confidence, based on `
    + `${Math.round(moneyFlow.coverage * 100)}% of the scoring inputs.`,
  );

  if (signal.contradictions.length > 0) {
    parts.push(
      `${signal.contradictions.length} input${signal.contradictions.length === 1 ? '' : 's'} `
      + 'contradict the headline reading — see the risks below.',
    );
  }
  return parts.join(' ');
}

function buildBlindSpots(input: AnalystInput): string[] {
  const out: string[] = [];
  for (const c of input.moneyFlow.components) {
    if (c.score == null) out.push(`${c.label}: ${c.unavailableReason ?? 'not available'}`);
  }
  for (const u of input.unavailable ?? []) out.push(`${u.source}: ${u.reason}`);
  return out;
}

/* ------------------------------- provider --------------------------------- */

export const ruleBasedAnalyst: AnalystProvider = {
  id: 'rule-based',
  label: 'VDEAR Rule-Based Analyst',
  available: () => true,

  async analyze(input: AnalystInput): Promise<AnalystReport> {
    const report: AnalystReport = {
      symbol: input.symbol.toUpperCase(),
      summary: buildSummary(input),
      why: buildWhy(input),
      risks: buildRisks(input),
      contradictions: input.signal.contradictions,
      blindSpots: buildBlindSpots(input),
      scenarios: buildScenarios(input),
      provider: 'rule-based',
      generatedAt: Date.now(),
    };

    // Nothing leaves this module claiming certainty.
    assertCompliant([
      report.summary,
      ...report.why,
      ...report.risks,
      ...report.contradictions,
      ...report.scenarios.flatMap((s) => [s.name, s.description, s.confirmation]),
    ]);

    return report;
  },
};
