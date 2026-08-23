/**
 * Analyst selection.
 *
 * The rule-based provider is the default and always available. An LLM provider
 * can be registered here later; it would receive the SAME AnalystInput — scores
 * only — and be held to the same language guard, so adding one cannot widen what
 * the analyst is allowed to claim.
 */
import type { AnalystInput, AnalystProvider, AnalystReport } from '@/lib/analyst/types';
import { ruleBasedAnalyst } from '@/lib/analyst/ruleBased';

export * from '@/lib/analyst/types';
export { ruleBasedAnalyst };

/** Ordered by preference; the first available provider wins. */
export const ANALYST_PROVIDERS: AnalystProvider[] = [ruleBasedAnalyst];

export function selectAnalyst(): AnalystProvider {
  return ANALYST_PROVIDERS.find((p) => p.available()) ?? ruleBasedAnalyst;
}

export async function analyze(input: AnalystInput): Promise<AnalystReport> {
  return selectAnalyst().analyze(input);
}
