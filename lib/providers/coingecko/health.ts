import type { Provider, ProviderHealth } from '@/lib/providers/types';
import { probe } from '@/lib/providers/types';
import { coingeckoConfigured, ping } from '@/lib/providers/coingecko/client';

const META = {
  id: 'coingecko' as const,
  label: 'CoinGecko',
  tier: 'freemium' as const,
  // Works with no key; a key only raises the rate limit.
  requiresKey: false,
  docsUrl: 'https://docs.coingecko.com/reference/introduction',
  capabilities: [
    'global market cap & volume',
    'BTC / ETH dominance',
    'market-cap ranking & coin metadata',
    'category taxonomy (sector rotation)',
  ],
};

export const coingecko: Provider = {
  ...META,
  configured: () => true,
  async health(): Promise<ProviderHealth> {
    const pro = coingeckoConfigured();
    return probe(META, pro, async () => {
      const up = await ping();
      return {
        ok: up,
        message: up
          ? `CoinGecko online (${pro ? 'Pro key' : 'free tier — tight rate limit'})`
          : 'CoinGecko unreachable',
      };
    });
  },
};
