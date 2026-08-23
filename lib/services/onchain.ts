/**
 * On-chain service — resolves metrics through the provider fallback chain and
 * reports which vendor answered for each one.
 */
import type { Envelope } from '@/lib/types';
import { cached } from '@/lib/cache';
import { resolveMetrics, type OnChainMetric, type OnChainResolution } from '@/lib/providers/onchain';
import { computeOnChainMetrics, ONCHAIN_WEIGHTS, type OnChainMetrics } from '@/lib/engines/onchain';

const ONCHAIN_TTL = 15 * 60_000; // daily metrics; refetching faster buys nothing

export const DEFAULT_ONCHAIN_METRICS = Object.keys(ONCHAIN_WEIGHTS) as OnChainMetric[];

export interface OnChainResult {
  metrics: OnChainMetrics;
  /** Every provider tried, and why it did not answer. */
  attempts: OnChainResolution['attempts'];
}

export async function getOnChain(
  asset: string, metrics: readonly OnChainMetric[] = DEFAULT_ONCHAIN_METRICS,
): Promise<Envelope<OnChainResult>> {
  const key = `onchain:${asset.toUpperCase()}:${metrics.join(',')}`;
  const res = await cached(key, ONCHAIN_TTL, async (): Promise<OnChainResult> => {
    const { series, attempts } = await resolveMetrics(metrics, asset, 90);
    return { metrics: computeOnChainMetrics(asset, series, metrics), attempts };
  });

  return {
    data: res,
    meta: {
      kind: res.metrics.metrics.length > 0 ? 'live' : 'unavailable',
      sources: [],
      errors: [],
      generatedAt: Date.now(),
      cached: false,
    },
  };
}

/** Exchange flow, for the whale engine. Null when no provider is configured. */
export async function getExchangeFlow(asset: string) {
  const key = `exchflow:${asset.toUpperCase()}`;
  return cached(key, ONCHAIN_TTL, async () => {
    const { series, attempts } = await resolveMetrics(
      ['exchangeNetflow', 'exchangeReserve'], asset, 90,
    );
    const netflow = series.exchangeNetflow ?? null;
    const reserve = series.exchangeReserve ?? null;

    // Explain the absence rather than leaving the UI to guess.
    const notConfigured = attempts
      .filter((a) => a.outcome === 'not_configured')
      .map((a) => a.provider);
    const reason = netflow
      ? null
      : notConfigured.length > 0
        ? `Exchange flow needs ${notConfigured.join(' or ')} — not configured. `
          + 'It is reported as unavailable rather than estimated from trade data.'
        : 'No configured provider returned exchange flow data.';

    return { netflow, reserve, reason, attempts };
  });
}
