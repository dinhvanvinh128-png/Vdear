/**
 * On-chain resolver: ask for a metric, get the best provider that answers.
 *
 * Preference order is quality-first (first-party flow data beats an aggregate),
 * but the chain ALWAYS ends at a keyless provider where one exists, so the
 * platform keeps working with no premium keys at all — which is the whole point
 * of the free-first architecture.
 *
 * Adding Dune / Flipside / a raw RPC indexer later = implement OnChainProvider
 * and add it to CHAIN. Nothing downstream changes.
 */
import type {
  OnChainMetric, OnChainProvider, OnChainResolution, OnChainSeries,
} from '@/lib/providers/onchain/types';
import { cryptoquantOnChain } from '@/lib/providers/onchain/cryptoquantProvider';
import { glassnodeOnChain } from '@/lib/providers/onchain/glassnodeProvider';
import { coinmetricsOnChain } from '@/lib/providers/onchain/coinmetricsProvider';

export * from '@/lib/providers/onchain/types';
export { coinmetricsOnChain, glassnodeOnChain, cryptoquantOnChain };

/** Highest-quality first; the keyless provider is last so it always backstops. */
export const CHAIN: OnChainProvider[] = [
  cryptoquantOnChain,
  glassnodeOnChain,
  coinmetricsOnChain,
];

export async function resolveMetric(
  metric: OnChainMetric,
  asset: string,
  days = 90,
  chain: OnChainProvider[] = CHAIN,
): Promise<OnChainResolution> {
  const attempts: OnChainResolution['attempts'] = [];

  for (const provider of chain) {
    if (!provider.supports.includes(metric)) {
      attempts.push({ provider: provider.id, outcome: 'unsupported' });
      continue;
    }
    if (!provider.configured()) {
      attempts.push({
        provider: provider.id, outcome: 'not_configured',
        message: `${provider.label}: not configured`,
      });
      continue;
    }
    try {
      const series = await provider.fetch(metric, asset, days);
      if (series && series.points.length > 0) {
        attempts.push({ provider: provider.id, outcome: 'ok' });
        return { series, attempts };
      }
      attempts.push({ provider: provider.id, outcome: 'failed', message: 'no data' });
    } catch (e) {
      attempts.push({
        provider: provider.id, outcome: 'failed',
        message: e instanceof Error ? e.message.slice(0, 120) : 'error',
      });
    }
  }
  // Nothing answered. The caller reports "unavailable" — it does not invent one.
  return { series: null, attempts };
}

/** Resolve several metrics concurrently, keeping each one's provenance. */
export async function resolveMetrics(
  metrics: readonly OnChainMetric[],
  asset: string,
  days = 90,
): Promise<{
  series: Partial<Record<OnChainMetric, OnChainSeries>>;
  attempts: OnChainResolution['attempts'];
}> {
  const results = await Promise.all(metrics.map((m) => resolveMetric(m, asset, days)));
  const series: Partial<Record<OnChainMetric, OnChainSeries>> = {};
  const attempts: OnChainResolution['attempts'] = [];
  results.forEach((r, i) => {
    if (r.series) series[metrics[i]!] = r.series;
    attempts.push(...r.attempts);
  });
  return { series, attempts };
}
