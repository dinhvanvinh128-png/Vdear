import { rateLimitResponse } from '@/lib/api/guard';
import { NextRequest, NextResponse } from 'next/server';
import { parseMarket, fanOut, envelope } from '@/lib/aggregate';
import { resolveAdapters } from '@/lib/exchanges/registry';
import { toCanonical, splitSymbol } from '@/lib/symbols';
import type { OrderBook } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { symbol: string } }) {
  const limited = rateLimitResponse(req);
  if (limited) return limited;

  const sp = req.nextUrl.searchParams;
  const raw = params.symbol.toUpperCase();
  const symbol = splitSymbol(raw).quote ? raw : toCanonical(raw);
  const market = parseMarket(sp.get('market'));
  const limit = Math.min(200, Math.max(5, parseInt(sp.get('limit') || '50', 10)));
  const adapters = resolveAdapters(sp.get('exchange')).filter((a) => a.supports.orderBook);
  const { results, ok, errors } = await fanOut(adapters, (a) => a.getOrderBook(symbol, market, limit));
  const books = results as unknown as OrderBook[];
  return NextResponse.json(envelope({ books }, ok, errors));
}
