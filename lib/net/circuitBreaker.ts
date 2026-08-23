/**
 * Per-host circuit breaker (spec §37: "Không để API chết làm chết toàn bộ website").
 *
 * CLOSED  → requests flow; consecutive failures are counted.
 * OPEN    → requests fail instantly for `cooldownMs`. This is the point: a dead
 *           upstream costs 0ms instead of 3 × 8s of timeouts on every page load.
 * HALF_OPEN → one probe is allowed through; success closes, failure re-opens.
 *
 * Callers treat an open circuit as "this source is unavailable" — which the
 * Envelope already models — never as a reason to fabricate a value.
 */

export type BreakerState = 'closed' | 'open' | 'half_open';

export interface BreakerConfig {
  /** Consecutive failures before opening. Default 5. */
  failureThreshold: number;
  /** How long to stay open before probing. Default 30s. */
  cooldownMs: number;
  /** Consecutive successes in half-open before closing. Default 2. */
  successThreshold: number;
}

export const DEFAULT_BREAKER: BreakerConfig = {
  failureThreshold: 5,
  cooldownMs: 30_000,
  successThreshold: 2,
};

interface Circuit {
  state: BreakerState;
  failures: number;
  successes: number;
  openedAt: number;
  config: BreakerConfig;
  lastError: string | null;
}

const circuits = new Map<string, Circuit>();

export class CircuitOpenError extends Error {
  readonly host: string;
  readonly retryAfterMs: number;
  constructor(host: string, retryAfterMs: number, lastError: string | null) {
    super(`circuit open for ${host} (retry in ${Math.ceil(retryAfterMs / 1000)}s${lastError ? `; last: ${lastError}` : ''})`);
    this.name = 'CircuitOpenError';
    this.host = host;
    this.retryAfterMs = retryAfterMs;
  }
}

function circuitFor(host: string, config: BreakerConfig = DEFAULT_BREAKER): Circuit {
  let c = circuits.get(host);
  if (!c) {
    c = { state: 'closed', failures: 0, successes: 0, openedAt: 0, config, lastError: null };
    circuits.set(host, c);
  }
  return c;
}

/** Throws CircuitOpenError when the host is currently shut off. */
export function assertClosed(host: string, now = Date.now()): void {
  const c = circuits.get(host);
  if (!c || c.state === 'closed') return;
  if (c.state === 'open') {
    const elapsed = now - c.openedAt;
    if (elapsed < c.config.cooldownMs) {
      throw new CircuitOpenError(host, c.config.cooldownMs - elapsed, c.lastError);
    }
    // Cooldown elapsed — allow exactly one probe.
    c.state = 'half_open';
    c.successes = 0;
  }
}

export function recordSuccess(host: string): void {
  const c = circuitFor(host);
  c.lastError = null;
  if (c.state === 'half_open') {
    c.successes += 1;
    if (c.successes >= c.config.successThreshold) {
      c.state = 'closed';
      c.failures = 0;
      c.successes = 0;
    }
    return;
  }
  c.failures = 0;
}

export function recordFailure(host: string, err: unknown, now = Date.now()): void {
  const c = circuitFor(host);
  c.lastError = err instanceof Error ? err.message.slice(0, 120) : String(err).slice(0, 120);
  if (c.state === 'half_open') {
    c.state = 'open';
    c.openedAt = now;
    c.failures = c.config.failureThreshold;
    return;
  }
  c.failures += 1;
  if (c.failures >= c.config.failureThreshold) {
    c.state = 'open';
    c.openedAt = now;
  }
}

export function breakerState(host: string): BreakerState {
  return circuits.get(host)?.state ?? 'closed';
}

export function breakerStats() {
  return Array.from(circuits.entries()).map(([host, c]) => ({
    host, state: c.state, failures: c.failures, lastError: c.lastError,
  }));
}

/** Test hook. */
export function resetBreakers(): void {
  circuits.clear();
}
