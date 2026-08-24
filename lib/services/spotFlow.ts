/**
 * Spot Flow service — fetch, then compute.
 *
 * Splits venues by whether they publish a taker-buy split (see
 * lib/engines/spotFlow.ts for why that matters), fetches flow candles from the
 * ones that do, and records the rest as EXCLUDED rather than imputing them.
 */
import type { Candle, ExchangeId, FlowCandle, MarketType } from '@/lib/types';
import { ADAPTERS } from '@/lib/exchanges/registry';
import { cached, TTL } from '@/lib/cache';
import { envelope } from '@/lib/aggregate';
import type { Envelope } from '@/lib/types';
import {
  computeSpotFlow, computeTradeFlow, type FlowTimeframe, type SpotFlow, type TradeFlow,
} from '@/lib/engines/spotFlow';

/** How many candles to pull per timeframe: enough for a 30-bar z-score baseline. */
const CANDLE_LIMIT: Record<FlowTimeframe, number> = {
  '5m': 300, '15m': 300, '1h': 300, '4h': 200, '1d': 200,
};

export async function getSpotFlow(
  symbol: string,
  timeframe: FlowTimeframe = '1h',
  market: MarketType = 'spot',
): Promise<Envelope<SpotFlow>> {
  const key = `spotflow:${market}:${symbol}:${timeframe}`;
  const res = await cached(key, TTL.klines, async () => {
    const capable = ADAPTERS.filter((a) => a.supports.takerVolume && a.supports[market === 'spot' ? 'spot' : 'futures']);
    const excluded: ExchangeId[] = ADAPTERS
      .filter((a) => !a.supports.takerVolume)
      .map((a) => a.id);

    const errors: { exchange: ExchangeId; message: string }[] = [];
    const perExchange: { exchange: ExchangeId; candles: FlowCandle[] }[] = [];
    let mfiSource: ExchangeId | null = null;

    await Promise.all(capable.map(async (a) => {
      try {
        const candles = await a.getFlowCandles(symbol, timeframe, market, CANDLE_LIMIT[timeframe]);
        if (candles.length > 0) perExchange.push({ exchange: a.id, candles });
        else errors.push({ exchange: a.id, message: 'no candles' });
      } catch (e) {
        errors.push({ exchange: a.id, message: e instanceof Error ? e.message.slice(0, 120) : 'error' });
      }
    }));

    /*
     * OHLCV for the MFI fallback.
     *
     * Only fetched when no venue gave us a taker split, because CVD is the
     * better instrument and there is no reason to pay for a second round trip
     * when we already have it. Any venue will do here — MFI needs nothing a
     * plain kline does not carry — so the first one to answer wins.
     */
    let ohlcv: Candle[] = [];
    if (perExchange.length === 0) {
      for (const a of ADAPTERS) {
        if (!a.supports[market === 'spot' ? 'spot' : 'futures']) continue;
        try {
          const candles = await a.getKlines(symbol, timeframe, market, CANDLE_LIMIT[timeframe]);
          if (candles.length > 0) { ohlcv = candles; mfiSource = a.id; break; }
        } catch {
          // Already recorded above for capable venues; a fallback miss is not
          // a new error to report, just one less place to look.
        }
      }
    }

    const flow = computeSpotFlow({ symbol, timeframe, perExchange, excluded, ohlcv });
    const ok = perExchange.length > 0
      ? perExchange.map((p) => p.exchange)
      : mfiSource ? [mfiSource] : [];
    return { flow, ok, errors };
  });

  return envelope(res.flow, res.ok, res.errors, {
    kind: res.ok.length > 0 ? 'live' : 'unavailable',
  });
}

/** All spec timeframes at once, for the coin page. */
export async function getSpotFlowAll(
  symbol: string, market: MarketType = 'spot',
): Promise<Envelope<Record<FlowTimeframe, SpotFlow>>> {
  const timeframes: FlowTimeframe[] = ['5m', '15m', '1h', '4h', '1d'];
  const results = await Promise.all(timeframes.map((tf) => getSpotFlow(symbol, tf, market)));

  const data = {} as Record<FlowTimeframe, SpotFlow>;
  const ok = new Set<ExchangeId>();
  const errors: { exchange: ExchangeId; message: string }[] = [];
  results.forEach((r, i) => {
    data[timeframes[i]!] = r.data;
    r.meta.sources.forEach((s) => ok.add(s));
    errors.push(...r.meta.errors);
  });

  return envelope(data, Array.from(ok), errors);
}

/**
 * Short-horizon flow from recent fills across every venue.
 *
 * This covers MINUTES, not days — computeTradeFlow returns windowMs and the UI
 * must show it, so it can never be mistaken for the candle-derived CVD above.
 */
export async function getTradeFlow(
  symbol: string, market: MarketType = 'spot', limit = 500,
): Promise<Envelope<TradeFlow>> {
  const key = `tradeflow:${market}:${symbol}:${limit}`;
  const res = await cached(key, TTL.ticker, async () => {
    const usable = ADAPTERS.filter((a) => a.supports.trades);
    const errors: { exchange: ExchangeId; message: string }[] = [];
    const all = await Promise.all(usable.map(async (a) => {
      try {
        return await a.getTrades(symbol, market, limit);
      } catch (e) {
        errors.push({ exchange: a.id, message: e instanceof Error ? e.message.slice(0, 120) : 'error' });
        return [];
      }
    }));
    const flow = computeTradeFlow(all.flat());
    return { flow, ok: flow.sources, errors };
  });
  return envelope(res.flow, res.ok, res.errors);
}
