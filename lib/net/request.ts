/**
 * The single outbound HTTP entry point for every VDEAR provider.
 *
 *   rate limit  →  circuit breaker  →  retry + backoff  →  getJson (timeout)
 *
 * `lib/exchanges/http.ts#getJson` stays the raw primitive (timeout + safe error
 * text); this module is the policy around it. Provider clients should import
 * `request` / `requestOrNull`, never `getJson` directly, so a misbehaving
 * upstream is contained in one place.
 */
import { getJson, HttpError, type GetJsonOptions } from '@/lib/exchanges/http';
import { acquire, hostOf, rateLimiterStats } from '@/lib/net/rateLimiter';
import {
  assertClosed, breakerStats, CircuitOpenError, recordFailure, recordSuccess,
} from '@/lib/net/circuitBreaker';
import { withRetry, type RetryOptions } from '@/lib/net/retry';

export { HttpError, CircuitOpenError };
export type { GetJsonOptions };

export interface RequestOptions extends GetJsonOptions {
  retry?: RetryOptions;
  /** Skip the rate limiter (health probes, which must not queue behind traffic). */
  skipRateLimit?: boolean;
}

export async function request<T = unknown>(url: string, opts: RequestOptions = {}): Promise<T> {
  const { retry, skipRateLimit, ...httpOpts } = opts;
  const host = hostOf(url);

  // Fail fast on a known-dead host: 0ms instead of N × timeout.
  assertClosed(host);

  try {
    const result = await withRetry<T>(async () => {
      if (!skipRateLimit) await acquire(host);
      return getJson<T>(url, httpOpts);
    }, retry);
    recordSuccess(host);
    return result;
  } catch (err) {
    // An open circuit is not new evidence about the host — don't double-count it.
    if (!(err instanceof CircuitOpenError)) recordFailure(host, err);
    throw err;
  }
}

/**
 * Fail-soft variant: returns null instead of throwing.
 *
 * This is the default for anything feeding a score — a missing input must lower
 * confidence and be reported in the Envelope, never be replaced by a made-up
 * number. Callers MUST handle null; they must not substitute a default value.
 */
export async function requestOrNull<T = unknown>(
  url: string, opts: RequestOptions = {},
): Promise<T | null> {
  try {
    return await request<T>(url, opts);
  } catch {
    return null;
  }
}

/** Same as requestOrNull but keeps the reason, for `health()` and Envelope errors. */
export async function requestResult<T = unknown>(
  url: string, opts: RequestOptions = {},
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number | null }> {
  try {
    return { ok: true, data: await request<T>(url, opts) };
  } catch (err) {
    const status = err instanceof HttpError ? err.status : null;
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 160) : 'error', status };
  }
}

/** Surfaced on /status so a human can see why a source is quiet. */
export function netStats() {
  return { rateLimits: rateLimiterStats(), circuits: breakerStats() };
}
