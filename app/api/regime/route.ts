/** Market regime for one asset (defaults to BTC as the market proxy). */
import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getIntelligence } from '@/lib/services/intelligence';
import { canonicalSymbol, checkRateLimit, handle, parseQuery } from '@/lib/api/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handle(async () => {
    checkRateLimit(req);
    const { symbol } = parseQuery(req, z.object({ symbol: z.string().default('BTC') }));
    const env = await getIntelligence(canonicalSymbol(symbol));
    return {
      ...env,
      data: {
        symbol: env.data.symbol,
        regime: env.data.regime,
        accDist: env.data.accDist,
        moneyFlowScore: env.data.moneyFlow.score,
        coverage: env.data.moneyFlow.coverage,
        confidence: env.data.quality.confidence,
      },
    };
  });
}
