import { NextRequest, NextResponse } from 'next/server';
import { getFunding } from '@/lib/services/derivatives';
import { toCanonical, splitSymbol } from '@/lib/symbols';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get('symbol') || 'BTC').toUpperCase();
  const symbol = splitSymbol(raw).quote ? raw : toCanonical(raw);
  const env = await getFunding(symbol);
  return NextResponse.json(env);
}
