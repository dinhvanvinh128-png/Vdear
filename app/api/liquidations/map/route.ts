import { NextRequest, NextResponse } from 'next/server';
import { getLiquidationMapData } from '@/lib/services/derivatives';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const coin = (req.nextUrl.searchParams.get('coin') || 'BTC').toUpperCase().replace('USDT', '');
  const env = await getLiquidationMapData(coin);
  return NextResponse.json(env);
}
