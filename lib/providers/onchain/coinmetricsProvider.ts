/** Coin Metrics as an OnChainProvider — the free default. */
import type { OnChainMetric, OnChainProvider, OnChainSeries } from '@/lib/providers/onchain/types';
import { getAssetMetrics } from '@/lib/providers/coinmetrics/client';
import type { CmMetricKey } from '@/lib/providers/coinmetrics/types';

const MAP: Partial<Record<OnChainMetric, CmMetricKey>> = {
  activeAddresses: 'activeAddresses',
  newAddresses: 'newAddresses',
  txCount: 'txCount',
  transferValueUsd: 'transferValueUsd',
  feesUsd: 'feesUsd',
  supplyCurrent: 'supplyCurrent',
};

export const coinmetricsOnChain: OnChainProvider = {
  id: 'coinmetrics',
  label: 'Coin Metrics',
  supports: Object.keys(MAP) as OnChainMetric[],
  // Community tier needs no key, so this is always available.
  configured: () => true,

  async fetch(metric, asset, days): Promise<OnChainSeries | null> {
    const cmKey = MAP[metric];
    if (!cmKey) return null;
    const r = await getAssetMetrics(asset, [cmKey], days);
    if (!r.ok) return null;
    const points = r.data.series[cmKey];
    if (!points || points.length === 0) return null;
    return { metric, asset: asset.toUpperCase(), points, source: 'coinmetrics', kind: 'onchain_provider' };
  },
};
