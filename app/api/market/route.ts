import { rateLimitResponse } from '@/lib/api/guard';
import { NextResponse, type NextRequest } from 'next/server';
import { getMarketOverview } from '@/lib/services/market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const limited = rateLimitResponse(req);
  if (limited) return limited;

  const env = await getMarketOverview();
  return NextResponse.json(env);
}
