/**
 * Tiny in-memory TTL cache + single-flight de-duplication.
 *
 * Purpose (spec §38): don't hit exchange APIs on every request. A short TTL
 * absorbs bursts of viewers; single-flight means N concurrent misses trigger
 * ONE upstream fetch, not N. On serverless this is per-warm-instance and that
 * is intentional — it's a cost/latency guard, not a source of truth. Swap the
 * backing store for Upstash/Redis later without changing call sites.
 */

interface Entry<T> {
  value: T;
  expires: number;
}

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export const TTL = {
  ticker: 3_000,
  market: 10_000,
  coinList: 45_000,
  funding: 15_000,
  openInterest: 15_000,
  liquidation: 20_000,
  klines: 20_000,
  historical: 300_000,
} as const;

/**
 * Get `key` from cache, or run `loader` (single-flight) and cache the result.
 * If `loader` throws and a stale value exists, the stale value is returned so
 * one failing upstream never surfaces as an error to the user.
 */
export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expires > now) return hit.value;

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const p = (async () => {
    try {
      const value = await loader();
      store.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    } catch (err) {
      if (hit) return hit.value; // serve stale on failure
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p;
}

/** Was the last read for `key` served from a still-valid cache entry? */
export function isFresh(key: string): boolean {
  const hit = store.get(key);
  return !!hit && hit.expires > Date.now();
}

export function cacheStats() {
  return { entries: store.size, inflight: inflight.size };
}

export function clearCache() {
  store.clear();
}
