/** Sector rotation across the spec's ten buckets. */
import type { NextRequest } from 'next/server';
import { getSectorRotation } from '@/lib/services/sectors';
import { checkRateLimit, handle } from '@/lib/api/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handle(async () => {
    checkRateLimit(req);
    return getSectorRotation();
  });
}
