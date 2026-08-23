/**
 * Whale service — joins the two honest tiers described in lib/engines/whale.ts:
 * real large CEX fills (free) and exchange flow (key-gated).
 */
import type { Envelope, ExchangeId, MarketType, Trade } from '@/lib/types';
import { ADAPTERS } from '@/lib/exchanges/registry';
import { cached, TTL } from '@/lib/cache';
import { envelope } from '@/lib/aggregate';
import { computeWhaleActivity, WHALE_TIERS, type WhaleActivity } from '@/lib/engines/whale';
import { getExchangeFlow } from '@/lib/services/onchain';
import { splitSymbol } from '@/lib/symbols';

export async function getWhaleActivity(
  symbol: string, market: MarketType = 'spot', minUsd: number = WHALE_TIERS[0],
): Promise<Envelope<WhaleActivity>> {
  const key = `whale:${market}:${symbol}:${minUsd}`;
  const res = await cached(key, TTL.ticker, async () => {
    const usable = ADAPTERS.filter((a) => a.supports.trades);
    const errors: { exchange: ExchangeId; message: string }[] = [];

    const perExchange = await Promise.all(usable.map(async (a) => {
      try {
        return await a.getTrades(symbol, market, 500);
      } catch (e) {
        errors.push({ exchange: a.id, message: e instanceof Error ? e.message.slice(0, 120) : 'error' });
        return [] as Trade[];
      }
    }));
    const trades = perExchange.flat();

    const { base } = splitSymbol(symbol);
    const flow = await getExchangeFlow(base || symbol);

    const activity = computeWhaleActivity({
      symbol: base || symbol,
      trades,
      netflow: flow.netflow,
      reserve: flow.reserve,
      flowUnavailableReason: flow.reason ?? undefined,
    });

    const ok = Array.from(new Set(trades.map((t) => t.exchange)));
    return { activity, ok, errors };
  });

  return envelope(res.activity, res.ok, res.errors);
}
