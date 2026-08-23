/** CVD, volume delta, buy/sell pressure, volume anomaly and VWAP for one asset. */
import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getSpotFlow, getSpotFlowAll, getTradeFlow } from '@/lib/services/spotFlow';
import {
  canonicalSymbol, checkRateLimit, handle, marketSchema, parseQuery, timeframeSchema,
} from '@/lib/api/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { symbol: string } }) {
  return handle(async () => {
    checkRateLimit(req);
    const { market, timeframe, all, trades } = parseQuery(req, z.object({
      market: marketSchema,
      timeframe: timeframeSchema,
      all: z.enum(['true', 'false']).default('false'),
      trades: z.enum(['true', 'false']).default('false'),
    }));
    const symbol = canonicalSymbol(params.symbol);

    if (trades === 'true') return getTradeFlow(symbol, market);
    if (all === 'true') return getSpotFlowAll(symbol, market);
    return getSpotFlow(symbol, timeframe, market);
  });
}
