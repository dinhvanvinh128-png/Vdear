import { NextRequest, NextResponse } from 'next/server';
import { getAllAggregated } from '@/lib/services/market';
import { parseIndexMethod } from '@/lib/aggregate';
import { resolveAdapters } from '@/lib/exchanges/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const adapters = resolveAdapters(sp.get('exchange'));
  const method = parseIndexMethod(sp.get('index'));
  const limit = Math.min(1000, Math.max(1, parseInt(sp.get('limit') || '200', 10)));
  const env = await getAllAggregated('futures', method, adapters);
  // Futures view is enriched with funding + OI (already merged in aggregate).
  const totals = {
    openInterestUsd: env.data.reduce((s, c) => s + (c.openInterest || 0), 0),
    volume24hUsd: env.data.reduce((s, c) => s + c.volume24h, 0),
  };
  return NextResponse.json({ ...env, data: env.data.slice(0, limit), totals });
}
