/**
 * API health monitor (spec §37 / DATA QUALITY ENGINE).
 *
 * Pings every exchange with a cheap public call and every provider with its own
 * health(), reporting online / error / not_configured plus latency. Never
 * throws: a dead source is a red dot on /status and a missing input downstream,
 * never a crashed dashboard.
 *
 * "not_configured" is a first-class, non-alarming state — the premium providers
 * are optional by design, and the UI must not present their absence as a fault.
 */
import type { ExchangeId } from '@/lib/types';
import { ADAPTERS } from '@/lib/exchanges/registry';
import { providerHealth, summarizeHealth } from '@/lib/providers/registry';
import type { ProviderHealth } from '@/lib/providers/types';
import { cacheStats } from '@/lib/cache';
import { netStats } from '@/lib/net/request';

export interface SourceHealth {
  id: ExchangeId;
  label: string;
  status: 'online' | 'error';
  latencyMs: number | null;
  message?: string;
}

export interface HealthReport {
  exchanges: SourceHealth[];
  providers: ProviderHealth[];
  summary: ReturnType<typeof summarizeHealth> & {
    exchangesOnline: number;
    exchangesTotal: number;
  };
  cache: { entries: number; inflight: number };
  net: ReturnType<typeof netStats>;
  checkedAt: number;
}

export async function getHealth(): Promise<HealthReport> {
  const exchangeChecks = ADAPTERS.map(async (a): Promise<SourceHealth> => {
    const started = Date.now();
    try {
      const t = await a.getTicker('BTCUSDT', a.supports.spot ? 'spot' : 'futures');
      const latencyMs = Date.now() - started;
      return t
        ? { id: a.id, label: a.label, status: 'online', latencyMs }
        : { id: a.id, label: a.label, status: 'error', latencyMs, message: 'no data' };
    } catch (e) {
      return {
        id: a.id, label: a.label, status: 'error',
        latencyMs: Date.now() - started,
        message: e instanceof Error ? e.message.slice(0, 120) : 'error',
      };
    }
  });

  const [exchanges, providers] = await Promise.all([
    Promise.all(exchangeChecks),
    providerHealth(),
  ]);

  const exchangesOnline = exchanges.filter((e) => e.status === 'online').length;
  return {
    exchanges,
    providers,
    summary: {
      ...summarizeHealth(providers),
      exchangesOnline,
      exchangesTotal: exchanges.length,
    },
    cache: cacheStats(),
    net: netStats(),
    checkedAt: Date.now(),
  };
}
