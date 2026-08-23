/** Whale activity: real large CEX fills, plus exchange flow when configured. */
import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getWhaleActivity } from '@/lib/services/whale';
import { canonicalSymbol, checkRateLimit, handle, marketSchema, parseQuery } from '@/lib/api/guard';
import { WHALE_TIERS } from '@/lib/engines/whale';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handle(async () => {
    checkRateLimit(req);
    const { symbol, market, minUsd } = parseQuery(req, z.object({
      symbol: z.string().default('BTC'),
      market: marketSchema,
      minUsd: z.coerce.number().min(1000).max(100_000_000).default(WHALE_TIERS[0]),
    }));
    return getWhaleActivity(canonicalSymbol(symbol), market, minUsd);
  });
}
