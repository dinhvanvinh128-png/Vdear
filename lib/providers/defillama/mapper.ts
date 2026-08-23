/** Raw DeFiLlama payloads -> VDEAR shapes. Pure; unit-tested against fixtures. */
import { num } from '@/lib/exchanges/http';
import { pctChange } from '@/lib/indicators/series';
import type {
  ChainTvl, DexVolume, StablecoinAsset, StablecoinSupply, TvlSnapshot,
} from '@/lib/providers/defillama/types';

/** DeFiLlama nests every amount under its peg type, e.g. { peggedUSD: 1234 }. */
type Pegged = Record<string, number> | number | null | undefined;

export function unpeg(v: Pegged): number {
  if (v == null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  // Sum every peg type so a USD-pegged and EUR-pegged asset both count.
  let total = 0;
  for (const value of Object.values(v)) total += num(value);
  return total;
}

export interface RawStablecoin {
  id?: string | number;
  name?: string;
  symbol?: string;
  pegType?: string;
  circulating?: Pegged;
  circulatingPrevDay?: Pegged;
  circulatingPrevWeek?: Pegged;
  circulatingPrevMonth?: Pegged;
  chains?: string[];
  chainCirculating?: Record<string, { current?: Pegged }>;
}

export function mapStablecoins(
  raw: { peggedAssets?: RawStablecoin[] },
  observedAt = Date.now(),
): StablecoinSupply | null {
  const rows = raw?.peggedAssets;
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const assets: StablecoinAsset[] = [];
  const chainTotals = new Map<string, number>();
  let total = 0, prevDay = 0, prevWeek = 0, prevMonth = 0;

  for (const r of rows) {
    const circulating = unpeg(r.circulating);
    // A de-listed stablecoin reports 0 — keep it out of the change maths so a
    // wind-down doesn't read as a market-wide liquidity contraction.
    if (circulating <= 0) continue;

    const asset: StablecoinAsset = {
      id: String(r.id ?? r.symbol ?? r.name ?? 'unknown'),
      name: r.name ?? 'Unknown',
      symbol: (r.symbol ?? '').toUpperCase(),
      pegType: r.pegType ?? 'peggedUSD',
      circulating,
      circulatingPrevDay: unpeg(r.circulatingPrevDay),
      circulatingPrevWeek: unpeg(r.circulatingPrevWeek),
      circulatingPrevMonth: unpeg(r.circulatingPrevMonth),
      chains: Array.isArray(r.chains) ? r.chains : [],
    };
    assets.push(asset);

    total += asset.circulating;
    prevDay += asset.circulatingPrevDay;
    prevWeek += asset.circulatingPrevWeek;
    prevMonth += asset.circulatingPrevMonth;

    for (const [chain, v] of Object.entries(r.chainCirculating ?? {})) {
      const usd = unpeg(v?.current);
      if (usd > 0) chainTotals.set(chain, (chainTotals.get(chain) ?? 0) + usd);
    }
  }

  if (total <= 0) return null;

  assets.sort((a, b) => b.circulating - a.circulating);
  const byChain = Array.from(chainTotals.entries())
    .map(([chain, usd]) => ({ chain, usd, share: (usd / total) * 100 }))
    .sort((a, b) => b.usd - a.usd);

  return {
    totalUsd: total,
    totalPrevDay: prevDay,
    totalPrevWeek: prevWeek,
    totalPrevMonth: prevMonth,
    change1d: prevDay > 0 ? pctChange(prevDay, total) : null,
    change7d: prevWeek > 0 ? pctChange(prevWeek, total) : null,
    change30d: prevMonth > 0 ? pctChange(prevMonth, total) : null,
    assets,
    byChain,
    observedAt,
  };
}

export interface RawChain {
  name?: string;
  tvl?: number;
  gecko_id?: string | null;
  tokenSymbol?: string | null;
}

export interface RawHistoricalTvl {
  date?: number; // seconds epoch
  tvl?: number;
}

export function mapTvl(
  chains: RawChain[],
  history: RawHistoricalTvl[] = [],
  observedAt = Date.now(),
): TvlSnapshot | null {
  if (!Array.isArray(chains) || chains.length === 0) return null;

  const mapped: ChainTvl[] = chains
    .filter((c) => Number.isFinite(c.tvl) && (c.tvl ?? 0) > 0)
    .map((c) => ({
      name: c.name ?? 'Unknown',
      tvl: num(c.tvl),
      geckoId: c.gecko_id ?? null,
      tokenSymbol: c.tokenSymbol ?? null,
    }))
    .sort((a, b) => b.tvl - a.tvl);

  const totalUsd = mapped.reduce((s, c) => s + c.tvl, 0);
  if (totalUsd <= 0) return null;

  // The history series is daily and ascending; index from the end.
  const series = history
    .filter((h) => Number.isFinite(h.tvl) && Number.isFinite(h.date))
    .map((h) => num(h.tvl));
  const at = (daysBack: number): number | null => {
    const i = series.length - 1 - daysBack;
    return i >= 0 && i < series.length ? series[i]! : null;
  };

  return {
    totalUsd,
    chains: mapped,
    change1d: pctChange(at(1), totalUsd),
    change7d: pctChange(at(7), totalUsd),
    change30d: pctChange(at(30), totalUsd),
    observedAt,
  };
}

export interface RawDexOverview {
  total24h?: number;
  total7d?: number;
  change_1d?: number;
  change_7d?: number;
  protocols?: { name?: string; total24h?: number; change_1d?: number }[];
}

export function mapDexVolume(raw: RawDexOverview, observedAt = Date.now()): DexVolume | null {
  if (!raw || !Number.isFinite(raw.total24h)) return null;
  const protocols = (raw.protocols ?? [])
    .filter((p) => Number.isFinite(p.total24h) && (p.total24h ?? 0) > 0)
    .map((p) => ({
      name: p.name ?? 'Unknown',
      volume24h: num(p.total24h),
      change1d: Number.isFinite(p.change_1d) ? num(p.change_1d) : null,
    }))
    .sort((a, b) => b.volume24h - a.volume24h)
    .slice(0, 20);

  return {
    total24h: num(raw.total24h),
    total7d: num(raw.total7d),
    change1d: Number.isFinite(raw.change_1d) ? num(raw.change_1d) : null,
    change7d: Number.isFinite(raw.change_7d) ? num(raw.change_7d) : null,
    protocols,
    observedAt,
  };
}
