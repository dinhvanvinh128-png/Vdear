/**
 * Token-bucket rate limiter, keyed by host (spec §37).
 *
 * Every upstream has a published budget (Binance ~1200 weight/min, CoinGecko
 * ~10-30 req/min on the free tier, DeFiLlama unmetered-but-polite...). We queue
 * rather than burst so a popular page never gets the whole deployment banned.
 *
 * Per-warm-instance on serverless — a cost/politeness guard, not a distributed
 * quota. Swap `buckets` for a Redis-backed store to make it global.
 */

export interface RateLimitConfig {
  /** Sustained requests allowed per interval. */
  capacity: number;
  /** Refill window in ms. */
  intervalMs: number;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
  config: RateLimitConfig;
  /** FIFO of waiters so bursts are served in arrival order, not at random. */
  queue: (() => void)[];
}

/** Conservative defaults, well under each provider's documented ceiling. */
export const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  'api.binance.com': { capacity: 120, intervalMs: 60_000 },
  'fapi.binance.com': { capacity: 120, intervalMs: 60_000 },
  'www.okx.com': { capacity: 100, intervalMs: 60_000 },
  'api.bybit.com': { capacity: 100, intervalMs: 60_000 },
  'api.bitget.com': { capacity: 100, intervalMs: 60_000 },
  'api.coingecko.com': { capacity: 20, intervalMs: 60_000 },
  'pro-api.coingecko.com': { capacity: 300, intervalMs: 60_000 },
  'api.llama.fi': { capacity: 60, intervalMs: 60_000 },
  'stablecoins.llama.fi': { capacity: 60, intervalMs: 60_000 },
  'api.geckoterminal.com': { capacity: 25, intervalMs: 60_000 },
  'community-api.coinmetrics.io': { capacity: 20, intervalMs: 60_000 },
  'open-api-v4.coinglass.com': { capacity: 30, intervalMs: 60_000 },
  'api.glassnode.com': { capacity: 30, intervalMs: 60_000 },
  'api.cryptoquant.com': { capacity: 30, intervalMs: 60_000 },
  'api.artemisxyz.com': { capacity: 30, intervalMs: 60_000 },
};

/** Applied to any host without an explicit entry. */
export const FALLBACK_LIMIT: RateLimitConfig = { capacity: 60, intervalMs: 60_000 };

const buckets = new Map<string, Bucket>();

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'unknown';
  }
}

export function limitFor(host: string): RateLimitConfig {
  return DEFAULT_LIMITS[host] ?? FALLBACK_LIMIT;
}

function bucketFor(host: string): Bucket {
  let b = buckets.get(host);
  if (!b) {
    const config = limitFor(host);
    b = { tokens: config.capacity, lastRefill: Date.now(), config, queue: [] };
    buckets.set(host, b);
  }
  return b;
}

function refill(b: Bucket, now: number): void {
  const elapsed = now - b.lastRefill;
  if (elapsed <= 0) return;
  const gained = (elapsed / b.config.intervalMs) * b.config.capacity;
  if (gained >= 1) {
    b.tokens = Math.min(b.config.capacity, b.tokens + Math.floor(gained));
    b.lastRefill = now;
  }
}

/** ms until at least one token is available. */
function waitMs(b: Bucket): number {
  const perToken = b.config.intervalMs / b.config.capacity;
  const elapsed = Date.now() - b.lastRefill;
  return Math.max(1, Math.ceil(perToken - (elapsed % perToken)));
}

/**
 * Acquire one token for `host`, waiting (never dropping) if the bucket is dry.
 * Resolves when the caller may proceed.
 */
export function acquire(host: string): Promise<void> {
  const b = bucketFor(host);
  refill(b, Date.now());
  if (b.tokens > 0 && b.queue.length === 0) {
    b.tokens -= 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    b.queue.push(resolve);
    scheduleDrain(b);
  });
}

const draining = new Set<Bucket>();

function scheduleDrain(b: Bucket): void {
  if (draining.has(b)) return;
  draining.add(b);
  const tick = () => {
    refill(b, Date.now());
    while (b.tokens > 0 && b.queue.length > 0) {
      b.tokens -= 1;
      const next = b.queue.shift();
      next?.();
    }
    if (b.queue.length > 0) {
      setTimeout(tick, waitMs(b));
    } else {
      draining.delete(b);
    }
  };
  setTimeout(tick, waitMs(b));
}

export function rateLimiterStats() {
  return Array.from(buckets.entries()).map(([host, b]) => ({
    host,
    tokens: Math.floor(b.tokens),
    capacity: b.config.capacity,
    queued: b.queue.length,
  }));
}

/** Test hook. */
export function resetRateLimiter(): void {
  buckets.clear();
  draining.clear();
}
