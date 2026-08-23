/**
 * Money Flow — the composite for a set of assets, with the per-component
 * breakdown and coverage that make each score interpretable.
 */
import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getIntelligence } from '@/lib/services/intelligence';
import { canonicalSymbol, checkRateLimit, handle, parseQuery } from '@/lib/api/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Kept small on purpose: each symbol runs the full engine pipeline. */
const MAX_SYMBOLS = 6;

export async function GET(req: NextRequest) {
  return handle(async () => {
    checkRateLimit(req);
    const { symbols } = parseQuery(req, z.object({
      symbols: z.string().default('BTC,ETH,SOL'),
    }));

    const list = symbols.split(',').map((s) => s.trim()).filter(Boolean).slice(0, MAX_SYMBOLS);
    const results = await Promise.all(list.map(async (s) => {
      const env = await getIntelligence(canonicalSymbol(s));
      const d = env.data;
      return {
        symbol: d.symbol,
        price: d.price,
        priceChange24h: d.priceChange24h,
        moneyFlow: d.moneyFlow,
        regime: d.regime.regime,
        signal: { state: d.signal.state, label: d.signal.label, confidence: d.signal.confidence },
        accDist: d.accDist.phase,
        confidence: d.quality.confidence,
      };
    }));

    return {
      data: results,
      meta: {
        kind: 'live' as const, sources: [], errors: [],
        generatedAt: Date.now(), cached: false,
      },
    };
  });
}
