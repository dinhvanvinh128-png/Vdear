/** On-chain activity, with the provider that answered for each metric. */
import type { NextRequest } from 'next/server';
import { getOnChain } from '@/lib/services/onchain';
import { checkRateLimit, handle, symbolSchema } from '@/lib/api/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { symbol: string } }) {
  return handle(async () => {
    checkRateLimit(req);
    return getOnChain(symbolSchema.parse(params.symbol));
  });
}
