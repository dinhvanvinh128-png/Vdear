/** Market breadth across the whole USDT universe. */
import type { NextRequest } from 'next/server';
import { getMarketBreadth } from '@/lib/services/breadth';
import { checkRateLimit, handle } from '@/lib/api/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handle(async () => {
    checkRateLimit(req);
    return getMarketBreadth();
  });
}
