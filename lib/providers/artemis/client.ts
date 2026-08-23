/**
 * Artemis — OPTIONAL premium provider (spec: ARTEMIS section).
 *
 *   GET https://api.artemisxyz.com/data/{metrics}/?artemisIds={ids}&APIKey=…
 *   → { data: { artemis_ids: { <id>: { <metric>: [ { date, val }, … ] } } } }
 *
 * ⚠️ HONESTY NOTE, read before trusting this file: unlike every other connector
 * here, the Artemis response shape could NOT be verified against a live call
 * during development (no network access to the host, and Artemis publishes its
 * schema behind an account). The request shape follows their public docs, and
 * the parser is written DEFENSIVELY — it accepts several plausible field names
 * and returns `no_data` rather than a wrong number if none match.
 *
 * Because of that, ARTEMIS_API_BASE / ARTEMIS_METRIC_PATH are overridable from
 * the environment: if the account's schema differs, it is a config change, not
 * a code change. Without a key this returns `not_configured` and the network
 * fundamentals score falls back to Coin Metrics.
 */
import { request } from '@/lib/net/request';
import {
  envKey, fail, fromError, notConfigured, ok, type ProviderResult,
} from '@/lib/providers/types';

const BASE = process.env.ARTEMIS_API_BASE || 'https://api.artemisxyz.com';

export const ARTEMIS_METRICS = {
  dailyActiveUsers: 'DAU',
  dailyTransactions: 'DAILY_TXNS',
  fees: 'FEES',
  revenue: 'REVENUE',
  tvl: 'TVL',
} as const;

export type ArtemisMetric = keyof typeof ARTEMIS_METRICS;

export interface ArtemisPoint {
  time: number; // ms epoch
  value: number;
}

export interface ArtemisSeries {
  ecosystem: string;
  metrics: Partial<Record<ArtemisMetric, ArtemisPoint[]>>;
}

export function artemisConfigured(): boolean {
  return !!envKey('ARTEMIS_API_KEY');
}

/** Accept the several shapes Artemis has used for a datapoint. */
type RawPoint = { date?: string; val?: number | string; value?: number | string; v?: number | string };

function toPoints(raw: unknown): ArtemisPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: ArtemisPoint[] = [];
  for (const r of raw as RawPoint[]) {
    if (!r || typeof r !== 'object') continue;
    const t = r.date ? Date.parse(String(r.date)) : NaN;
    const rawVal = r.val ?? r.value ?? r.v;
    const value = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal));
    if (!Number.isFinite(t) || !Number.isFinite(value)) continue;
    out.push({ time: t, value });
  }
  return out.sort((a, b) => a.time - b.time);
}

export async function getEcosystemMetrics(
  ecosystem = 'ethereum',
  metrics: readonly ArtemisMetric[] = ['dailyActiveUsers', 'dailyTransactions', 'fees', 'revenue'],
): Promise<ProviderResult<ArtemisSeries>> {
  const key = envKey('ARTEMIS_API_KEY');
  if (!key) return notConfigured('artemis', 'ARTEMIS_API_KEY');

  const ids = metrics.map((m) => ARTEMIS_METRICS[m]).join(',');
  const url = `${BASE}/data/${encodeURIComponent(ids)}/`
    + `?artemisIds=${encodeURIComponent(ecosystem)}&APIKey=${encodeURIComponent(key)}`;

  try {
    const raw = await request<Record<string, unknown>>(url, { timeoutMs: 12_000 });

    // Walk to the per-ecosystem object without assuming one exact nesting.
    const dataRoot = (raw?.data ?? raw) as Record<string, unknown>;
    const byId = (dataRoot?.artemis_ids ?? dataRoot) as Record<string, unknown>;
    const eco = (byId?.[ecosystem] ?? byId) as Record<string, unknown> | undefined;
    if (!eco || typeof eco !== 'object') {
      return fail('artemis', 'no_data', `Artemis: unexpected response shape for ${ecosystem}`);
    }

    const out: Partial<Record<ArtemisMetric, ArtemisPoint[]>> = {};
    for (const m of metrics) {
      const id = ARTEMIS_METRICS[m];
      const points = toPoints(eco[id] ?? eco[id.toLowerCase()] ?? eco[m]);
      if (points.length > 0) out[m] = points;
    }
    if (Object.keys(out).length === 0) {
      // Better to say "we couldn't read it" than to publish a fabricated series.
      return fail('artemis', 'no_data',
        `Artemis: no recognisable series for ${ecosystem} — check ARTEMIS_API_BASE / plan coverage`);
    }
    return ok('artemis', 'aggregated_api', { ecosystem, metrics: out });
  } catch (e) {
    return fromError('artemis', e);
  }
}

export async function artemisPing(): Promise<{ ok: boolean; message: string }> {
  if (!artemisConfigured()) return { ok: false, message: 'Artemis: not configured' };
  const r = await getEcosystemMetrics('ethereum', ['dailyActiveUsers']);
  return r.ok
    ? { ok: true, message: 'Artemis online' }
    : { ok: false, message: r.message };
}
