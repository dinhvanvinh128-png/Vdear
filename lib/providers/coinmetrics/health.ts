import type { Provider, ProviderHealth } from '@/lib/providers/types';
import { probe } from '@/lib/providers/types';
import { coinmetricsConfigured, getAssetMetrics } from '@/lib/providers/coinmetrics/client';

const META = {
  id: 'coinmetrics' as const,
  label: 'Coin Metrics',
  tier: 'freemium' as const,
  requiresKey: false, // the community tier carries the on-chain score
  docsUrl: 'https://docs.coinmetrics.io/api/v4',
  capabilities: [
    'active & new addresses',
    'transaction count',
    'adjusted transfer value (USD)',
    'total fees (USD)',
    'current supply',
  ],
};

export const coinmetrics: Provider = {
  ...META,
  configured: () => true,
  async health(): Promise<ProviderHealth> {
    return probe(META, coinmetricsConfigured(), async () => {
      const r = await getAssetMetrics('btc', ['activeAddresses'], 3);
      if (!r.ok) return { ok: false, message: r.message };
      const tier = coinmetricsConfigured() ? 'Pro key' : 'community tier';
      return { ok: true, message: `Coin Metrics online (${tier})` };
    });
  },
};
