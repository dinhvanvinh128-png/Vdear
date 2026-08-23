import type { Provider, ProviderHealth } from '@/lib/providers/types';
import { envKey, probe } from '@/lib/providers/types';
import { coinglassStatus } from '@/lib/providers/coinglass/client';

const META = {
  id: 'coinglass' as const,
  label: 'CoinGlass',
  tier: 'premium' as const,
  requiresKey: true,
  docsUrl: 'https://docs.coinglass.com/',
  capabilities: [
    'liquidation map (Professional+)',
    'liquidation heatmap (Professional+)',
    'liquidation history',
  ],
};

export const coinglass: Provider = {
  ...META,
  configured: () => !!envKey('COINGLASS_API_KEY'),
  async health(): Promise<ProviderHealth> {
    return probe(META, coinglass.configured(), async () => {
      const s = await coinglassStatus();
      return { ok: !!s.reachable, message: s.message };
    });
  },
};
