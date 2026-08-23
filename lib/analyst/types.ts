/**
 * VDEAR AI MARKET ANALYST (spec: AI ANALYST).
 *
 * "AI chỉ có nhiệm vụ: giải thích, tổng hợp, phát hiện mâu thuẫn, đưa ra
 * scenario. Không được tự tạo số liệu."
 *
 * The interface enforces that structurally rather than by instruction: an
 * AnalystProvider receives ONLY the already-computed scores and can return only
 * prose. There is no path by which it can produce a score, change a score, or
 * introduce a figure that is not already in its input.
 *
 * The default provider is deterministic and rule-based — no key, no cost, no
 * possibility of hallucinating a number. An LLM provider can be added later to
 * write richer prose over exactly the same input, under exactly the same
 * constraint.
 */
import type { MarketRegime, SignalState } from '@/lib/scoring/config';
import type { MoneyFlowScore } from '@/lib/scoring/moneyFlow';
import type { AccDistResult } from '@/lib/scoring/accDist';
import type { RegimeResult } from '@/lib/scoring/regime';
import type { Signal } from '@/lib/scoring/signal';

/** Everything the analyst is allowed to see. All of it is already computed. */
export interface AnalystInput {
  symbol: string;
  moneyFlow: MoneyFlowScore;
  regime: RegimeResult;
  signal: Signal;
  accDist: AccDistResult | null;
  scores: {
    trend: number | null;
    liquidity: number | null;
    breadth: number | null;
    onChain: number | null;
    whale: number | null;
    spotFlow: number | null;
    stablecoin: number | null;
    derivatives: number | null;
  };
  /** Context figures, already computed — never re-derived by the analyst. */
  context?: {
    priceChange24h?: number | null;
    priceChange7d?: number | null;
    fundingAnnualizedPct?: number | null;
    oiChange24hPct?: number | null;
    stablecoinChange7dPct?: number | null;
    btcDominance?: number | null;
  };
  /** Sources that did not answer, so the analyst can say what it cannot see. */
  unavailable?: { source: string; reason: string }[];
}

export interface Scenario {
  name: string;
  /** Probability-language description. Never a percentage claim. */
  description: string;
  /** What would confirm this scenario is playing out. */
  confirmation: string;
  /** 'primary' | 'alternate' | 'risk' */
  kind: 'primary' | 'alternate' | 'risk';
}

export interface AnalystReport {
  symbol: string;
  /** One-paragraph summary. */
  summary: string;
  /** WHY — the evidence supporting the current reading. */
  why: string[];
  /** RISKS — what could invalidate it. */
  risks: string[];
  /** Places where the inputs disagree with each other. */
  contradictions: string[];
  /** What the analyst explicitly cannot see. */
  blindSpots: string[];
  scenarios: Scenario[];
  /** Which provider wrote this. */
  provider: string;
  generatedAt: number;
}

export interface AnalystProvider {
  readonly id: string;
  readonly label: string;
  /** True when this provider can run right now (e.g. has its key). */
  available(): boolean;
  analyze(input: AnalystInput): Promise<AnalystReport>;
}

export type { MarketRegime, SignalState };
