import { rateLimitResponse } from '@/lib/api/guard';
import { NextResponse, type NextRequest } from 'next/server';
import { getTickerBar } from '@/lib/services/market';
import { TICKER_BASES } from '@/lib/symbols';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const limited = rateLimitResponse(req);
  if (limited) return limited;

  const env = await getTickerBar(TICKER_BASES, 'futures');
  return NextResponse.json(env);
}
