import { NextRequest, NextResponse } from 'next/server';
import { getLongShortAll } from '@/lib/services/derivatives';
import { toCanonical, splitSymbol } from '@/lib/symbols';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { symbol: string } }) {
  const raw = params.symbol.toUpperCase();
  const symbol = splitSymbol(raw).quote ? raw : toCanonical(raw);
  const interval = req.nextUrl.searchParams.get('period') || '5m';
  const env = await getLongShortAll(symbol, interval);
  return NextResponse.json(env);
}
