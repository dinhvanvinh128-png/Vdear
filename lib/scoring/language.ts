/**
 * LANGUAGE GUARD (spec: NO FINANCIAL GUARANTEE).
 *
 * The spec forbids "chắc chắn tăng", "chắc chắn giảm", "100%", "win rate
 * guaranteed" and requires probability / confidence / risk / confirmation
 * instead. That rule is only real if something enforces it, so this module is
 * the enforcement point and tests/language.test.ts fails the build if any
 * user-facing string violates it.
 *
 * This is not a style preference. A system that outputs a probability and a
 * confidence, then describes it in the language of certainty, has misrepresented
 * its own output.
 */

/** Patterns that must never appear in user-facing analysis text. */
export const FORBIDDEN_PATTERNS: { pattern: RegExp; why: string }[] = [
  { pattern: /\bchắc chắn\b/iu, why: 'claims certainty' },
  { pattern: /\bguarantee(d|s)?\b/iu, why: 'claims a guarantee' },
  { pattern: /\bwin rate\b/iu, why: 'implies a track record we do not measure' },
  { pattern: /\b100\s*%\s*(sure|certain|accurate|win|profit)/iu, why: 'claims certainty' },
  { pattern: /\bwill (definitely|certainly|surely)\b/iu, why: 'claims certainty' },
  { pattern: /\bcan'?t lose\b/iu, why: 'claims a riskless outcome' },
  { pattern: /\brisk[- ]free\b/iu, why: 'claims a riskless outcome' },
  { pattern: /\bsure thing\b/iu, why: 'claims certainty' },
  { pattern: /\bfinancial advice\b/iu, why: 'presents output as advice' },
  { pattern: /\bmust buy\b/iu, why: 'issues an instruction rather than an assessment' },
  { pattern: /\bmust sell\b/iu, why: 'issues an instruction rather than an assessment' },
  { pattern: /\bmoon(ing|shot)?\b/iu, why: 'hype language, not an assessment' },
];

/** The vocabulary the spec asks for instead. */
export const PREFERRED_TERMS = [
  'probability', 'confidence', 'risk', 'confirmation', 'evidence',
  'suggests', 'indicates', 'consistent with', 'elevated', 'reduced',
] as const;

export interface LanguageViolation {
  text: string;
  matched: string;
  why: string;
}

export function findViolations(text: string): LanguageViolation[] {
  const out: LanguageViolation[] = [];
  for (const { pattern, why } of FORBIDDEN_PATTERNS) {
    const m = text.match(pattern);
    if (m) out.push({ text, matched: m[0], why });
  }
  return out;
}

export function isCompliant(text: string): boolean {
  return findViolations(text).length === 0;
}

/**
 * Assert a batch of user-facing strings is compliant.
 * Used by the analyst before returning, so a violation fails loudly in
 * development rather than reaching a user.
 */
export function assertCompliant(texts: readonly string[]): void {
  const violations = texts.flatMap(findViolations);
  if (violations.length > 0) {
    const detail = violations
      .map((v) => `  "${v.matched}" in "${v.text.slice(0, 80)}" — ${v.why}`)
      .join('\n');
    throw new Error(`Analysis text violates the no-guarantee rule:\n${detail}`);
  }
}

/**
 * Probability-safe phrasing for a confidence value. Used everywhere the UI
 * would otherwise be tempted to say "strong buy".
 */
export function describeConfidence(confidence: number): string {
  if (confidence >= 80) return 'a high-confidence reading';
  if (confidence >= 60) return 'a moderate-confidence reading';
  if (confidence >= 35) return 'a low-confidence reading';
  return 'an inconclusive reading';
}

/** Probability-safe phrasing for a directional score. */
export function describeBias(score: number): string {
  if (score >= 75) return 'strongly favours upside';
  if (score >= 60) return 'leans toward upside';
  if (score > 40) return 'is balanced';
  if (score > 25) return 'leans toward downside';
  return 'strongly favours downside';
}
