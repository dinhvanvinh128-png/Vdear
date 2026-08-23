import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getAllAggregated } from '@/lib/services/market';
import { checkRateLimit, handle, limitSchema, parseQuery } from '@/lib/api/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Market heatmap = aggregated coins sized by volume, coloured by 24h change. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    checkRateLimit(req);
    const { limit } = parseQuery(req, z.object({ limit: limitSchema(200, 80) }));

    const env = await getAllAggregated('futures');
    return {
      ...env,
      data: env.data.slice(0, limit).map((c) => ({
        symbol: c.symbol, base: c.base, price: c.vdearIndex,
        change24h: c.priceChange24h, volume24h: c.volume24h,
      })),
    };
  });
}
