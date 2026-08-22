/**
 * Market service — composes adapters + cache + aggregation into the payloads
 * the API routes serve. This is where "multi-exchange, fail-soft, cached" lives
 * so every route stays a thin wrapper.
 */
import type {
  AggregatedTicker, Envelope, ExchangeId, IndexMethod, MarketType, Ticker,
} from '@/lib/types';
import type { ExchangeAdapter } from '@/lib/exchanges/types';
import { ADAPTERS } from '@/lib/exchanges/registry';
import { cached, TTL } from '@/lib/cache';
import { fanOut, mergeTickers, envelope } from '@/lib/aggregate';
import { getGlobal } from '@/lib/external/coingecko';
import { getFearGreed } from '@/lib/external/feargreed';
import { isStable, toCanonical } from '@/lib/symbols';

/** Aggregate ONE symbol across the given adapters. */
export async function getAggregatedTicker(
  symbol: string,
  market: MarketType,
  method: IndexMethod = 'volume',
  adapters: ExchangeAdapter[] = ADAPTERS,
): Promise<Envelope<AggregatedTicker>> {
  const usable = adapters.filter((a) => (market === 'futures' ? a.supports.futures : a.supports.spot));
  const key = `ticker:${market}:${symbol}:${usable.map((a) => a.id).join(',')}`;
  const cachedHit = await cached(key, TTL.ticker, async () => {
    const { results, ok, errors } = await fanOut(usable, (a) => a.getTicker(symbol, market));
    const agg = mergeTickers(symbol, results, usable.map((a) => a.id), method);
    return { agg, ok, errors };
  });
  return envelope(cachedHit.agg, cachedHit.ok, cachedHit.errors, { cached: false });
}

/** Aggregate ALL USDT symbols across adapters into a ranked list. */
export async function getAllAggregated(
  market: MarketType,
  method: IndexMethod = 'volume',
  adapters: ExchangeAdapter[] = ADAPTERS,
): Promise<Envelope<AggregatedTicker[]>> {
  const usable = adapters.filter((a) => (market === 'futures' ? a.supports.futures : a.supports.spot));
  const key = `all:${market}:${usable.map((a) => a.id).join(',')}`;
  const res = await cached(key, TTL.coinList, async () => {
    const { results, ok, errors } = await fanOut(usable, (a) => a.getTickers(market));
    // results is Ticker[][] (one array per adapter that succeeded)
    const bySymbol = new Map<string, Ticker[]>();
    for (const list of results as unknown as Ticker[][]) {
      for (const t of list) {
        if (isStable(t.base)) continue;
        const arr = bySymbol.get(t.symbol);
        if (arr) arr.push(t);
        else bySymbol.set(t.symbol, [t]);
      }
    }
    const merged: AggregatedTicker[] = [];
    const tried = usable.map((a) => a.id);
    for (const [symbol, sources] of bySymbol) {
      merged.push(mergeTickers(symbol, sources, tried, method));
    }
    merged.sort((a, b) => b.volume24h - a.volume24h);
    return { merged, ok, errors };
  });
  return envelope(res.merged, res.ok, res.errors, { cached: false });
}

export interface MarketOverview {
  totalMarketCapUsd: number | null;
  marketCapChange24h: number | null;
  totalVolume24hUsd: number; // summed across exchanges (futures)
  btcDominance: number | null;
  ethDominance: number | null;
  openInterestUsd: number; // summed futures OI
  fearGreed: { value: number; label: string } | null;
  topGainers: AggregatedTicker[];
  topLosers: AggregatedTicker[];
  trending: AggregatedTicker[]; // by volume
  updatedAt: number;
}

export async function getMarketOverview(): Promise<Envelope<MarketOverview>> {
  const key = 'overview';
  const res = await cached(key, TTL.market, async (): Promise<{ data: MarketOverview; ok: ExchangeId[]; errors: { exchange: ExchangeId; message: string }[] }> => {
    const [aggEnv, global, fg] = await Promise.all([
      getAllAggregated('futures'),
      getGlobal(),
      getFearGreed(),
    ]);
    const coins = aggEnv.data;
    const withVol = coins.filter((c) => c.volume24h > 1_000_000);
    const totalVolume = coins.reduce((s, c) => s + c.volume24h, 0);
    const oi = coins.reduce((s, c) => s + (c.openInterest || 0), 0);
    const byChange = [...withVol].sort((a, b) => b.priceChange24h - a.priceChange24h);
    const data: MarketOverview = {
      totalMarketCapUsd: global?.totalMarketCapUsd ?? null,
      marketCapChange24h: global?.marketCapChange24h ?? null,
      totalVolume24hUsd: totalVolume,
      btcDominance: global?.btcDominance ?? null,
      ethDominance: global?.ethDominance ?? null,
      openInterestUsd: oi,
      fearGreed: fg ? { value: fg.value, label: fg.label } : null,
      topGainers: byChange.slice(0, 8),
      topLosers: byChange.slice(-8).reverse(),
      trending: [...withVol].sort((a, b) => b.volume24h - a.volume24h).slice(0, 8),
      updatedAt: Date.now(),
    };
    return { data, ok: aggEnv.meta.sources, errors: aggEnv.meta.errors };
  });
  return envelope(res.data, res.ok, res.errors);
}

/** Ticker-bar snapshot for a curated set of bases. */
export async function getTickerBar(bases: string[], market: MarketType = 'futures'): Promise<Envelope<AggregatedTicker[]>> {
  const env = await getAllAggregated(market);
  const wanted = new Set(bases.map((b) => toCanonical(b)));
  const data = env.data.filter((c) => wanted.has(c.symbol));
  // preserve requested order
  data.sort((a, b) => bases.indexOf(a.base) - bases.indexOf(b.base));
  return envelope(data, env.meta.sources, env.meta.errors);
}
