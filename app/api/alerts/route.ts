/**
 * Alerts — live-detected from the current engine output, merged with any
 * history the database holds.
 *
 * Without a database, de-duplication is per-process only and the response says
 * so, rather than silently presenting a partial view as complete.
 */
import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getIntelligence } from '@/lib/services/intelligence';
import { getMacroLiquidity } from '@/lib/services/liquidityMacro';
import { detectAlerts } from '@/lib/engines/alerts';
import { getRecentAlerts } from '@/lib/db/repositories';
import { dbConfigured } from '@/lib/db/client';
import { canonicalSymbol, checkRateLimit, handle, parseQuery } from '@/lib/api/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handle(async () => {
    checkRateLimit(req);
    const { symbol, limit } = parseQuery(req, z.object({
      symbol: z.string().default('BTC'),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }));

    const [intel, macro] = await Promise.all([
      getIntelligence(canonicalSymbol(symbol)),
      getMacroLiquidity(),
    ]);
    const d = intel.data;

    const live = detectAlerts({
      asset: d.symbol,
      spotFlow: d.spotFlow,
      breadth: d.breadth,
      whale: d.whale,
      stablecoin: macro.data.stablecoin,
      accDist: d.accDist,
      regime: d.regime,
      dataConfidence: d.quality.confidence,
    });

    const history = await getRecentAlerts(limit, d.symbol);

    return {
      data: {
        live,
        history,
        persistence: dbConfigured()
          ? 'Alert history is persisted; duplicates are suppressed across restarts.'
          : 'No database configured — alerts are detected live and de-duplicated per process only. '
            + 'Set the Supabase variables to keep history.',
      },
      meta: {
        kind: 'live' as const,
        sources: intel.meta.sources,
        errors: [],
        generatedAt: Date.now(),
        cached: false,
      },
    };
  });
}
