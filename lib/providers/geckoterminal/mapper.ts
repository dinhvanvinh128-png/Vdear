/** GeckoTerminal JSON:API payloads -> VDEAR shapes. Pure. */
import { num } from '@/lib/exchanges/http';
import type { DexActivity, DexPool } from '@/lib/providers/geckoterminal/types';

export interface RawPool {
  id?: string;
  attributes?: {
    name?: string;
    reserve_in_usd?: string | number;
    volume_usd?: Record<string, string | number>;
    price_change_percentage?: Record<string, string | number>;
    transactions?: Record<string, { buys?: number; sells?: number; buyers?: number | null; sellers?: number | null }>;
  };
  relationships?: {
    dex?: { data?: { id?: string } };
    network?: { data?: { id?: string } };
  };
}

function optNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

export function mapPool(raw: RawPool, network: string): DexPool | null {
  const a = raw?.attributes;
  if (!a) return null;
  const tx = a.transactions?.h24 ?? {};
  return {
    id: raw.id ?? a.name ?? 'unknown',
    name: a.name ?? 'Unknown pool',
    network: raw.relationships?.network?.data?.id ?? network,
    dex: raw.relationships?.dex?.data?.id ?? null,
    reserveUsd: num(a.reserve_in_usd),
    volume24h: num(a.volume_usd?.h24),
    priceChange24h: optNum(a.price_change_percentage?.h24),
    buys24h: num(tx.buys),
    sells24h: num(tx.sells),
    // buyers/sellers are null on some networks — 0 would understate participation.
    buyers24h: num(tx.buyers ?? 0),
    sellers24h: num(tx.sellers ?? 0),
  };
}

export function mapActivity(
  raw: { data?: RawPool[] },
  network: string,
  observedAt = Date.now(),
): DexActivity | null {
  const rows = raw?.data;
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const pools = rows
    .map((r) => mapPool(r, network))
    .filter((p): p is DexPool => p !== null && p.reserveUsd > 0);
  if (pools.length === 0) return null;

  const totalBuys = pools.reduce((s, p) => s + p.buys24h, 0);
  const totalSells = pools.reduce((s, p) => s + p.sells24h, 0);
  const trades = totalBuys + totalSells;

  return {
    network,
    pools: pools.sort((a, b) => b.reserveUsd - a.reserveUsd),
    totalLiquidityUsd: pools.reduce((s, p) => s + p.reserveUsd, 0),
    totalVolume24h: pools.reduce((s, p) => s + p.volume24h, 0),
    totalBuys24h: totalBuys,
    totalSells24h: totalSells,
    totalBuyers24h: pools.reduce((s, p) => s + p.buyers24h, 0),
    totalSellers24h: pools.reduce((s, p) => s + p.sellers24h, 0),
    buyRatio: trades > 0 ? totalBuys / trades : null,
    observedAt,
  };
}
