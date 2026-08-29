import { NextRequest, NextResponse } from 'next/server';
import { getAggregatedTicker } from '@/lib/services/market';
import { parseMarket, parseIndexMethod } from '@/lib/aggregate';
import { resolveAdapters } from '@/lib/exchanges/registry';
import { toCanonical, splitSymbol } from '@/lib/symbols';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Accepts either a base ("BTC") or a full symbol ("BTCUSDT"). */
function normalize(raw: string): string {
  const s = raw.toUpperCase();
  return splitSymbol(s).quote ? s : toCanonical(s);
}

export async function GET(req: NextRequest, { params }: { params: { symbol: string } }) {
  const sp = req.nextUrl.searchParams;
  const symbol = normalize(params.symbol);
  const market = parseMarket(sp.get('market'));
  const method = parseIndexMethod(sp.get('index'));
  const adapters = resolveAdapters(sp.get('exchange'));
  const env = await getAggregatedTicker(symbol, market, method, adapters);
  return NextResponse.json(env);
}
