import { NextRequest, NextResponse } from 'next/server';
import { getAllAggregated } from '@/lib/services/market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Market heatmap = aggregated coins sized by volume, colored by 24h change. */
export async function GET(req: NextRequest) {
  const limit = Math.min(200, Math.max(10, parseInt(req.nextUrl.searchParams.get('limit') || '80', 10)));
  const env = await getAllAggregated('futures');
  const data = env.data.slice(0, limit).map((c) => ({
    symbol: c.symbol, base: c.base, price: c.vdearIndex,
    change24h: c.priceChange24h, volume24h: c.volume24h,
  }));
  return NextResponse.json({ ...env, data });
}
