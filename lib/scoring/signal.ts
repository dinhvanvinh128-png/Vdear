/**
 * SIGNAL ENGINE (spec: SIGNAL ENGINE).
 *
 * "Không đưa ra tín hiệu mua/bán chỉ dựa vào AI. Rule engine mới quyết định
 * Score." Every number here comes from deterministic rules over the computed
 * scores. The analyst (lib/analyst) may only EXPLAIN this output; it cannot
 * change it, and it never sees a path that would let it.
 *
 * The state is derived from the composite, then constrained by two guards:
 *
 *   1. A HIGH_CONFIDENCE state requires the DATA to be good enough. A 90/100
 *      built on two of eight inputs is not high confidence however the number
 *      looks, and is downgraded to the plain state.
 *   2. A bullish state is downgraded to CAUTION when the risk flags contradict
 *      it — crowded funding, a distribution phase, or narrowing breadth under a
 *      rising price. A score that looks good with contradicting evidence behind
 *      it is precisely when a user is most likely to be hurt.
 */
import type { MarketRegime } from '@/lib/scoring/config';
import {
  HIGH_CONFIDENCE_MIN_DATA_QUALITY, SIGNAL_BANDS, SIGNAL_EMOJI, SIGNAL_LABELS,
  type SignalState,
} from '@/lib/scoring/config';
import type { AccDistResult } from '@/lib/scoring/accDist';
import { clamp } from '@/lib/indicators/series';

export interface SignalInput {
  compositeScore: number;
  /** Data-quality confidence for the composite, 0..100. */
  dataConfidence: number;
  coverage: number;
  regime: MarketRegime;
  regimeConviction: number;
  accDist: AccDistResult | null;
  trendScore: number | null;
  breadthScore: number | null;
  spotFlowScore: number | null;
  /** Risk warnings from the derivatives engine. */
  derivativeWarnings?: string[];
  priceChangePct?: number | null;
}

export interface Signal {
  state: SignalState;
  label: string;
  emoji: string;
  /** 0..100 — confidence IN THE SIGNAL, distinct from the score itself. */
  confidence: number;
  /** The state the bands alone would have produced. */
  rawState: SignalState;
  /** Why the raw state was downgraded, when it was. */
  downgradeReason: string | null;
  /** Every rule that fired, for auditability. */
  rulesFired: string[];
  /** Contradictions found between inputs — surfaced under RISKS. */
  contradictions: string[];
  scoredAt: number;
}

export function stateFor(score: number): SignalState {
  for (const band of SIGNAL_BANDS) {
    if (score >= band.min) return band.state;
  }
  return 'NEUTRAL';
}

const DOWNGRADE: Partial<Record<SignalState, SignalState>> = {
  HIGH_CONFIDENCE_BULLISH: 'BULLISH',
  BULLISH: 'CAUTION',
  HIGH_CONFIDENCE_BEARISH: 'BEARISH',
};

function isBullishState(s: SignalState): boolean {
  return s === 'HIGH_CONFIDENCE_BULLISH' || s === 'BULLISH';
}

/**
 * Contradictions between independent inputs. These are what a careful analyst
 * looks for — the places where the story does not hold together.
 */
export function findContradictions(input: SignalInput): string[] {
  const out: string[] = [];

  if (input.trendScore != null && input.spotFlowScore != null) {
    if (input.trendScore >= 65 && input.spotFlowScore <= 40) {
      out.push('Price trend is positive while spot flow is negative — the move is not backed by aggressive buying.');
    }
    if (input.trendScore <= 35 && input.spotFlowScore >= 60) {
      out.push('Price trend is negative while spot flow is positive — selling is being absorbed.');
    }
  }

  if (input.trendScore != null && input.breadthScore != null && input.trendScore >= 65 && input.breadthScore <= 40) {
    out.push('The trend is carried by a narrow set of assets — breadth is not confirming it.');
  }

  if (input.accDist?.phase === 'DISTRIBUTION' && input.compositeScore >= 60) {
    out.push('The composite reads constructive while the flow evidence points to distribution.');
  }
  if (input.accDist?.phase === 'ACCUMULATION' && input.compositeScore <= 40) {
    out.push('The composite reads weak while the flow evidence points to accumulation.');
  }

  for (const w of input.derivativeWarnings ?? []) out.push(w);

  return out;
}

export function computeSignal(input: SignalInput, now = Date.now()): Signal {
  const rulesFired: string[] = [];
  const rawState = stateFor(input.compositeScore);
  let state = rawState;
  let downgradeReason: string | null = null;

  rulesFired.push(`composite ${input.compositeScore.toFixed(1)} -> ${SIGNAL_LABELS[rawState]}`);

  const contradictions = findContradictions(input);

  /* Guard 1 — a high-confidence claim needs high-confidence DATA. */
  if ((rawState === 'HIGH_CONFIDENCE_BULLISH' || rawState === 'HIGH_CONFIDENCE_BEARISH')
      && input.dataConfidence < HIGH_CONFIDENCE_MIN_DATA_QUALITY) {
    state = DOWNGRADE[rawState]!;
    downgradeReason =
      `Data confidence is ${Math.round(input.dataConfidence)}/100, below the `
      + `${HIGH_CONFIDENCE_MIN_DATA_QUALITY} required for a high-confidence reading — `
      + `${Math.round(input.coverage * 100)}% of the scoring inputs were available.`;
    rulesFired.push('guard: insufficient data confidence for a high-confidence state');
  }

  /* Guard 2 — a bullish state with contradicting evidence becomes CAUTION. */
  if (isBullishState(state) && contradictions.length >= 2) {
    const previous = state;
    state = 'CAUTION';
    downgradeReason =
      `${contradictions.length} independent inputs contradict the constructive reading, so it is `
      + 'reported as caution rather than as a bullish signal.';
    rulesFired.push(`guard: ${previous} -> CAUTION on ${contradictions.length} contradictions`);
  }

  /* Guard 3 — distribution never presents as bullish, whatever the score. */
  if (isBullishState(state) && input.accDist?.phase === 'DISTRIBUTION'
      && input.accDist.strength >= 50) {
    state = 'CAUTION';
    downgradeReason =
      'Flow evidence points to distribution, which takes precedence over the composite score.';
    rulesFired.push('guard: distribution phase overrides a bullish state');
  }

  return {
    state,
    label: SIGNAL_LABELS[state],
    emoji: SIGNAL_EMOJI[state],
    confidence: signalConfidence(input, contradictions.length),
    rawState,
    downgradeReason,
    rulesFired,
    contradictions,
    scoredAt: now,
  };
}

/**
 * Confidence IN THE SIGNAL — deliberately distinct from the score.
 *
 * Driven by data quality, regime conviction and how decisive the composite is,
 * then reduced for every contradiction found. A signal built on inputs that
 * disagree with each other is a low-confidence signal by construction.
 */
export function signalConfidence(input: SignalInput, contradictionCount: number): number {
  const decisiveness = Math.min(100, Math.abs(input.compositeScore - 50) * 2.5);
  const base =
    input.dataConfidence * 0.40
    + input.regimeConviction * 0.30
    + decisiveness * 0.30;
  return clamp(Math.round(base - contradictionCount * 8));
}
