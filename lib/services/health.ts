/**
 * API health monitor (spec §37). Pings each exchange with a cheap public call
 * and reports online/error + latency. Never throws; a down exchange is just a
 * red dot, never a crashed dashboard.
 */
import type { ExchangeId } from '@/lib/types';
import { ADAPTERS } from '@/lib/exchanges/registry';
import { coinglassStatus } from '@/lib/coinglass';
import { cacheStats } from '@/lib/cache';

export interface SourceHealth {
  id: ExchangeId | 'coinglass';
  label: string;
  status: 'online' | 'error' | 'not_configured';
  latencyMs: number | null;
  message?: string;
}

export interface HealthReport {
  sources: SourceHealth[];
  cache: { entries: number; inflight: number };
  checkedAt: number;
}

export async function getHealth(): Promise<HealthReport> {
  const exchangeChecks = ADAPTERS.map(async (a): Promise<SourceHealth> => {
    const started = Date.now();
    try {
      const t = await a.getTicker('BTCUSDT', a.supports.futures ? 'futures' : 'spot');
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

  const cgCheck = (async (): Promise<SourceHealth> => {
    const s = await coinglassStatus();
    if (!s.configured) return { id: 'coinglass', label: 'CoinGlass', status: 'not_configured', latencyMs: null, message: s.message };
    return { id: 'coinglass', label: 'CoinGlass', status: s.reachable ? 'online' : 'error', latencyMs: null, message: s.message };
  })();

  const sources = await Promise.all([...exchangeChecks, cgCheck]);
  return { sources, cache: cacheStats(), checkedAt: Date.now() };
}
