import { NextResponse } from 'next/server';
import { getFearGreed } from '@/lib/external/feargreed';
import { cached, TTL } from '@/lib/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await cached('feargreed', TTL.historical, () => getFearGreed());
  return NextResponse.json({
    data,
    meta: { kind: data ? 'live' : 'unavailable', sources: data ? ['alternative.me'] : [], generatedAt: Date.now() },
  });
}
