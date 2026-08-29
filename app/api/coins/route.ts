import { rateLimitResponse } from '@/lib/api/guard';
import { NextRequest, NextResponse } from 'next/server';
import { getAllAggregated } from '@/lib/services/market';
import { parseMarket, parseIndexMethod } from '@/lib/aggregate';
import { resolveAdapters } from '@/lib/exchanges/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const limited = rateLimitResponse(req);
  if (limited) return limited;

  const sp = req.nextUrl.searchParams;
  const market = parseMarket(sp.get('market'));
  const method = parseIndexMethod(sp.get('index'));
  const adapters = resolveAdapters(sp.get('exchange'));
  const limit = Math.min(1000, Math.max(1, parseInt(sp.get('limit') || '200', 10)));
  const env = await getAllAggregated(market, method, adapters);
  return NextResponse.json({ ...env, data: env.data.slice(0, limit) });
}
