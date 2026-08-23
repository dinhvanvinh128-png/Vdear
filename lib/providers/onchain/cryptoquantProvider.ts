/** CryptoQuant as an OnChainProvider — premium, key-gated, best for flows. */
import type { OnChainMetric, OnChainProvider, OnChainSeries } from '@/lib/providers/onchain/types';
import {
  cryptoquantConfigured, getExchangeFlow, type FlowEndpoint,
} from '@/lib/providers/cryptoquant/client';

const MAP: Partial<Record<OnChainMetric, FlowEndpoint>> = {
  exchangeInflow: 'inflow',
  exchangeOutflow: 'outflow',
  exchangeNetflow: 'netflow',
  exchangeReserve: 'reserve',
};

export const cryptoquantOnChain: OnChainProvider = {
  id: 'cryptoquant',
  label: 'CryptoQuant',
  supports: Object.keys(MAP) as OnChainMetric[],
  configured: cryptoquantConfigured,

  async fetch(metric, asset, days): Promise<OnChainSeries | null> {
    const endpoint = MAP[metric];
    if (!endpoint) return null;
    const r = await getExchangeFlow(asset, endpoint, 'all_exchange', days);
    if (!r.ok) return null;
    const points = r.data.points.map((p) => ({
      time: p.time,
      // Prefer the USD figure when CryptoQuant provides it — it is comparable
      // across assets; otherwise keep native units and let the caller normalise.
      value: p.valueUsd ?? p.value,
    }));
    return { metric, asset: asset.toUpperCase(), points, source: 'cryptoquant', kind: 'onchain_provider' };
  },
};
