import { NextRequest, NextResponse } from 'next/server';
import { parseMarket, fanOut, envelope } from '@/lib/aggregate';
import { resolveAdapters } from '@/lib/exchanges/registry';
import { toCanonical, splitSymbol } from '@/lib/symbols';
import type { Trade } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { symbol: string } }) {
  const sp = req.nextUrl.searchParams;
  const raw = params.symbol.toUpperCase();
  const symbol = splitSymbol(raw).quote ? raw : toCanonical(raw);
  const market = parseMarket(sp.get('market'));
  const limit = Math.min(200, Math.max(5, parseInt(sp.get('limit') || '50', 10)));
  const minUsd = parseFloat(sp.get('minUsd') || '0');
  const adapters = resolveAdapters(sp.get('exchange')).filter((a) => a.supports.trades);
  const { results, ok, errors } = await fanOut(adapters, (a) => a.getTrades(symbol, market, limit));
  let trades = (results as unknown as Trade[][]).flat();
  if (minUsd > 0) trades = trades.filter((t) => t.price * t.size >= minUsd);
  trades.sort((a, b) => b.timestamp - a.timestamp);
  return NextResponse.json(envelope({ trades: trades.slice(0, limit * adapters.length) }, ok, errors));
}
