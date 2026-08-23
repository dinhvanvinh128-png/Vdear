import type { Provider, ProviderHealth } from '@/lib/providers/types';
import { envKey, probe } from '@/lib/providers/types';
import { glassnodePing } from '@/lib/providers/glassnode/client';

const META = {
  id: 'glassnode' as const,
  label: 'Glassnode',
  tier: 'premium' as const,
  requiresKey: true,
  docsUrl: 'https://docs.glassnode.com/basic-api/endpoints',
  capabilities: [
    'MVRV / MVRV Z-score', 'SOPR / aSOPR', 'realized cap',
    'exchange balances', 'exchange net flow', 'LTH / STH supply',
  ],
};

export const glassnode: Provider = {
  ...META,
  configured: () => !!envKey('GLASSNODE_API_KEY'),
  async health(): Promise<ProviderHealth> {
    return probe(META, glassnode.configured(), glassnodePing);
  },
};
