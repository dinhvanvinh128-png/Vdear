/**
 * Cron: record CVD series and a health snapshot.
 *
 * Ingest exists so charts can show history the live path cannot — a request
 * cannot reconstruct what CVD looked like an hour ago.
 */
import type { NextRequest } from 'next/server';
import { getSpotFlow } from '@/lib/services/spotFlow';
import { getHealth } from '@/lib/services/health';
import { saveCvd, saveHealth, type CvdRow } from '@/lib/db/repositories';
import { dbWritable, dbStatus } from '@/lib/db/client';
import { assertCronAuthorized, handle } from '@/lib/api/guard';
import { TICKER_BASES, toCanonical } from '@/lib/symbols';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TIMEFRAMES = ['1h', '4h', '1d'] as const;

export async function GET(req: NextRequest) {
  return handle(async () => {
    assertCronAuthorized(req);
    if (!dbWritable()) return { skipped: true, reason: dbStatus().message };

    let rowsWritten = 0;
    for (const base of TICKER_BASES.slice(0, 5)) {
      const symbol = toCanonical(base);
      for (const tf of TIMEFRAMES) {
        const env = await getSpotFlow(symbol, tf);
        // Only the recent tail: earlier buckets are already stored.
        const rows: CvdRow[] = env.data.points.slice(-50).map((p) => ({
          symbol: base,
          timeframe: tf,
          bucket_time: new Date(p.time * 1000).toISOString(),
          cumulative: p.cumulative,
          delta: p.delta,
          close_price: p.close,
        }));
        rowsWritten += await saveCvd(rows);
      }
    }

    const health = await getHealth();
    await saveHealth([
      ...health.exchanges.map((e) => ({
        source: e.id, status: e.status, latency_ms: e.latencyMs, message: e.message ?? null,
      })),
      ...health.providers.map((p) => ({
        source: p.id, status: p.status, latency_ms: p.latencyMs, message: p.message,
      })),
    ]);

    return { skipped: false, rowsWritten, ranAt: Date.now() };
  });
}
