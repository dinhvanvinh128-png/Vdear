/**
 * Exchange registry — the single place adapters are registered.
 * Adding a new exchange = implement an adapter + add one line here.
 * Nothing else in the app references a concrete exchange class.
 */
import type { ExchangeAdapter } from '@/lib/exchanges/types';
import type { ExchangeId } from '@/lib/types';
import { binance } from '@/lib/exchanges/binance';
import { okx } from '@/lib/exchanges/okx';
import { bybit } from '@/lib/exchanges/bybit';
import { bitget } from '@/lib/exchanges/bitget';

export const ADAPTERS: ExchangeAdapter[] = [binance, okx, bybit, bitget];

export const ADAPTER_MAP: Record<ExchangeId, ExchangeAdapter> = {
  binance, okx, bybit, bitget,
};

export const EXCHANGE_IDS: ExchangeId[] = ADAPTERS.map((a) => a.id);

export function getAdapter(id: ExchangeId): ExchangeAdapter | undefined {
  return ADAPTER_MAP[id];
}

/** Parse a `?exchange=` query into a list of adapters ('all' or comma list). */
export function resolveAdapters(param?: string | null): ExchangeAdapter[] {
  if (!param || param.toLowerCase() === 'all') return ADAPTERS;
  const ids = param.toLowerCase().split(',').map((s) => s.trim());
  return ADAPTERS.filter((a) => ids.includes(a.id));
}
