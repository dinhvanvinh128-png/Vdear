/**
 * Glassnode — OPTIONAL premium provider (spec: GLASSNODE section).
 *
 * Endpoint family (https://docs.glassnode.com/basic-api/endpoints):
 *   GET https://api.glassnode.com/v1/metrics/{category}/{metric}?a=BTC&i=24h&api_key=…
 *   → [{ t: <seconds epoch>, v: <value> }, …]
 *
 * WITHOUT A KEY THIS RETURNS `not_configured` AND NOTHING ELSE. There is no
 * simulated MVRV, no approximated SOPR. The UI shows "Glassnode: not configured"
 * and the on-chain score falls back to Coin Metrics (see lib/providers/onchain).
 *
 * Metric availability is plan-dependent; a 401/403 is surfaced as `unauthorized`
 * with a message saying the plan may not include the metric.
 */
import { request } from '@/lib/net/request';
import {
  envKey, fail, fromError, notConfigured, ok, type ProviderResult,
} from '@/lib/providers/types';

const BASE = process.env.GLASSNODE_API_BASE || 'https://api.glassnode.com/v1/metrics';

export interface GlassnodePoint {
  time: number; // ms epoch
  value: number;
}

/** The metrics VDEAR asks for, by the paths Glassnode documents. */
export const GLASSNODE_METRICS = {
  mvrv: 'market/mvrv',
  mvrvZScore: 'market/mvrv_z_score',
  realizedCap: 'market/marketcap_realized_usd',
  sopr: 'indicators/sopr',
  soprAdjusted: 'indicators/sopr_adjusted',
  exchangeBalance: 'distribution/balance_exchanges',
  exchangeNetFlow: 'transactions/transfers_volume_exchanges_net',
  lthSupply: 'supply/lth_sum',
  sthSupply: 'supply/sth_sum',
} as const;

export type GlassnodeMetric = keyof typeof GLASSNODE_METRICS;

export function glassnodeConfigured(): boolean {
  return !!envKey('GLASSNODE_API_KEY');
}

type RawPoint = { t?: number; v?: number | null };

export async function getMetric(
  metric: GlassnodeMetric, asset = 'BTC', interval = '24h',
): Promise<ProviderResult<GlassnodePoint[]>> {
  const key = envKey('GLASSNODE_API_KEY');
  if (!key) return notConfigured('glassnode', 'GLASSNODE_API_KEY');

  const path = GLASSNODE_METRICS[metric];
  try {
    const rows = await request<RawPoint[]>(
      `${BASE}/${path}?a=${encodeURIComponent(asset.toUpperCase())}&i=${interval}&api_key=${encodeURIComponent(key)}`,
      { timeoutMs: 12_000 },
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      return fail('glassnode', 'no_data', `Glassnode: no data for ${metric} (${asset})`);
    }
    const points = rows
      .filter((r) => Number.isFinite(r.t) && Number.isFinite(r.v))
      .map((r) => ({ time: (r.t as number) * 1000, value: r.v as number }));
    if (points.length === 0) {
      return fail('glassnode', 'no_data', `Glassnode: empty series for ${metric}`);
    }
    return ok('glassnode', 'onchain_provider', points, points[points.length - 1]!.time);
  } catch (e) {
    const r = fromError('glassnode', e);
    if (r.reason === 'unauthorized') {
      return fail('glassnode', 'unauthorized',
        `Glassnode: "${metric}" rejected — the key is invalid or the plan does not include this metric`);
    }
    return r;
  }
}

/** Cheapest call that proves the key works, used by health(). */
export async function glassnodePing(): Promise<{ ok: boolean; message: string }> {
  if (!glassnodeConfigured()) {
    return { ok: false, message: 'Glassnode: not configured' };
  }
  const r = await getMetric('mvrv', 'BTC', '24h');
  return r.ok
    ? { ok: true, message: `Glassnode online (${r.data.length} MVRV points)` }
    : { ok: false, message: r.message };
}
