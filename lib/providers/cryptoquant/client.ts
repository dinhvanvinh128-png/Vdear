/**
 * CryptoQuant — OPTIONAL premium provider (spec: CRYPTOQUANT section).
 *
 * API v1 (https://cryptoquant.com/docs):
 *   GET https://api.cryptoquant.com/v1/{asset}/exchange-flows/{endpoint}
 *       ?exchange=all_exchange&window=day&limit=…
 *   Header: Authorization: Bearer <key>
 *   → { status: { code, message }, result: { window, data: [ { datetime, … } ] } }
 *
 * WITHOUT A KEY THIS RETURNS `not_configured`. The exchange-flow view then falls
 * back to what free sources genuinely support — Coin Metrics aggregate flows and
 * real large CEX fills — and the UI says which one it is using.
 */
import { request } from '@/lib/net/request';
import {
  envKey, fail, fromError, notConfigured, ok, type ProviderResult,
} from '@/lib/providers/types';

const BASE = process.env.CRYPTOQUANT_API_BASE || 'https://api.cryptoquant.com/v1';

export type FlowEndpoint = 'inflow' | 'outflow' | 'netflow' | 'reserve';

export interface ExchangeFlowPoint {
  time: number; // ms epoch
  /** Value in the asset's own units, as CryptoQuant reports it. */
  value: number;
  valueUsd: number | null;
}

export interface ExchangeFlow {
  asset: string;
  endpoint: FlowEndpoint;
  exchange: string;
  points: ExchangeFlowPoint[];
}

export function cryptoquantConfigured(): boolean {
  return !!envKey('CRYPTOQUANT_API_KEY');
}

interface RawFlowRow {
  datetime?: string;
  date?: string;
  [field: string]: string | number | undefined;
}

interface RawFlowResponse {
  status?: { code?: number; message?: string };
  result?: { window?: string; data?: RawFlowRow[] };
}

/** CryptoQuant names the value column after the endpoint; try the known aliases. */
function pickValue(row: RawFlowRow, endpoint: FlowEndpoint): number | null {
  const candidates = [
    endpoint,
    `${endpoint}_total`,
    `${endpoint}_mean`,
    endpoint === 'reserve' ? 'reserve' : `${endpoint}_top10`,
    'value',
  ];
  for (const c of candidates) {
    const v = row[c];
    if (v == null) continue;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export async function getExchangeFlow(
  asset = 'btc',
  endpoint: FlowEndpoint = 'netflow',
  exchange = 'all_exchange',
  limit = 60,
): Promise<ProviderResult<ExchangeFlow>> {
  const key = envKey('CRYPTOQUANT_API_KEY');
  if (!key) return notConfigured('cryptoquant', 'CRYPTOQUANT_API_KEY');

  const group = endpoint === 'reserve' ? 'exchange-flows' : 'exchange-flows';
  const url = `${BASE}/${encodeURIComponent(asset.toLowerCase())}/${group}/${endpoint}`
    + `?exchange=${encodeURIComponent(exchange)}&window=day&limit=${Math.min(500, limit)}`;

  try {
    const raw = await request<RawFlowResponse>(url, {
      headers: { Authorization: `Bearer ${key}` }, timeoutMs: 12_000,
    });
    if (raw?.status?.code != null && raw.status.code !== 200) {
      return fail('cryptoquant', 'unavailable',
        `CryptoQuant: ${raw.status.message ?? `code ${raw.status.code}`}`);
    }
    const rows = raw?.result?.data ?? [];
    const points: ExchangeFlowPoint[] = [];
    for (const row of rows) {
      const stamp = row.datetime ?? row.date;
      const t = stamp ? Date.parse(String(stamp)) : NaN;
      const value = pickValue(row, endpoint);
      if (!Number.isFinite(t) || value == null) continue;
      const usdRaw = row[`${endpoint}_usd`] ?? row.value_usd;
      const usd = usdRaw == null ? null : parseFloat(String(usdRaw));
      points.push({ time: t, value, valueUsd: Number.isFinite(usd) ? (usd as number) : null });
    }
    if (points.length === 0) {
      return fail('cryptoquant', 'no_data', `CryptoQuant: empty ${endpoint} series for ${asset}`);
    }
    points.sort((a, b) => a.time - b.time);
    return ok('cryptoquant', 'onchain_provider',
      { asset: asset.toLowerCase(), endpoint, exchange, points },
      points[points.length - 1]!.time);
  } catch (e) {
    const r = fromError('cryptoquant', e);
    if (r.reason === 'unauthorized') {
      return fail('cryptoquant', 'unauthorized',
        'CryptoQuant: key rejected or the plan does not include exchange flows');
    }
    return r;
  }
}

export async function cryptoquantPing(): Promise<{ ok: boolean; message: string }> {
  if (!cryptoquantConfigured()) return { ok: false, message: 'CryptoQuant: not configured' };
  const r = await getExchangeFlow('btc', 'netflow', 'all_exchange', 3);
  return r.ok
    ? { ok: true, message: `CryptoQuant online (${r.data.points.length} netflow points)` }
    : { ok: false, message: r.message };
}
