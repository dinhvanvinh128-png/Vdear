/**
 * Coin Metrics Community API v4 (https://docs.coinmetrics.io/api/v4).
 *
 *   GET /v4/timeseries/asset-metrics
 *       ?assets=btc&metrics=AdrActCnt,TxCnt&frequency=1d&page_size=…
 *
 * Free and keyless for the community metric subset, which is exactly what the
 * on-chain score needs. This is the DEFAULT on-chain provider precisely because
 * it requires no key — Glassnode and CryptoQuant are enhancements on top.
 */
import { request } from '@/lib/net/request';
import { envKey, fail, fromError, ok, type ProviderResult } from '@/lib/providers/types';
import { CM_METRICS, type CmMetricKey, type OnChainSnapshot } from '@/lib/providers/coinmetrics/types';
import { mapRows, type RawCmRow } from '@/lib/providers/coinmetrics/mapper';

const COMMUNITY_BASE = 'https://community-api.coinmetrics.io/v4';
const PRO_BASE = 'https://api.coinmetrics.io/v4';

export function coinmetricsConfigured(): boolean {
  return !!envKey('COINMETRICS_API_KEY');
}

function base(): string {
  return coinmetricsConfigured() ? PRO_BASE : COMMUNITY_BASE;
}

function auth(): Record<string, string> {
  const key = envKey('COINMETRICS_API_KEY');
  return key ? { Authorization: `Bearer ${key}` } : {};
}

export const DEFAULT_METRICS: CmMetricKey[] = [
  'activeAddresses', 'newAddresses', 'txCount', 'transferValueUsd', 'feesUsd', 'supplyCurrent',
];

/**
 * Daily history for one asset. `days` drives the lookback the z-scores use, so
 * the default of 90 comfortably covers a 30-day baseline plus warm-up.
 */
export async function getAssetMetrics(
  asset: string,
  metrics: readonly CmMetricKey[] = DEFAULT_METRICS,
  days = 90,
): Promise<ProviderResult<OnChainSnapshot>> {
  const id = asset.toLowerCase();
  const ids = metrics.map((m) => CM_METRICS[m]).join(',');
  const start = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const url = `${base()}/timeseries/asset-metrics`
    + `?assets=${encodeURIComponent(id)}`
    + `&metrics=${encodeURIComponent(ids)}`
    + `&frequency=1d&page_size=${Math.min(10_000, days + 10)}`
    + `&start_time=${start}`;

  try {
    const raw = await request<{ data?: RawCmRow[] }>(url, {
      headers: auth(), timeoutMs: 12_000,
    });
    const series = mapRows(raw?.data ?? [], metrics);
    if (Object.keys(series).length === 0) {
      // A valid asset with no community coverage — say so rather than score it.
      return fail('coinmetrics', 'no_data',
        `Coin Metrics: no community metrics for ${asset.toUpperCase()}`);
    }
    return ok('coinmetrics', 'onchain_provider', { asset: id, series, observedAt: Date.now() });
  } catch (e) {
    return fromError('coinmetrics', e);
  }
}

/** Assets Coin Metrics covers — used to skip the call for unsupported coins. */
export async function getSupportedAssets(): Promise<string[]> {
  try {
    const raw = await request<{ data?: { asset?: string }[] }>(
      `${base()}/catalog-v2/asset-metrics?assets=btc`, { headers: auth(), timeoutMs: 8000 },
    );
    return (raw?.data ?? []).map((d) => d.asset ?? '').filter(Boolean);
  } catch {
    return [];
  }
}
