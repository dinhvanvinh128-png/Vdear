import type { Provider, ProviderHealth } from '@/lib/providers/types';
import { probe } from '@/lib/providers/types';
import { defillamaConfigured, getStablecoinSupply } from '@/lib/providers/defillama/client';

const META = {
  id: 'defillama' as const,
  label: 'DeFiLlama',
  tier: 'freemium' as const,
  requiresKey: false, // free endpoints carry the whole feature
  docsUrl: 'https://defillama.com/docs/api',
  capabilities: [
    'stablecoin supply + 1d/7d/30d change + chain split',
    'chain TVL and TVL change',
    'DEX volume overview',
  ],
};

export const defillama: Provider = {
  ...META,
  configured: () => true,
  async health(): Promise<ProviderHealth> {
    return probe(META, defillamaConfigured(), async () => {
      const r = await getStablecoinSupply();
      if (!r.ok) return { ok: false, message: r.message };
      const bn = (r.data.totalUsd / 1e9).toFixed(1);
      return { ok: true, message: `DeFiLlama online (stablecoin supply $${bn}B)` };
    });
  },
};
