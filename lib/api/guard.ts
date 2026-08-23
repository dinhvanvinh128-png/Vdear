/**
 * API input validation + internal rate limiting (spec: SECURITY).
 *
 * Every route parses its query through zod here rather than reading
 * searchParams directly. Symbols in particular are validated against a strict
 * pattern before they reach a URL builder — a symbol is interpolated into
 * upstream request URLs, so an unvalidated one is an injection surface.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { toCanonical, splitSymbol } from '@/lib/symbols';
import { isValidSymbol, normalizeSymbol, redactSecrets } from '@/lib/api/sanitize';

export { redactSecrets, isValidSymbol, normalizeSymbol };

export const symbolSchema = z
  .string()
  .transform(normalizeSymbol)
  .refine(isValidSymbol, {
    message: 'Symbol must be 2-20 alphanumeric characters, e.g. BTC or BTCUSDT',
  });

/** Accepts "BTC" or "BTCUSDT" and always returns a canonical pair. */
export function canonicalSymbol(raw: string): string {
  const parsed = symbolSchema.parse(raw);
  return splitSymbol(parsed).quote ? parsed : toCanonical(parsed);
}

export const marketSchema = z.enum(['spot', 'futures']).default('spot');
export const timeframeSchema = z.enum(['5m', '15m', '1h', '4h', '1d']).default('1h');
export const intervalSchema = z.enum(['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']);

export const limitSchema = (max: number, fallback: number) =>
  z.coerce.number().int().min(1).max(max).default(fallback);

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Parse a schema against searchParams, converting failures into a 400. */
export function parseQuery<T extends z.ZodTypeAny>(req: NextRequest, schema: T): z.infer<T> {
  const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
  const result = schema.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join('.') || 'query'}: ${i.message}`)
      .join('; ');
    throw new ApiError(400, `Invalid request — ${detail}`);
  }
  return result.data;
}

/**
 * Wrap a route handler so a thrown error becomes a typed JSON response instead
 * of a stack trace. Internal messages are never echoed for 5xx.
 */
export async function handle<T>(run: () => Promise<T>): Promise<NextResponse> {
  try {
    return NextResponse.json(await run());
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: `Invalid request — ${e.issues.map((i) => i.message).join('; ')}` },
        { status: 400 },
      );
    }
    // Log server-side, with anything key-shaped redacted. HttpError already
    // strips query strings (lib/exchanges/http safeUrl), but a different error
    // could carry a raw URL — and Glassnode/Artemis authenticate via a query
    // parameter, so a leaked URL would be a leaked credential.
    console.error('[api]', redactSecrets(e instanceof Error ? e.message : String(e)));
    return NextResponse.json(
      { error: 'Upstream data is temporarily unavailable. Try again shortly.' },
      { status: 503 },
    );
  }
}

/* ------------------------------ rate limiting ------------------------------ */

interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>();

export const RATE_LIMIT = { requests: 120, windowMs: 60_000 } as const;

/**
 * Per-IP limiter for the internal API. Per-warm-instance on serverless, which
 * is a courtesy guard rather than a security boundary — the real protection for
 * upstream quotas is lib/net/rateLimiter plus the cache.
 */
export function checkRateLimit(req: NextRequest): void {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
  const now = Date.now();
  const bucket = buckets.get(ip);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT.requests) {
    throw new ApiError(429, 'Too many requests — slow down and try again in a moment.');
  }
}

/** Cron routes are guarded by a shared secret so they cannot be triggered publicly. */
export function assertCronAuthorized(req: NextRequest): void {
  const secret = process.env.CRON_SECRET;
  // Vercel Cron sends its own bearer; a locally-set secret must match.
  if (!secret) {
    throw new ApiError(503, 'CRON_SECRET is not configured — cron routes are disabled.');
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    throw new ApiError(401, 'Unauthorized');
  }
}
