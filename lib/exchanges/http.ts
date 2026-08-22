/**
 * Fetch helper for exchange REST calls.
 * - hard timeout (AbortController) so one slow exchange can't stall a route
 * - never throws the raw network error upward with secrets
 * - small typed JSON wrapper
 *
 * Runs only on the server (API routes / server components). Public endpoints
 * only — no API keys are attached here by design.
 */

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export interface GetJsonOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** Next.js fetch cache hint. Default: no-store (freshness first). */
  revalidate?: number | false;
}

export async function getJson<T = unknown>(url: string, opts: GetJsonOptions = {}): Promise<T> {
  const { timeoutMs = 8000, headers } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', ...headers },
      // Freshness-first: we run our own cache layer on top (lib/cache).
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new HttpError(res.status, `HTTP ${res.status} for ${safeUrl(url)}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new HttpError(408, `timeout after ${timeoutMs}ms for ${safeUrl(url)}`);
    }
    throw new HttpError(502, `network error for ${safeUrl(url)}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Strip query strings from logged URLs so nothing sensitive leaks. */
function safeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return 'url';
  }
}

export function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}
