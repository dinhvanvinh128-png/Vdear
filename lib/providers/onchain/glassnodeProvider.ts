/** Glassnode as an OnChainProvider — premium, key-gated. */
import type { OnChainMetric, OnChainProvider, OnChainSeries } from '@/lib/providers/onchain/types';
import {
  getMetric, glassnodeConfigured, type GlassnodeMetric,
} from '@/lib/providers/glassnode/client';

const MAP: Partial<Record<OnChainMetric, GlassnodeMetric>> = {
  mvrv: 'mvrv',
  sopr: 'sopr',
  exchangeNetflow: 'exchangeNetFlow',
  exchangeReserve: 'exchangeBalance',
};

export const glassnodeOnChain: OnChainProvider = {
  id: 'glassnode',
  label: 'Glassnode',
  supports: Object.keys(MAP) as OnChainMetric[],
  configured: glassnodeConfigured,

  async fetch(metric, asset, _days): Promise<OnChainSeries | null> {
    const gnMetric = MAP[metric];
    if (!gnMetric) return null;
    const r = await getMetric(gnMetric, asset, '24h');
    if (!r.ok) return null;
    return { metric, asset: asset.toUpperCase(), points: r.data, source: 'glassnode', kind: 'onchain_provider' };
  },
};
