import { rateLimitResponse } from '@/lib/api/guard';
import { NextRequest, NextResponse } from 'next/server';
import { getOpenInterestAll } from '@/lib/services/derivatives';
import { toCanonical, splitSymbol } from '@/lib/symbols';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const limited = rateLimitResponse(req);
  if (limited) return limited;

  const raw = (req.nextUrl.searchParams.get('symbol') || 'BTC').toUpperCase();
  const symbol = splitSymbol(raw).quote ? raw : toCanonical(raw);
  const env = await getOpenInterestAll(symbol);
  return NextResponse.json(env);
}
