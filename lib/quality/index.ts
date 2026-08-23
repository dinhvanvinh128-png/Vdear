/**
 * DATA QUALITY ENGINE.
 *
 * Three responsibilities, deliberately kept separate from the engines that
 * consume them:
 *   confidence   how much to trust a source kind, decayed by age
 *   freshness    when the observation was actually made
 *   crossSource  do independent venues agree? if not, which one is wrong?
 *
 * Nothing here can change a value. It can only describe how well that value is
 * known, or exclude a source that is demonstrably out of line.
 */
export * from '@/lib/quality/confidence';
export * from '@/lib/quality/freshness';
export * from '@/lib/quality/crossSource';

import type { ExchangeId } from '@/lib/types';
import type { ProviderId } from '@/lib/providers/types';
import { combineConfidence } from '@/lib/quality/confidence';
import type { CrossSourceCheck } from '@/lib/quality/crossSource';

export interface DataQualityReport {
  /** 0..100 overall confidence in the current picture. */
  confidence: number;
  /** Sources that contributed. */
  contributing: (ExchangeId | ProviderId)[];
  /** Sources queried that did not answer, with the reason. */
  unavailable: { source: string; reason: string }[];
  /** Cross-venue price checks, one per symbol examined. */
  anomalies: CrossSourceCheck[];
  /** Any metric older than its stale window. */
  staleMetrics: { metric: string; source: string; ageMs: number }[];
  generatedAt: number;
}

export interface QualityInput {
  parts: { value: number; weight?: number }[];
  expectedCount: number;
  contributing: (ExchangeId | ProviderId)[];
  unavailable: { source: string; reason: string }[];
  anomalies?: CrossSourceCheck[];
  staleMetrics?: { metric: string; source: string; ageMs: number }[];
}

export function buildQualityReport(input: QualityInput, now = Date.now()): DataQualityReport {
  const anomalies = input.anomalies ?? [];
  // The worst anomaly across the symbols examined drives the penalty; averaging
  // would let one clean pair mask a broken one.
  const penalty = anomalies.reduce((worst, a) => Math.max(worst, a.confidencePenalty), 0);
  const base = combineConfidence(input.parts, input.expectedCount);

  return {
    confidence: Math.max(0, Math.min(100, base - penalty)),
    contributing: input.contributing,
    unavailable: input.unavailable,
    anomalies: anomalies.filter((a) => a.severity !== 'none'),
    staleMetrics: input.staleMetrics ?? [],
    generatedAt: now,
  };
}
