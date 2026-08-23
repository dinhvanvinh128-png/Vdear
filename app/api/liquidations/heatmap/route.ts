import { NextRequest, NextResponse } from 'next/server';
import { getAggregatedTicker } from '@/lib/services/market';
import { getOpenInterestAll } from '@/lib/services/derivatives';
import { coinglassConfigured, getLiquidationHeatmap, DEFAULT_EXCHANGE } from '@/lib/providers/coinglass';
import { estimateHeatmapColumn } from '@/lib/liquidations';
import { cached, TTL } from '@/lib/cache';
import { envelope } from '@/lib/aggregate';
import { toCanonical } from '@/lib/symbols';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RANGES = new Set(['12h', '24h', '3d', '7d', '30d', '90d', '180d', '1y']);

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const coin = (sp.get('coin') || 'BTC').toUpperCase().replace('USDT', '');
  const range = RANGES.has(sp.get('range') || '') ? (sp.get('range') as string) : '24h';
  const symbol = toCanonical(coin);
  const key = `liqheat:${symbol}:${range}`;

  const res = await cached(key, TTL.liquidation, async () => {
    const [tickerEnv, oiEnv] = await Promise.all([
      getAggregatedTicker(symbol, 'futures'),
      getOpenInterestAll(symbol),
    ]);
    const price = tickerEnv.data.vdearIndex || tickerEnv.data.avgPrice;
    const oi = oiEnv.data.totalUsd;
    const sources = Array.from(new Set([...tickerEnv.meta.sources, ...oiEnv.meta.sources]));
    const errors = [...tickerEnv.meta.errors, ...oiEnv.meta.errors];

    if (coinglassConfigured()) {
      const cg = await getLiquidationHeatmap(symbol, DEFAULT_EXCHANGE, range);
      if (cg.configured && cg.available) {
        return {
          data: { source: 'coinglass' as const, currentPrice: price, heatmap: cg.data,
            note: `Live CoinGlass liquidation heatmap (${DEFAULT_EXCHANGE}, ${range}).` },
          sources, errors,
        };
      }
      const reason = 'message' in cg ? cg.message : 'unavailable';
      return {
        data: {
          source: 'estimated' as const, currentPrice: price, column: estimateHeatmapColumn(price, oi),
          note: `CoinGlass configured but heatmap unavailable (${reason}). The pair Heatmap endpoint needs a Professional/Enterprise plan. Showing exchange-derived ESTIMATE (current snapshot).`,
        },
        sources, errors,
      };
    }
    return {
      data: {
        source: 'estimated' as const, currentPrice: price, column: estimateHeatmapColumn(price, oi),
        note: 'CoinGlass not configured — exchange-derived ESTIMATE (current snapshot, not time-series). Set COINGLASS_API_KEY (Professional+ plan) for the real heatmap.',
      },
      sources, errors,
    };
  });

  return NextResponse.json(envelope(res.data, res.sources, res.errors));
}
