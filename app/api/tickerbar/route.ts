import { NextResponse } from 'next/server';
import { getTickerBar } from '@/lib/services/market';
import { TICKER_BASES } from '@/lib/symbols';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const env = await getTickerBar(TICKER_BASES, 'futures');
  return NextResponse.json(env);
}
