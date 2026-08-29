import { rateLimitResponse } from '@/lib/api/guard';
import { NextResponse, type NextRequest } from 'next/server';
import { getFearGreed } from '@/lib/providers/feargreed';
import { cached, TTL } from '@/lib/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const limited = rateLimitResponse(req);
  if (limited) return limited;

  const data = await cached('feargreed', TTL.historical, () => getFearGreed());
  return NextResponse.json({
    data,
    meta: { kind: data ? 'live' : 'unavailable', sources: data ? ['alternative.me'] : [], generatedAt: Date.now() },
  });
}
