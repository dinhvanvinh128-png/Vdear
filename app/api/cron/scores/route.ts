/**
 * Cron: record the score snapshot for the tracked assets.
 *
 * This is what turns the live scores into HISTORY. With no database configured
 * it returns a clear "skipped" rather than failing — the platform is designed to
 * run without one.
 */
import type { NextRequest } from 'next/server';
import { getIntelligence } from '@/lib/services/intelligence';
import { saveScore, saveBreadth } from '@/lib/db/repositories';
import { dbWritable, dbStatus } from '@/lib/db/client';
import { assertCronAuthorized, handle } from '@/lib/api/guard';
import { TICKER_BASES } from '@/lib/symbols';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return handle(async () => {
    assertCronAuthorized(req);
    if (!dbWritable()) {
      return { skipped: true, reason: dbStatus().message };
    }

    const results: { symbol: string; saved: boolean }[] = [];
    let breadthSaved = false;

    // Sequential on purpose: the cron has time, and this keeps the fan-out
    // inside the upstream rate-limit budget.
    for (const base of TICKER_BASES) {
      const env = await getIntelligence(base);
      const d = env.data;

      const saved = await saveScore({
        symbol: d.symbol,
        money_flow: d.moneyFlow.score,
        trend: d.trend?.score ?? null,
        liquidity: d.liquidity?.score ?? null,
        breadth: d.breadth?.score ?? null,
        onchain: d.onChain?.score ?? null,
        whale: d.whale?.score ?? null,
        spot_flow: d.spotFlow?.score ?? null,
        stablecoin: d.stablecoinScore,
        defi: d.defiScore,
        derivatives: d.derivatives?.score ?? null,
        regime: d.regime.regime,
        regime_conviction: d.regime.conviction,
        acc_dist: d.accDist.phase,
        signal_state: d.signal.state,
        signal_confidence: d.signal.confidence,
        coverage: d.moneyFlow.coverage,
        data_confidence: d.quality.confidence,
        components: d.moneyFlow.components,
      });
      results.push({ symbol: d.symbol, saved });

      if (!breadthSaved && d.breadth) {
        breadthSaved = await saveBreadth({
          universe: d.breadth.universe,
          advancing_pct: d.breadth.advancing.pct,
          above_ema20_pct: d.breadth.aboveEma20.pct,
          above_ema50_pct: d.breadth.aboveEma50.pct,
          above_ema200_pct: d.breadth.aboveEma200.pct,
          ema20_sample: d.breadth.aboveEma20.sample,
          ema50_sample: d.breadth.aboveEma50.sample,
          ema200_sample: d.breadth.aboveEma200.sample,
          new_highs: d.breadth.newHighs.count,
          new_lows: d.breadth.newLows.count,
          advance_decline: d.breadth.advanceDecline,
          advancing_volume: d.breadth.advancingVolumeUsd,
          declining_volume: d.breadth.decliningVolumeUsd,
          volume_ratio: d.breadth.volumeRatio,
          score: d.breadth.score,
        });
      }
    }

    return { skipped: false, scores: results, breadthSaved, ranAt: Date.now() };
  });
}
