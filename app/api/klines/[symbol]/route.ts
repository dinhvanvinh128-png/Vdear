import { rateLimitResponse } from '@/lib/api/guard';
import { NextRequest, NextResponse } from 'next/server';
import { getKlines } from '@/lib/services/chart';
import { parseMarket } from '@/lib/aggregate';
import { toCanonical, splitSymbol } from '@/lib/symbols';
import type { ExchangeId } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_TF = new Set(['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']);

export async function GET(req: NextRequest, { params }: { params: { symbol: string } }) {
  const limited = rateLimitResponse(req);
  if (limited) return limited;

  const sp = req.nextUrl.searchParams;
  const raw = params.symbol.toUpperCase();
  const symbol = splitSymbol(raw).quote ? raw : toCanonical(raw);
  const interval = sp.get('tf') || '4h';
  const tf = VALID_TF.has(interval) ? interval : '4h';
  const market = parseMarket(sp.get('market'));
  const limit = Math.min(1000, Math.max(10, parseInt(sp.get('limit') || '300', 10)));
  const preferred = (sp.get('exchange') as ExchangeId) || undefined;
  const env = await getKlines(symbol, tf, market, limit, preferred);
  return NextResponse.json(env);
}
