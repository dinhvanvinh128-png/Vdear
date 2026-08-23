/** Data quality: cross-venue agreement, confidence and unavailable sources. */
import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getAllAggregated } from '@/lib/services/market';
import { providerHealth, summarizeHealth } from '@/lib/providers/registry';
import { checkRateLimit, handle, parseQuery } from '@/lib/api/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handle(async () => {
    checkRateLimit(req);
    const { limit } = parseQuery(req, z.object({
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }));

    const [agg, providers] = await Promise.all([
      getAllAggregated('spot'),
      providerHealth(),
    ]);

    // Only symbols where venues actually disagree are worth reporting.
    const anomalies = agg.data
      .slice(0, limit)
      .map((c) => c.quality)
      .filter((q) => q.severity !== 'none');

    return {
      data: {
        anomalies,
        checked: Math.min(limit, agg.data.length),
        providers: providers.map((p) => ({
          id: p.id, label: p.label, status: p.status,
          configured: p.configured, requiresKey: p.requiresKey, message: p.message,
        })),
        summary: summarizeHealth(providers),
      },
      meta: {
        kind: 'live' as const,
        sources: agg.meta.sources,
        errors: agg.meta.errors,
        generatedAt: Date.now(),
        cached: false,
      },
    };
  });
}
