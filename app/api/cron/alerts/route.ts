/**
 * Cron: detect alerts and persist new ones.
 *
 * The unique dedupe_key does the de-duplication in the database, so a condition
 * that persists across runs is stored once rather than every fifteen minutes.
 */
import type { NextRequest } from 'next/server';
import { getIntelligence } from '@/lib/services/intelligence';
import { getMacroLiquidity } from '@/lib/services/liquidityMacro';
import { detectAlerts } from '@/lib/engines/alerts';
import { saveAlert } from '@/lib/db/repositories';
import { dbWritable, dbStatus } from '@/lib/db/client';
import { assertCronAuthorized, handle } from '@/lib/api/guard';
import { TICKER_BASES } from '@/lib/symbols';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return handle(async () => {
    assertCronAuthorized(req);
    if (!dbWritable()) return { skipped: true, reason: dbStatus().message };

    const macro = await getMacroLiquidity();
    let inserted = 0;
    let duplicates = 0;
    const detected: string[] = [];

    for (const base of TICKER_BASES.slice(0, 5)) {
      const env = await getIntelligence(base);
      const d = env.data;
      const alerts = detectAlerts({
        asset: d.symbol,
        spotFlow: d.spotFlow,
        breadth: d.breadth,
        whale: d.whale,
        stablecoin: macro.data.stablecoin,
        accDist: d.accDist,
        regime: d.regime,
        dataConfidence: d.quality.confidence,
      });

      for (const a of alerts) {
        detected.push(a.dedupeKey);
        const result = await saveAlert({
          asset: a.asset, kind: a.kind, severity: a.severity, reason: a.reason,
          source: a.source, confidence: a.confidence,
          payload: a.payload ?? null, dedupe_key: a.dedupeKey,
          triggered_at: new Date(a.timestamp).toISOString(),
        });
        if (result === 'inserted') inserted++;
        else if (result === 'duplicate') duplicates++;
      }
    }

    return { skipped: false, detected: detected.length, inserted, duplicates, ranAt: Date.now() };
  });
}
