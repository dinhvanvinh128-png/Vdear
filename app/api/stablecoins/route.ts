/** Stablecoin supply, change windows and chain split — the liquidity backbone. */
import type { NextRequest } from 'next/server';
import { getMacroLiquidity } from '@/lib/services/liquidityMacro';
import { checkRateLimit, handle } from '@/lib/api/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handle(async () => {
    checkRateLimit(req);
    const env = await getMacroLiquidity();
    return {
      ...env,
      data: {
        stablecoin: env.data.stablecoin,
        reason: env.data.stablecoinReason,
        unavailable: env.data.unavailable,
      },
    };
  });
}
