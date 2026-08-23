/**
 * VDEAR MONEY FLOW SCORE (spec: MONEY FLOW ENGINE) — the core feature.
 *
 * A 0..100 composite of eight components, weighted by lib/scoring/config.
 *
 * ── The renormalisation rule, which is the whole design ─────────────────────
 * When a component is unavailable — no CryptoQuant key, Coin Metrics has no
 * coverage for this asset, an exchange circuit is open — it is DROPPED and the
 * remaining weights are renormalised. It is NOT substituted with 50.
 *
 * Substituting a neutral 50 looks harmless and is not: with three strong
 * components at 80 and five defaulted to 50, the composite reads 61 — a
 * confident-looking mid number manufactured out of missing data. Dropping them
 * gives 80 with a stated coverage of 3/8 and a much lower confidence, which is
 * an honest description of the same situation.
 *
 * So a missing input lowers CONFIDENCE, never the SCORE.
 */
import { clamp } from '@/lib/indicators/series';
import { combineConfidence } from '@/lib/quality/confidence';
import {
  MONEY_FLOW_LABELS, MONEY_FLOW_WEIGHTS,
  type MoneyFlowComponent, type MoneyFlowWeights,
} from '@/lib/scoring/config';

export interface ComponentScore {
  component: MoneyFlowComponent;
  label: string;
  /** 0..100, or null when the component could not be computed. */
  score: number | null;
  /** Configured weight (percentage points of the total). */
  weight: number;
  /** Weight after renormalising over the available components. */
  effectiveWeight: number;
  /** 0..100 — how well this component's own inputs were known. */
  confidence: number;
  /** Why it is missing, when it is. Shown verbatim in the UI. */
  unavailableReason?: string;
}

export type FlowDirection = 'INFLOW' | 'OUTFLOW' | 'NEUTRAL';

export interface MoneyFlowScore {
  score: number;
  direction: FlowDirection;
  components: ComponentScore[];
  /** Components that contributed. */
  covered: MoneyFlowComponent[];
  /** Components that could not be computed. */
  missing: MoneyFlowComponent[];
  /** Share of total configured weight that was actually available, 0..1. */
  coverage: number;
  /** 0..100 confidence in this score, driven by coverage and input quality. */
  confidence: number;
  scoredAt: number;
}

export interface MoneyFlowInput {
  scores: Partial<Record<MoneyFlowComponent, number | null>>;
  /** Per-component confidence, 0..100. Defaults to 75 when unstated. */
  confidences?: Partial<Record<MoneyFlowComponent, number>>;
  /** Human-readable reasons for missing components. */
  reasons?: Partial<Record<MoneyFlowComponent, string>>;
  weights?: MoneyFlowWeights;
  /** Extra penalty from the data-quality layer (cross-source anomalies). */
  qualityPenalty?: number;
  now?: number;
}

/** Below this coverage the composite is not a meaningful market-wide claim. */
export const MIN_COVERAGE_FOR_SCORE = 0.35;

export function computeMoneyFlowScore(input: MoneyFlowInput): MoneyFlowScore {
  const weights = input.weights ?? MONEY_FLOW_WEIGHTS;
  const now = input.now ?? Date.now();
  const keys = Object.keys(weights) as MoneyFlowComponent[];

  const available: { key: MoneyFlowComponent; score: number; weight: number; confidence: number }[] = [];
  const missing: MoneyFlowComponent[] = [];

  for (const key of keys) {
    const score = input.scores[key];
    const weight = weights[key];
    if (score == null || !Number.isFinite(score)) {
      missing.push(key);
      continue;
    }
    available.push({
      key, weight,
      score: clamp(score),
      confidence: input.confidences?.[key] ?? 75,
    });
  }

  const totalWeight = keys.reduce((s, k) => s + weights[k], 0);
  const availableWeight = available.reduce((s, a) => s + a.weight, 0);
  const coverage = totalWeight > 0 ? availableWeight / totalWeight : 0;

  // Renormalise over what we have. This is the line that keeps a missing input
  // from manufacturing a mid-range reading.
  const score = availableWeight > 0
    ? clamp(available.reduce((s, a) => s + a.score * a.weight, 0) / availableWeight)
    : 50;

  const components: ComponentScore[] = keys.map((key) => {
    const found = available.find((a) => a.key === key);
    return {
      component: key,
      label: MONEY_FLOW_LABELS[key],
      score: found ? found.score : null,
      weight: weights[key],
      effectiveWeight: found && availableWeight > 0 ? (found.weight / availableWeight) * 100 : 0,
      confidence: found ? found.confidence : 0,
      unavailableReason: found ? undefined : (input.reasons?.[key] ?? 'not available'),
    };
  });

  const baseConfidence = combineConfidence(
    available.map((a) => ({ value: a.confidence, weight: a.weight })),
    keys.length,
  );
  const confidence = clamp(baseConfidence - (input.qualityPenalty ?? 0));

  return {
    score,
    direction: directionOf(score, coverage),
    components,
    covered: available.map((a) => a.key),
    missing,
    coverage,
    confidence,
    scoredAt: now,
  };
}

/**
 * INFLOW / OUTFLOW / NEUTRAL.
 *
 * Below MIN_COVERAGE_FOR_SCORE the direction is forced to NEUTRAL however
 * extreme the number looks: two of eight components agreeing is not evidence of
 * a market-wide capital flow, and claiming otherwise is exactly the kind of
 * overstatement this system is built to avoid.
 */
export function directionOf(score: number, coverage: number): FlowDirection {
  if (coverage < MIN_COVERAGE_FOR_SCORE) return 'NEUTRAL';
  if (score >= 60) return 'INFLOW';
  if (score <= 40) return 'OUTFLOW';
  return 'NEUTRAL';
}

/** Components ranked by how much they pushed the score away from neutral. */
export function rankContributions(result: MoneyFlowScore): {
  component: MoneyFlowComponent; label: string; contribution: number;
}[] {
  return result.components
    .filter((c) => c.score != null)
    .map((c) => ({
      component: c.component,
      label: c.label,
      // Signed: positive pushed the composite up, negative pulled it down.
      contribution: ((c.score as number) - 50) * (c.effectiveWeight / 100),
    }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}
