import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getLiquidationMapData } from '@/lib/services/derivatives';
import { checkRateLimit, handle, parseQuery, symbolSchema } from '@/lib/api/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handle(async () => {
    checkRateLimit(req);
    // `coin` is interpolated into upstream request URLs, so it is validated
    // against the strict symbol pattern before it goes anywhere.
    const { coin } = parseQuery(req, z.object({ coin: symbolSchema.default('BTC') }));
    return getLiquidationMapData(coin.replace('USDT', ''));
  });
}
