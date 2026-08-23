/**
 * Provider registry — the single list of every non-exchange data source.
 *
 * /status renders straight off this, and DATA_SOURCES.md is generated from the
 * same metadata, so "which sources does VDEAR use and which need a key" has
 * exactly one answer in the codebase.
 */
import type { Provider, ProviderHealth, ProviderId } from '@/lib/providers/types';
import { coingecko } from '@/lib/providers/coingecko/health';
import { defillama } from '@/lib/providers/defillama/health';
import { geckoterminal } from '@/lib/providers/geckoterminal/health';
import { coinmetrics } from '@/lib/providers/coinmetrics/health';
import { feargreed } from '@/lib/providers/feargreed/health';
import { coinglass } from '@/lib/providers/coinglass/health';
import { glassnode } from '@/lib/providers/glassnode/health';
import { cryptoquant } from '@/lib/providers/cryptoquant/health';
import { artemis } from '@/lib/providers/artemis/health';

/** Free-first: these carry the product on their own. */
export const CORE_PROVIDERS: Provider[] = [
  coingecko, defillama, geckoterminal, coinmetrics, feargreed,
];

/** Optional enhancements. Absent keys degrade features, never break them. */
export const PREMIUM_PROVIDERS: Provider[] = [
  coinglass, glassnode, cryptoquant, artemis,
];

export const PROVIDERS: Provider[] = [...CORE_PROVIDERS, ...PREMIUM_PROVIDERS];

export const PROVIDER_MAP: Record<ProviderId, Provider> = Object.fromEntries(
  PROVIDERS.map((p) => [p.id, p]),
) as Record<ProviderId, Provider>;

export function getProvider(id: ProviderId): Provider | undefined {
  return PROVIDER_MAP[id];
}

export function configuredProviders(): Provider[] {
  return PROVIDERS.filter((p) => p.configured());
}

/**
 * Health of every provider, in parallel. Never throws — a provider that blows
 * up in its own health check is reported as `error`, which is the information
 * the operator actually wants.
 */
export async function providerHealth(): Promise<ProviderHealth[]> {
  return Promise.all(PROVIDERS.map(async (p): Promise<ProviderHealth> => {
    try {
      return await p.health();
    } catch (e) {
      return {
        id: p.id, label: p.label, tier: p.tier, requiresKey: p.requiresKey,
        configured: p.configured(), status: 'error', latencyMs: null,
        message: e instanceof Error ? e.message.slice(0, 160) : 'health check failed',
        docsUrl: p.docsUrl, capabilities: p.capabilities,
      };
    }
  }));
}

/**
 * Is the platform able to produce a full-confidence picture right now?
 * Premium gaps are expected and do NOT count as degradation — only a core
 * provider being down does.
 */
export function summarizeHealth(reports: ProviderHealth[]) {
  const core = reports.filter((r) => CORE_PROVIDERS.some((p) => p.id === r.id));
  const premium = reports.filter((r) => PREMIUM_PROVIDERS.some((p) => p.id === r.id));
  const coreOnline = core.filter((r) => r.status === 'online').length;
  return {
    coreOnline,
    coreTotal: core.length,
    premiumConfigured: premium.filter((r) => r.configured).length,
    premiumTotal: premium.length,
    degraded: coreOnline < core.length,
  };
}
