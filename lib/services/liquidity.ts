/**
 * Liquidity service — order book depth + spread + volume, joined with the
 * stablecoin and DeFi engine scores.
 */
import type { Envelope, ExchangeId, MarketType, OrderBook } from '@/lib/types';
import { ADAPTERS } from '@/lib/exchanges/registry';
import { cached, TTL } from '@/lib/cache';
import { envelope } from '@/lib/aggregate';
import { computeOrderBookMetrics, type OrderBookMetrics } from '@/lib/engines/orderBook';
import { computeLiquidityScore, type LiquidityScore } from '@/lib/scoring/liquidity';
import { getAggregatedTicker } from '@/lib/services/market';

export interface LiquidityResult {
  orderBook: OrderBookMetrics;
  score: LiquidityScore;
}

/** Deep enough that the +/-2% band is populated on a liquid pair. */
const DEPTH_LIMIT = 200;

export async function getOrderBookMetrics(
  symbol: string, market: MarketType = 'spot',
): Promise<Envelope<OrderBookMetrics>> {
  const key = `ob:${market}:${symbol}`;
  const res = await cached(key, TTL.ticker, async () => {
    const usable = ADAPTERS.filter((a) => a.supports.orderBook && a.supports[market === 'spot' ? 'spot' : 'futures']);
    const errors: { exchange: ExchangeId; message: string }[] = [];
    const books: OrderBook[] = [];

    await Promise.all(usable.map(async (a) => {
      try {
        const b = await a.getOrderBook(symbol, market, DEPTH_LIMIT);
        if (b) books.push(b);
        else errors.push({ exchange: a.id, message: 'no book' });
      } catch (e) {
        errors.push({ exchange: a.id, message: e instanceof Error ? e.message.slice(0, 120) : 'error' });
      }
    }));

    return { metrics: computeOrderBookMetrics(symbol, books), ok: books.map((b) => b.exchange), errors };
  });
  return envelope(res.metrics, res.ok, res.errors);
}

export async function getLiquidity(
  symbol: string,
  market: MarketType = 'spot',
  stablecoinScore: number | null = null,
  defiScore: number | null = null,
): Promise<Envelope<LiquidityResult>> {
  const [obEnv, tickerEnv] = await Promise.all([
    getOrderBookMetrics(symbol, market),
    getAggregatedTicker(symbol, market),
  ]);

  const ob = obEnv.data;
  // The +/-1% band is the headline depth figure (lib/engines/orderBook.ts).
  const band = ob.bands.find((b) => b.band === 1);
  const depthUsd = band ? band.bidDepthUsd + band.askDepthUsd : null;

  const score = computeLiquidityScore({
    depthUsd: depthUsd && depthUsd > 0 ? depthUsd : null,
    spreadPct: ob.spreadPct,
    cexVolume24hUsd: tickerEnv.data.volume24h > 0 ? tickerEnv.data.volume24h : null,
    stablecoinScore,
    defiScore,
  });

  const ok = Array.from(new Set([...obEnv.meta.sources, ...tickerEnv.meta.sources]));
  return envelope({ orderBook: ob, score }, ok, [...obEnv.meta.errors, ...tickerEnv.meta.errors]);
}
