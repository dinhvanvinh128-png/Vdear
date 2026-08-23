/**
 * Reliability layer: retry policy, backoff shape, circuit breaker transitions.
 * These are the rules that keep one dead upstream from taking down the site,
 * so they are tested against explicit failure sequences rather than live calls.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { backoffDelay, defaultIsRetryable, statusOf, withRetry } from '@/lib/net/retry';
import {
  assertClosed, breakerState, CircuitOpenError, recordFailure, recordSuccess, resetBreakers,
} from '@/lib/net/circuitBreaker';
import { limitFor, DEFAULT_LIMITS, FALLBACK_LIMIT, hostOf } from '@/lib/net/rateLimiter';

const noSleep = async () => {};
const fixedRandom = () => 0.5;

function httpErr(status: number): Error & { status: number } {
  const e = new Error(`HTTP ${status}`) as Error & { status: number };
  e.status = status;
  return e;
}

/* ------------------------------- retry policy ------------------------------ */

test('retries 429 and 5xx but never a client error', () => {
  assert.equal(defaultIsRetryable(httpErr(429)), true, '429 is a backoff signal');
  assert.equal(defaultIsRetryable(httpErr(503)), true);
  assert.equal(defaultIsRetryable(httpErr(408)), true);
  // A bad symbol / bad key / plan-too-low never becomes valid by retrying, and
  // retrying it burns the rate-limit budget that healthy calls need.
  assert.equal(defaultIsRetryable(httpErr(400)), false);
  assert.equal(defaultIsRetryable(httpErr(401)), false);
  assert.equal(defaultIsRetryable(httpErr(404)), false);
  // No status at all = socket/DNS/abort: worth one more go.
  assert.equal(defaultIsRetryable(new Error('network error')), true);
});

test('statusOf reads a status off an HttpError-shaped value only', () => {
  assert.equal(statusOf(httpErr(502)), 502);
  assert.equal(statusOf(new Error('plain')), null);
  assert.equal(statusOf({ status: 'nope' }), null);
  assert.equal(statusOf(null), null);
});

test('withRetry succeeds after transient failures', async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls++;
    if (calls < 3) throw httpErr(503);
    return 'ok';
  }, { attempts: 3, sleep: noSleep, random: fixedRandom });
  assert.equal(result, 'ok');
  assert.equal(calls, 3);
});

test('withRetry gives up after `attempts` and rethrows the last error', async () => {
  let calls = 0;
  await assert.rejects(
    () => withRetry(async () => { calls++; throw httpErr(500); },
      { attempts: 3, sleep: noSleep, random: fixedRandom }),
    /HTTP 500/,
  );
  assert.equal(calls, 3, 'exactly `attempts` calls, not more');
});

test('withRetry does not retry a non-retryable error', async () => {
  let calls = 0;
  await assert.rejects(
    () => withRetry(async () => { calls++; throw httpErr(404); },
      { attempts: 5, sleep: noSleep, random: fixedRandom }),
    /HTTP 404/,
  );
  assert.equal(calls, 1, 'failed fast');
});

test('backoff grows exponentially and is capped', () => {
  const base = 100, max = 1000;
  const full = () => 1; // full-jitter upper bound
  assert.equal(backoffDelay(0, base, max, full), 100);
  assert.equal(backoffDelay(1, base, max, full), 200);
  assert.equal(backoffDelay(2, base, max, full), 400);
  assert.equal(backoffDelay(3, base, max, full), 800);
  assert.equal(backoffDelay(4, base, max, full), 1000, 'capped at maxDelayMs');
  assert.equal(backoffDelay(9, base, max, full), 1000);
});

test('backoff jitter spreads retries instead of synchronising them', () => {
  // Full jitter: the delay is uniform in [0, ceiling), so N concurrent callers
  // do not all retry at the same instant and re-create the burst.
  assert.equal(backoffDelay(3, 100, 5000, () => 0), 0);
  assert.equal(backoffDelay(3, 100, 5000, () => 0.5), 400);
  assert.ok(backoffDelay(3, 100, 5000, () => 0.999) < 800);
});

/* ------------------------------ circuit breaker ---------------------------- */

test('breaker opens after the failure threshold and fails fast', () => {
  resetBreakers();
  const host = 'dead.example';
  for (let i = 0; i < 4; i++) recordFailure(host, new Error('boom'));
  assert.equal(breakerState(host), 'closed', 'still closed below threshold');
  assert.doesNotThrow(() => assertClosed(host));

  recordFailure(host, new Error('boom'));
  assert.equal(breakerState(host), 'open');
  assert.throws(() => assertClosed(host), CircuitOpenError);
});

test('a success resets the failure count', () => {
  resetBreakers();
  const host = 'flaky.example';
  for (let i = 0; i < 4; i++) recordFailure(host, new Error('boom'));
  recordSuccess(host);
  for (let i = 0; i < 4; i++) recordFailure(host, new Error('boom'));
  assert.equal(breakerState(host), 'closed', 'counter restarted after the success');
});

test('breaker half-opens after cooldown, then closes on sustained success', () => {
  resetBreakers();
  const host = 'recovering.example';
  const t0 = 1_000_000;
  for (let i = 0; i < 5; i++) recordFailure(host, new Error('boom'), t0);
  assert.equal(breakerState(host), 'open');

  assert.throws(() => assertClosed(host, t0 + 29_000), CircuitOpenError, 'still cooling down');

  assertClosed(host, t0 + 31_000); // probe allowed
  assert.equal(breakerState(host), 'half_open');

  recordSuccess(host);
  assert.equal(breakerState(host), 'half_open', 'one success is not enough');
  recordSuccess(host);
  assert.equal(breakerState(host), 'closed');
});

test('a failed probe re-opens the breaker immediately', () => {
  resetBreakers();
  const host = 'still-dead.example';
  const t0 = 2_000_000;
  for (let i = 0; i < 5; i++) recordFailure(host, new Error('boom'), t0);
  assertClosed(host, t0 + 31_000);
  assert.equal(breakerState(host), 'half_open');

  recordFailure(host, new Error('still down'), t0 + 31_000);
  assert.equal(breakerState(host), 'open');
  assert.throws(() => assertClosed(host, t0 + 40_000), CircuitOpenError);
});

test('CircuitOpenError reports how long until the next probe', () => {
  resetBreakers();
  const host = 'cooldown.example';
  const t0 = 3_000_000;
  for (let i = 0; i < 5; i++) recordFailure(host, new Error('nope'), t0);
  try {
    assertClosed(host, t0 + 10_000);
    assert.fail('expected the circuit to be open');
  } catch (e) {
    assert.ok(e instanceof CircuitOpenError);
    assert.equal((e as CircuitOpenError).host, host);
    assert.equal((e as CircuitOpenError).retryAfterMs, 20_000);
  }
});

/* -------------------------------- rate limits ------------------------------ */

test('known hosts get their documented budget, unknown hosts a safe fallback', () => {
  assert.deepEqual(limitFor('api.binance.com'), DEFAULT_LIMITS['api.binance.com']);
  // CoinGecko's free tier is the tightest budget we depend on.
  assert.ok(limitFor('api.coingecko.com').capacity <= 30);
  assert.deepEqual(limitFor('totally.unknown.host'), FALLBACK_LIMIT);
});

test('hostOf extracts a bucket key and never throws on junk', () => {
  assert.equal(hostOf('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT'), 'api.binance.com');
  assert.equal(hostOf('not a url'), 'unknown');
});
