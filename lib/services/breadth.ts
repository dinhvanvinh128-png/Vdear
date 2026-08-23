/**
 * Market Breadth service.
 *
 * Breadth needs daily closes for the WHOLE universe, which is far too many
 * requests to make per page view. Instead it uses one venue's full ticker list
 * for the advance/decline half (a single call) and pulls daily candles for the
 * TOP N by volume for the EMA ratios — reporting the sample size, so the ratios
 * are honest about what they cover.
 */
import type { ExchangeId, Envelope } from '@/lib/types';
import { ADAPTERS } from '@/lib/exchanges/registry';
import { cached, TTL } from '@/lib/cache';
import { envelope } from '@/lib/aggregate';
import { isStable } from '@/lib/symbols';
import { computeBreadth, type BreadthInput, type MarketBreadth } from '@/lib/engines/breadth';

/**
 * How many assets get daily-candle coverage for the EMA ratios.
 *
 * 60 covers the assets that carry the overwhelming majority of volume while
 * keeping the fan-out inside the rate limiter. The advance/decline and volume
 * ratios still cover the FULL universe, because those come from the ticker list.
 */
export const EMA_SAMPLE_SIZE = 60;

export async function getMarketBreadth(): Promise<Envelope<MarketBreadth>> {
  const res = await cached('breadth', TTL.coinList, async () => {
    const errors: { exchange: ExchangeId; message: string }[] = [];
    const ok: ExchangeId[] = [];

    // 1. Full universe from whichever venue answers first — one call.
    let tickers: Awaited<ReturnType<(typeof ADAPTERS)[number]['getTickers']>> = [];
    for (const a of ADAPTERS) {
      if (!a.supports.spot) continue;
      try {
        const rows = await a.getTickers('spot');
        if (rows.length > 0) { tickers = rows; ok.push(a.id); break; }
      } catch (e) {
        errors.push({ exchange: a.id, message: e instanceof Error ? e.message.slice(0, 120) : 'error' });
      }
    }
    if (tickers.length === 0) {
      return { breadth: computeBreadth([]), ok, errors };
    }

    const universe = tickers
      .filter((t) => !isStable(t.base) && t.quote === 'USDT' && t.volume24h > 0)
      .sort((a, b) => b.volume24h - a.volume24h);

    // 2. Daily candles for the top slice, for the EMA ratios.
    const sample = universe.slice(0, EMA_SAMPLE_SIZE);
    const klineAdapter = ADAPTERS.find((a) => a.supports.klines && a.supports.spot);
    const closesBySymbol = new Map<string, number[]>();

    if (klineAdapter) {
      await Promise.all(sample.map(async (t) => {
        try {
          const candles = await klineAdapter.getKlines(t.symbol, '1d', 'spot', 250);
          if (candles.length > 0) closesBySymbol.set(t.symbol, candles.map((c) => c.close));
        } catch {
          // One symbol failing just means it is excluded from the EMA ratios,
          // and the reported sample size reflects that.
        }
      }));
    }

    const inputs: BreadthInput[] = universe.map((t) => {
      const closes = closesBySymbol.get(t.symbol) ?? [t.price];
      const window = closes.slice(-30);
      return {
        base: t.base,
        closes,
        priceChange24h: t.priceChange24h,
        volume24h: t.volume24h,
        periodHigh: window.length > 1 ? Math.max(...window) : undefined,
        periodLow: window.length > 1 ? Math.min(...window) : undefined,
      };
    });

    return { breadth: computeBreadth(inputs), ok, errors };
  });

  return envelope(res.breadth, res.ok, res.errors);
}
