import { NextRequest, NextResponse } from 'next/server';
import { getAggregatedTicker } from '@/lib/services/market';
import { getOpenInterestAll } from '@/lib/services/derivatives';
import { coinglassConfigured, getLiquidationHeatmap } from '@/lib/coinglass';
import { estimateHeatmapColumn } from '@/lib/liquidations';
import { envelope } from '@/lib/aggregate';
import { toCanonical } from '@/lib/symbols';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const coin = (sp.get('coin') || 'BTC').toUpperCase().replace('USDT', '');
  const range = sp.get('range') || '24h';
  const symbol = toCanonical(coin);

  const [tickerEnv, oiEnv] = await Promise.all([
    getAggregatedTicker(symbol, 'futures'),
    getOpenInterestAll(symbol),
  ]);
  const price = tickerEnv.data.vdearIndex || tickerEnv.data.avgPrice;
  const oi = oiEnv.data.totalUsd;
  const sources = Array.from(new Set([...tickerEnv.meta.sources, ...oiEnv.meta.sources]));
  const errors = [...tickerEnv.meta.errors, ...oiEnv.meta.errors];

  if (coinglassConfigured()) {
    const cg = await getLiquidationHeatmap(coin, range);
    if (cg.configured && cg.available) {
      return NextResponse.json(envelope(
        { source: 'coinglass', currentPrice: price, cells: cg.data, note: 'Live CoinGlass heatmap.' },
        sources, errors,
      ));
    }
  }
  const column = estimateHeatmapColumn(price, oi);
  return NextResponse.json(envelope(
    {
      source: 'estimated',
      currentPrice: price,
      column,
      note: coinglassConfigured()
        ? 'CoinGlass unavailable — exchange-derived ESTIMATE (current snapshot, not time-series).'
        : 'CoinGlass not configured — exchange-derived ESTIMATE (current snapshot, not time-series).',
    },
    sources, errors,
  ));
}
