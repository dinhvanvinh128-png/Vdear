/** Order book depth bands, spread and the composite liquidity score. */
import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getLiquidity } from '@/lib/services/liquidity';
import { getMacroLiquidity } from '@/lib/services/liquidityMacro';
import { canonicalSymbol, checkRateLimit, handle, marketSchema, parseQuery } from '@/lib/api/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { symbol: string } }) {
  return handle(async () => {
    checkRateLimit(req);
    const { market } = parseQuery(req, z.object({ market: marketSchema }));
    const macro = await getMacroLiquidity();
    return getLiquidity(
      canonicalSymbol(params.symbol), market,
      macro.data.stablecoin?.score ?? null,
      macro.data.defi.inputs.length ? macro.data.defi.score : null,
    );
  });
}
