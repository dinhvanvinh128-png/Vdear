import type { Provider, ProviderHealth } from '@/lib/providers/types';
import { envKey, probe } from '@/lib/providers/types';
import { artemisPing } from '@/lib/providers/artemis/client';

const META = {
  id: 'artemis' as const,
  label: 'Artemis',
  tier: 'premium' as const,
  requiresKey: true,
  docsUrl: 'https://docs.artemis.xyz/',
  capabilities: [
    'daily active users', 'daily transactions', 'fees', 'revenue', 'ecosystem TVL',
  ],
};

export const artemis: Provider = {
  ...META,
  configured: () => !!envKey('ARTEMIS_API_KEY'),
  async health(): Promise<ProviderHealth> {
    return probe(META, artemis.configured(), artemisPing);
  },
};
