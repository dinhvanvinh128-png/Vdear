/** Signal state and confidence, with every rule that fired. */
import type { NextRequest } from 'next/server';
import { getIntelligence } from '@/lib/services/intelligence';
import { canonicalSymbol, checkRateLimit, handle } from '@/lib/api/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { symbol: string } }) {
  return handle(async () => {
    checkRateLimit(req);
    const env = await getIntelligence(canonicalSymbol(params.symbol));
    return {
      ...env,
      data: {
        symbol: env.data.symbol,
        signal: env.data.signal,
        regime: env.data.regime.regime,
        moneyFlowScore: env.data.moneyFlow.score,
        coverage: env.data.moneyFlow.coverage,
      },
    };
  });
}
