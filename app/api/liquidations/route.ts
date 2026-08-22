import { NextResponse } from 'next/server';
import { getAllAggregated } from '@/lib/services/market';
import { coinglassConfigured, getLiquidationHistory, DEFAULT_EXCHANGE } from '@/lib/coinglass';
import { envelope } from '@/lib/aggregate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Liquidation overview.
 *
 * Honest limitation: real 24h/12h/4h/1h liquidation TOTALS are not available
 * from exchange REST APIs (they come from liquidation WebSocket streams or a
 * data provider like CoinGlass). Without CoinGlass we therefore report each
 * coin's OPEN-INTEREST exposure (a proxy for liquidation risk), clearly flagged,
 * and leave time-bucketed totals null rather than inventing numbers.
 */
export async function GET() {
  const env = await getAllAggregated('futures');
  const byOi = [...env.data]
    .filter((c) => (c.openInterest || 0) > 0)
    .sort((a, b) => (b.openInterest || 0) - (a.openInterest || 0))
    .slice(0, 20)
    .map((c) => ({
      symbol: c.symbol,
      base: c.base,
      price: c.vdearIndex,
      openInterestUsd: c.openInterest || 0,
      change24h: c.priceChange24h,
    }));

  let history: unknown = null;
  if (coinglassConfigured()) {
    const cg = await getLiquidationHistory('BTCUSDT', DEFAULT_EXCHANGE, '24h');
    if (cg.configured && cg.available) history = cg.data;
  }

  return NextResponse.json(envelope(
    {
      source: coinglassConfigured() && history ? 'coinglass' : 'estimated',
      totals: history ? undefined : { h1: null, h4: null, h12: null, h24: null },
      history,
      byOpenInterest: byOi,
      note: coinglassConfigured() && history
        ? 'Live CoinGlass liquidation history.'
        : 'Real liquidation totals need CoinGlass or a liquidation WebSocket feed. Showing open-interest exposure as a risk proxy (estimated).',
    },
    env.meta.sources, env.meta.errors,
  ));
}
