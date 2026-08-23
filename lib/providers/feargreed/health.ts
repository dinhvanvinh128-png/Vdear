import type { Provider, ProviderHealth } from '@/lib/providers/types';
import { probe } from '@/lib/providers/types';
import { getFearGreed } from '@/lib/providers/feargreed/client';

const META = {
  id: 'feargreed' as const,
  label: 'Fear & Greed',
  tier: 'free' as const,
  requiresKey: false,
  docsUrl: 'https://alternative.me/crypto/fear-and-greed-index/',
  capabilities: ['crypto fear & greed index (sentiment context only)'],
};

export const feargreed: Provider = {
  ...META,
  configured: () => true,
  async health(): Promise<ProviderHealth> {
    return probe(META, true, async () => {
      const fg = await getFearGreed();
      return fg
        ? { ok: true, message: `Fear & Greed online (${fg.value} — ${fg.label})` }
        : { ok: false, message: 'no data' };
    });
  },
};
