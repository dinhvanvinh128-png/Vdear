import { NextResponse } from 'next/server';
import { getMarketOverview } from '@/lib/services/market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const env = await getMarketOverview();
  return NextResponse.json(env);
}
