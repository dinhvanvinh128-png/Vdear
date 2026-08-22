/**
 * Chart / klines service — returns candles from the first exchange that answers,
 * so a single venue being down never blanks the chart.
 */
import type { Candle, Envelope, ExchangeId, MarketType } from '@/lib/types';
import { ADAPTERS } from '@/lib/exchanges/registry';
import { cached, TTL } from '@/lib/cache';
import { envelope } from '@/lib/aggregate';

const ORDER: ExchangeId[] = ['binance', 'okx', 'bybit', 'bitget'];

export async function getKlines(
  symbol: string,
  interval: string,
  market: MarketType,
  limit = 300,
  preferred?: ExchangeId,
): Promise<Envelope<Candle[]>> {
  const order = preferred ? [preferred, ...ORDER.filter((x) => x !== preferred)] : ORDER;
  const key = `klines:${market}:${symbol}:${interval}:${limit}:${order[0]}`;
  const res = await cached(key, TTL.klines, async () => {
    const errors: { exchange: ExchangeId; message: string }[] = [];
    for (const id of order) {
      const a = ADAPTERS.find((x) => x.id === id);
      if (!a || !a.supports.klines) continue;
      try {
        const candles = await a.getKlines(symbol, interval, market, limit);
        if (candles.length > 0) return { candles, used: id as ExchangeId, errors };
      } catch (e) {
        errors.push({ exchange: id, message: e instanceof Error ? e.message.slice(0, 120) : 'error' });
      }
    }
    return { candles: [] as Candle[], used: null, errors };
  });
  return envelope(res.candles, res.used ? [res.used] : [], res.errors);
}
