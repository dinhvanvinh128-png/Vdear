import { rateLimitResponse } from '@/lib/api/guard';
import { NextResponse, type NextRequest } from 'next/server';
import { getHealth } from '@/lib/services/health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const limited = rateLimitResponse(req);
  if (limited) return limited;

  const report = await getHealth();
  return NextResponse.json(report);
}
