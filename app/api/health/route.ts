import { NextResponse } from 'next/server';
import { getHealth } from '@/lib/services/health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const report = await getHealth();
  return NextResponse.json(report);
}
