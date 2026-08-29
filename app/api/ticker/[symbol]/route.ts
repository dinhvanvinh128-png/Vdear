import { rateLimitResponse } from '@/lib/api/guard';
import { NextRequest, NextResponse } from 'next/server';
import { getAggregatedTicker } from '@/lib/services/market';
import { parseMarket, parseIndexMethod } from '@/lib/aggregate';
import { toCanonical, splitSymbol } from '@/lib/symbols';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { symbol: string } }) {
  const limited = rateLimitResponse(req);
  if (limited) return limited;

  const sp = req.nextUrl.searchParams;
  const raw = params.symbol.toUpperCase();
  const symbol = splitSymbol(raw).quote ? raw : toCanonical(raw);
  const env = await getAggregatedTicker(symbol, parseMarket(sp.get('market')), parseIndexMethod(sp.get('index')));
  return NextResponse.json(env);
}
