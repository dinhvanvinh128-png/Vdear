/**
 * The contract every non-exchange data provider implements.
 *
 * Exchange connectors live in lib/exchanges (they share a much richer market-data
 * interface). Everything else — CoinGecko, DeFiLlama, GeckoTerminal, Coin Metrics,
 * CoinGlass, Glassnode, CryptoQuant, Artemis — implements this instead.
 *
 * Two rules make the whole "free-first" architecture work:
 *
 *  1. A provider that has no key returns `{ ok: false, reason: 'not_configured' }`.
 *     It NEVER returns a plausible-looking number. The UI renders
 *     "<Provider>: not configured" and the score renormalises without it.
 *  2. Every successful result carries the SourceKind it came from, so the
 *     confidence layer can weigh it honestly.
 */
import type { SourceKind } from '@/lib/quality/confidence';

export type ProviderTier = 'free' | 'freemium' | 'premium';

export type ProviderId =
  | 'coingecko' | 'defillama' | 'geckoterminal' | 'coinmetrics' | 'feargreed'
  | 'coinglass' | 'glassnode' | 'cryptoquant' | 'artemis';

export type UnavailableReason =
  | 'not_configured'   // no API key present
  | 'unauthorized'     // key present but rejected, or plan too low
  | 'rate_limited'
  | 'unavailable'      // network/5xx/circuit open
  | 'no_data';         // the call worked, the upstream simply has nothing

export interface ProviderOk<T> {
  ok: true;
  data: T;
  source: ProviderId;
  kind: SourceKind;
  /** ms epoch the upstream observed this, when it says so; else fetch time. */
  observedAt: number;
  fetchedAt: number;
}

export interface ProviderFail {
  ok: false;
  source: ProviderId;
  reason: UnavailableReason;
  /** Human-readable, safe to show in the UI. Never contains a key. */
  message: string;
  fetchedAt: number;
}

export type ProviderResult<T> = ProviderOk<T> | ProviderFail;

export function ok<T>(
  source: ProviderId, kind: SourceKind, data: T, observedAt?: number,
): ProviderOk<T> {
  const now = Date.now();
  return { ok: true, data, source, kind, observedAt: observedAt ?? now, fetchedAt: now };
}

export function fail(
  source: ProviderId, reason: UnavailableReason, message: string,
): ProviderFail {
  return { ok: false, source, reason, message, fetchedAt: Date.now() };
}

/** Standard message so "not configured" reads identically everywhere. */
export function notConfigured(source: ProviderId, envVar: string): ProviderFail {
  return fail(source, 'not_configured', `${label(source)}: not configured (set ${envVar})`);
}

/** Map a thrown error onto a provider failure without leaking internals. */
export function fromError(source: ProviderId, err: unknown): ProviderFail {
  const status = typeof err === 'object' && err !== null && 'status' in err
    ? (err as { status: unknown }).status : null;
  if (status === 401 || status === 403) {
    return fail(source, 'unauthorized',
      `${label(source)}: key rejected or plan does not include this endpoint`);
  }
  if (status === 429) return fail(source, 'rate_limited', `${label(source)}: rate limited`);
  const message = err instanceof Error ? err.message.slice(0, 160) : 'unavailable';
  return fail(source, 'unavailable', `${label(source)}: ${message}`);
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  coingecko: 'CoinGecko',
  defillama: 'DeFiLlama',
  geckoterminal: 'GeckoTerminal',
  coinmetrics: 'Coin Metrics',
  feargreed: 'Fear & Greed',
  coinglass: 'CoinGlass',
  glassnode: 'Glassnode',
  cryptoquant: 'CryptoQuant',
  artemis: 'Artemis',
};

export function label(source: ProviderId): string {
  return PROVIDER_LABELS[source] ?? source;
}

export type ProviderStatus = 'online' | 'degraded' | 'error' | 'not_configured';

export interface ProviderHealth {
  id: ProviderId;
  label: string;
  tier: ProviderTier;
  requiresKey: boolean;
  configured: boolean;
  status: ProviderStatus;
  latencyMs: number | null;
  message: string;
  docsUrl: string;
  /** What this source contributes — rendered on /status. */
  capabilities: readonly string[];
}

export interface Provider {
  readonly id: ProviderId;
  readonly label: string;
  readonly tier: ProviderTier;
  readonly requiresKey: boolean;
  readonly docsUrl: string;
  /** What this provider contributes, for /status and DATA_SOURCES.md. */
  readonly capabilities: readonly string[];
  configured(): boolean;
  health(): Promise<ProviderHealth>;
}

/** Read a key from the server environment, treating blank as absent. */
export function envKey(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

/** Shared health() body so every provider reports identically. */
export async function probe(
  meta: Omit<ProviderHealth, 'status' | 'latencyMs' | 'message' | 'configured'>,
  configured: boolean,
  run: () => Promise<{ ok: boolean; message: string }>,
): Promise<ProviderHealth> {
  if (meta.requiresKey && !configured) {
    return {
      ...meta, configured: false, status: 'not_configured', latencyMs: null,
      message: `${meta.label}: not configured — optional enhancement, the platform runs without it`,
    };
  }
  const started = Date.now();
  try {
    const r = await run();
    return {
      ...meta, configured, status: r.ok ? 'online' : 'error',
      latencyMs: Date.now() - started, message: r.message,
    };
  } catch (e) {
    return {
      ...meta, configured, status: 'error', latencyMs: Date.now() - started,
      message: e instanceof Error ? e.message.slice(0, 160) : 'unreachable',
    };
  }
}
