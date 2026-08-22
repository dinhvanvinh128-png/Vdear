/**
 * Derivatives service — funding, open interest, long/short, liquidations.
 * All multi-exchange, fail-soft, cached. Liquidations use CoinGlass when
 * configured, otherwise the transparent exchange-derived estimator.
 */
import type {
  Envelope, ExchangeId, FundingRate, LongShortRatio, OpenInterest,
} from '@/lib/types';
import { ADAPTERS } from '@/lib/exchanges/registry';
import { cached, TTL } from '@/lib/cache';
import { fanOut, envelope } from '@/lib/aggregate';
import { getAggregatedTicker } from '@/lib/services/market';
import { coinglassConfigured, getLiquidationMap } from '@/lib/coinglass';
import { estimateMap, type LiquidationMapData } from '@/lib/liquidations';

export async function getFunding(symbol: string): Promise<Envelope<{ perExchange: FundingRate[]; average: number | null }>> {
  const usable = ADAPTERS.filter((a) => a.supports.funding);
  const key = `funding:${symbol}`;
  const res = await cached(key, TTL.funding, async () => {
    const { results, ok, errors } = await fanOut(usable, (a) => a.getFundingRate(symbol));
    const perExchange = results as unknown as FundingRate[];
    const average = perExchange.length
      ? perExchange.reduce((s, f) => s + f.rate, 0) / perExchange.length
      : null;
    return { data: { perExchange, average }, ok, errors };
  });
  return envelope(res.data, res.ok, res.errors);
}

export async function getOpenInterestAll(symbol: string): Promise<Envelope<{ perExchange: OpenInterest[]; totalUsd: number }>> {
  const usable = ADAPTERS.filter((a) => a.supports.openInterest);
  const key = `oi:${symbol}`;
  const res = await cached(key, TTL.openInterest, async () => {
    const { results, ok, errors } = await fanOut(usable, (a) => a.getOpenInterest(symbol));
    const perExchange = results as unknown as OpenInterest[];
    const totalUsd = perExchange.reduce((s, o) => s + (o.valueUsd || 0), 0);
    return { data: { perExchange, totalUsd }, ok, errors };
  });
  return envelope(res.data, res.ok, res.errors);
}

export async function getLongShortAll(symbol: string, interval = '5m'): Promise<Envelope<{ perExchange: LongShortRatio[]; avgLong: number | null }>> {
  const usable = ADAPTERS.filter((a) => a.supports.longShort);
  const key = `ls:${symbol}:${interval}`;
  const res = await cached(key, TTL.funding, async () => {
    const { results, ok, errors } = await fanOut(usable, (a) => a.getLongShort(symbol, interval));
    const perExchange = results as unknown as LongShortRatio[];
    const avgLong = perExchange.length
      ? perExchange.reduce((s, r) => s + r.longPct, 0) / perExchange.length
      : null;
    return { data: { perExchange, avgLong }, ok, errors };
  });
  return envelope(res.data, res.ok, res.errors);
}

export interface LiquidationMapResult {
  map: LiquidationMapData;
  source: 'coinglass' | 'estimated';
  note: string;
}

export async function getLiquidationMapData(coin: string): Promise<Envelope<LiquidationMapResult>> {
  const symbol = `${coin.toUpperCase()}USDT`;
  const key = `liqmap:${symbol}`;
  const res = await cached(key, TTL.liquidation, async () => {
    const [tickerEnv, oiEnv] = await Promise.all([
      getAggregatedTicker(symbol, 'futures'),
      getOpenInterestAll(symbol),
    ]);
    const price = tickerEnv.data.vdearIndex || tickerEnv.data.avgPrice;
    const oi = oiEnv.data.totalUsd;
    const ok: ExchangeId[] = Array.from(new Set([...tickerEnv.meta.sources, ...oiEnv.meta.sources]));
    const errors = [...tickerEnv.meta.errors, ...oiEnv.meta.errors];

    // Prefer real CoinGlass data when configured (best-effort mapping).
    if (coinglassConfigured()) {
      const cg = await getLiquidationMap(coin.toUpperCase());
      if (cg.configured && cg.available && Array.isArray(cg.data) && cg.data.length) {
        const longZones = cg.data.filter((z) => z.side === 'long');
        const shortZones = cg.data.filter((z) => z.side === 'short');
        const map: LiquidationMapData = {
          coin: coin.toUpperCase(), currentPrice: price, longZones, shortZones,
          totalOiUsd: oi, estimated: true,
        };
        return {
          data: { map, source: 'coinglass' as const, note: 'Live CoinGlass liquidation levels.' },
          ok, errors,
        };
      }
    }
    const map = estimateMap(coin.toUpperCase(), price, oi);
    return {
      data: {
        map,
        source: 'estimated' as const,
        note: coinglassConfigured()
          ? 'CoinGlass unavailable — showing exchange-derived ESTIMATE from open interest.'
          : 'CoinGlass not configured — showing exchange-derived ESTIMATE from open interest.',
      },
      ok, errors,
    };
  });
  return envelope(res.data, res.ok, res.errors);
}
