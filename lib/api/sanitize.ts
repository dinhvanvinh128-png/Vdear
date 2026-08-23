/**
 * Pure input-sanitising helpers (spec: SECURITY).
 *
 * Deliberately free of `next` and `zod` imports so this logic is unit-testable
 * without a framework — these are the rules that stop untrusted input reaching
 * an upstream URL and stop a credential reaching a log, and both deserve tests
 * that always run.
 */

/**
 * A VDEAR symbol: base or base+quote, letters and digits only.
 *
 * Strict by design. A symbol is interpolated into upstream request URLs, so
 * anything that could introduce a separator, a query parameter or a path
 * segment must be rejected outright rather than escaped.
 */
export const SYMBOL_PATTERN = /^[A-Z0-9]{2,20}$/;

export function isValidSymbol(raw: string): boolean {
  return SYMBOL_PATTERN.test(raw.trim().toUpperCase());
}

/** Upper-case and trim. Does NOT validate — pair it with isValidSymbol. */
export function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Strip credential-shaped query parameters from a string before it is logged.
 *
 * Glassnode and Artemis authenticate via a QUERY PARAMETER, which means a URL
 * that reaches a log is a leaked credential. HttpError already strips query
 * strings (see safeUrl in lib/exchanges/http), so this is the second line of
 * defence for anything else that might carry a raw URL.
 */
export function redactSecrets(text: string): string {
  return text.replace(
    /([?&](?:api_?key|apikey|key|token|secret|access_token|sign|signature)=)[^&\s]+/gi,
    '$1[redacted]',
  );
}
