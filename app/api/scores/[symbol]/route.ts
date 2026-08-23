/** Full intelligence payload for one asset — scores, regime, signal, analyst. */
import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getIntelligence } from '@/lib/services/intelligence';
import { canonicalSymbol, checkRateLimit, handle, marketSchema, parseQuery } from '@/lib/api/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { symbol: string } }) {
  return handle(async () => {
    checkRateLimit(req);
    const { market } = parseQuery(req, z.object({ market: marketSchema }));
    return getIntelligence(canonicalSymbol(params.symbol), market);
  });
}
