import type { Provider, ProviderHealth } from '@/lib/providers/types';
import { probe } from '@/lib/providers/types';
import { getNetworkPools } from '@/lib/providers/geckoterminal/client';

const META = {
  id: 'geckoterminal' as const,
  label: 'GeckoTerminal',
  tier: 'free' as const,
  requiresKey: false,
  docsUrl: 'https://www.geckoterminal.com/dex-api',
  capabilities: ['DEX pool liquidity', 'DEX 24h volume', 'buys/sells and buyers/sellers'],
};

export const geckoterminal: Provider = {
  ...META,
  configured: () => true,
  async health(): Promise<ProviderHealth> {
    return probe(META, true, async () => {
      const r = await getNetworkPools('eth');
      return r.ok
        ? { ok: true, message: `GeckoTerminal online (${r.data.pools.length} ETH pools)` }
        : { ok: false, message: r.message };
    });
  },
};
