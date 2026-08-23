'use client';
import Link from 'next/link';
import { useApi } from '@/hooks/useApi';
import type { Envelope } from '@/lib/types';
import type { Intelligence } from '@/lib/services/intelligence';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataFreshness, Skeleton, ErrorState, PctChange } from '@/components/common';
import { fmtCompact } from '@/lib/format';
import { LivePrice } from '@/components/intelligence/LivePrice';
import { ScoreGauge } from '@/components/intelligence/ScoreGauge';
import { ScoreBreakdown } from '@/components/intelligence/ScoreBreakdown';
import { AccDistBadge, RegimeBadge, SignalBadge } from '@/components/intelligence/RegimeBadge';
import { WhyRisks, Scenarios } from '@/components/intelligence/WhyRisks';
import { QualityNotice } from '@/components/intelligence/QualityNotice';
import { CvdChart } from '@/components/intelligence/CvdChart';
import { BreadthPanel } from '@/components/intelligence/BreadthPanel';

/**
 * The main intelligence view: scores, regime, then WHY and RISKS.
 *
 * Deliberately leads with the composite and its coverage rather than with
 * price — the product's claim is about flow and evidence, and the layout
 * should say so before a user scrolls.
 */
export function IntelligenceDashboard({ symbol = 'BTC' }: { symbol?: string }) {
  const { data, loading, error } = useApi<Envelope<Intelligence>>(
    `/api/scores/${symbol}`, 30_000,
  );

  if (loading && !data) return <Skeleton className="h-96 w-full" />;
  if (error && !data) return <ErrorState message={error} />;
  if (!data) return null;

  const d = data.data;
  const flow = d.spotFlow;

  return (
    <div className="space-y-5">
      {/* Headline */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">{d.symbol}</div>
            <div className="flex items-baseline gap-2">
              <LivePrice base={d.symbol} fallback={d.price} className="text-2xl text-text" />
              <PctChange value={d.priceChange24h} />
            </div>
          </div>
          <RegimeBadge regime={d.regime.regime} conviction={d.regime.conviction} />
          <SignalBadge state={d.signal.state} confidence={d.signal.confidence} />
          <AccDistBadge phase={d.accDist.phase} strength={d.accDist.strength} />
        </div>
        <DataFreshness meta={data.meta} />
      </div>

      <QualityNotice quality={d.quality} />

      {/* Score tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ScoreGauge label="Money Flow" score={d.moneyFlow.score} size="lg"
                    confidence={d.moneyFlow.confidence} coverage={d.moneyFlow.coverage}
                    components={{
                      available: d.moneyFlow.components.filter((c) => c.score != null).length,
                      total: d.moneyFlow.components.length,
                    }}
                    sublabel={d.moneyFlow.direction} />
        <ScoreGauge label="Trend" score={d.trend?.score ?? null}
                    sublabel={d.trend?.rangebound ? 'trend strength is low — range' : undefined} />
        <ScoreGauge label="Liquidity" score={d.liquidity?.score ?? null}
                    sublabel={d.liquidity?.direction} />
        <ScoreGauge label="Breadth" score={d.breadth?.score ?? null}
                    sublabel={d.breadth ? `${d.breadth.universe} assets` : undefined} />
        <ScoreGauge label="Spot Flow" score={flow?.score ?? null}
                    sublabel={flow ? `${flow.timeframe} · ${flow.sources.join(', ') || 'no venue'}` : undefined} />
        <ScoreGauge label="On-chain" score={d.onChain?.score ?? null}
                    sublabel={d.onChain?.sources.join(', ') || undefined} />
        <ScoreGauge label="Whale" score={d.whale?.score ?? null}
                    sublabel={d.whale?.tiers.join(' + ') || undefined} />
        <ScoreGauge label="Stablecoin" score={d.stablecoinScore} />
      </div>

      {/* WHY / RISKS */}
      <WhyRisks report={d.analyst} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Cumulative Volume Delta — {flow?.timeframe ?? '1h'}</CardTitle>
            {flow && flow.excluded.length > 0 && (
              <span className="text-[11px] text-muted">
                {flow.excluded.join(', ')} excluded — no taker split published
              </span>
            )}
          </CardHeader>
          <CardContent>
            <CvdChart points={flow?.points ?? []} />
            {flow && (
              <div className="mt-2 grid grid-cols-2 gap-3 border-t border-border pt-2 text-xs sm:grid-cols-4">
                <Stat label="CVD" value={fmtCompact(flow.cvd, '$')} />
                <Stat label="Buy pressure"
                      value={flow.buyPressure == null ? '—' : `${(flow.buyPressure * 100).toFixed(1)}%`} />
                <Stat label="Volume" value={flow.volumeAnomaly.label ?? 'unknown'} />
                <Stat label="VWAP dev"
                      value={flow.vwapDeviationPct == null ? '—' : `${flow.vwapDeviationPct.toFixed(2)}%`} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Money Flow breakdown</CardTitle></CardHeader>
          <CardContent><ScoreBreakdown moneyFlow={d.moneyFlow} /></CardContent>
        </Card>
      </div>

      {d.breadth && <BreadthPanel breadth={d.breadth} />}

      <Scenarios report={d.analyst} />

      <p className="text-[11px] leading-relaxed text-muted">
        VDEAR reports probability and confidence derived from market data. It is informational
        analysis, not financial advice.{' '}
        <Link href="/status" className="underline underline-offset-2">Data source status</Link>
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="tnum font-semibold text-text">{value}</div>
    </div>
  );
}
