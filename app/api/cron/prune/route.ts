/**
 * Cron: apply the retention policy (spec: "Không lưu dữ liệu dư thừa vô hạn").
 *
 * Delegates to prune_market_data(), which reads the retention_policy table — so
 * changing retention is a data change, not a deploy.
 */
import type { NextRequest } from 'next/server';
import { pruneMarketData } from '@/lib/db/repositories';
import { dbWritable, dbStatus } from '@/lib/db/client';
import { assertCronAuthorized, handle } from '@/lib/api/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return handle(async () => {
    assertCronAuthorized(req);
    if (!dbWritable()) return { skipped: true, reason: dbStatus().message };
    const { ok, results } = await pruneMarketData();
    return { skipped: false, ok, results, ranAt: Date.now() };
  });
}
