/** TVL, DEX volume and pool activity. */
import type { NextRequest } from 'next/server';
import { getMacroLiquidity } from '@/lib/services/liquidityMacro';
import { checkRateLimit, handle } from '@/lib/api/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handle(async () => {
    checkRateLimit(req);
    const env = await getMacroLiquidity();
    return { ...env, data: { defi: env.data.defi, unavailable: env.data.unavailable } };
  });
}
