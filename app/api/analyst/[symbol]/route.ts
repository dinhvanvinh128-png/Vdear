/**
 * The analyst's WHY / RISKS narrative for one asset.
 *
 * Consumes computed scores only — see lib/analyst for why it cannot introduce
 * a figure the scoring layer did not produce.
 */
import type { NextRequest } from 'next/server';
import { getIntelligence } from '@/lib/services/intelligence';
import { canonicalSymbol, checkRateLimit, handle } from '@/lib/api/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { symbol: string } }) {
  return handle(async () => {
    checkRateLimit(req);
    const env = await getIntelligence(canonicalSymbol(params.symbol));
    return { ...env, data: env.data.analyst };
  });
}
