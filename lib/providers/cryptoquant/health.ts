import type { Provider, ProviderHealth } from '@/lib/providers/types';
import { envKey, probe } from '@/lib/providers/types';
import { cryptoquantPing } from '@/lib/providers/cryptoquant/client';

const META = {
  id: 'cryptoquant' as const,
  label: 'CryptoQuant',
  tier: 'premium' as const,
  requiresKey: true,
  docsUrl: 'https://cryptoquant.com/docs',
  capabilities: [
    'exchange inflow / outflow / netflow', 'exchange reserve',
    'BTC & ETH reserve', 'stablecoin exchange flow',
  ],
};

export const cryptoquant: Provider = {
  ...META,
  configured: () => !!envKey('CRYPTOQUANT_API_KEY'),
  async health(): Promise<ProviderHealth> {
    return probe(META, cryptoquant.configured(), cryptoquantPing);
  },
};
