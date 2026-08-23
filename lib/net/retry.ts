/**
 * Retry with exponential backoff + full jitter.
 *
 * Retries only what is worth retrying: timeouts, 429 and 5xx. A 4xx that is not
 * 429 means the request itself is wrong (bad symbol, bad key, plan too low) —
 * hammering it wastes the rate-limit budget and never succeeds, so it fails fast.
 */

export interface RetryOptions {
  /** Total attempts including the first. Default 3. */
  attempts?: number;
  /** First backoff delay in ms. Default 250. */
  baseDelayMs?: number;
  /** Ceiling for a single backoff. Default 4000. */
  maxDelayMs?: number;
  /** Injected for deterministic tests. Default Math.random. */
  random?: () => number;
  /** Injected for deterministic tests. Default setTimeout-based sleep. */
  sleep?: (ms: number) => Promise<void>;
  /** Override the default retryability rule. */
  isRetryable?: (err: unknown) => boolean;
  /** Called before each retry (observability). */
  onRetry?: (attempt: number, delayMs: number, err: unknown) => void;
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 522, 524]);

/** Read a `status` off an HttpError-shaped value without importing it (no cycle). */
export function statusOf(err: unknown): number | null {
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const s = (err as { status: unknown }).status;
    if (typeof s === 'number') return s;
  }
  return null;
}

export function defaultIsRetryable(err: unknown): boolean {
  const status = statusOf(err);
  if (status === null) return true; // network-level failure (DNS, socket, abort)
  return RETRYABLE_STATUS.has(status);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Full-jitter backoff: `random() * min(max, base * 2^attempt)`.
 * Full jitter (rather than fixed doubling) is what stops N concurrent callers
 * from retrying in lockstep and re-creating the burst that caused the 429.
 */
export function backoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number,
): number {
  const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  return Math.floor(random() * ceiling);
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const {
    attempts = 3,
    baseDelayMs = 250,
    maxDelayMs = 4000,
    random = Math.random,
    sleep = defaultSleep,
    isRetryable = defaultIsRetryable,
    onRetry,
  } = opts;

  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isLast = i === attempts - 1;
      if (isLast || !isRetryable(err)) throw err;
      const delay = backoffDelay(i, baseDelayMs, maxDelayMs, random);
      onRetry?.(i + 1, delay, err);
      await sleep(delay);
    }
  }
  throw lastErr;
}
