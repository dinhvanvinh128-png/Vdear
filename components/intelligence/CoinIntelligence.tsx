'use client';
import { useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataFreshness, Skeleton, ErrorState } from '@/components/common';
import { ScoreGauge } from '@/components/intelligence/ScoreGauge';
import { ScoreBreakdown } from '@/components/intelligence/ScoreBreakdown';
import { AccDistBadge, RegimeBadge, SignalBadge } from '@/components/intelligence/RegimeBadge';
import { WhyRisks, Scenarios } from '@/components/intelligence/WhyRisks';
import { QualityNotice } from '@/components/intelligence/QualityNotice';
import { CvdChart, DeltaBars } from '@/components/intelligence/CvdChart';
import { fmtCompact } from '@/lib/format';
import { cn } from '@/lib/utils';
import { FLOW_TIMEFRAMES, type FlowTimeframe, type SpotFlow } from '@/lib/engines/spotFlow';
import type { Envelope } from '@/lib/types';
import type { Intelligence } from '@/lib/services/intelligence';

/** The intelligence section of a coin page: flow, structure and the analyst. */
export function CoinIntelligence({ base }: { base: string }) {
  const [tf, setTf] = useState<FlowTimeframe>('1h');
  const intel = useApi<Envelope<Intelligence>>(`/api/scores/${base}`, 30_000);
  const flowEnv = useApi<Envelope<SpotFlow>>(`/api/spot-flow/${base}?timeframe=${tf}`, 20_000);

  if (intel.loading && !intel.data) return <Skeleton className="h-96 w-full" />;
  if (intel.error && !intel.data) return <ErrorState message={intel.error} />;
  if (!intel.data) return null;

  const d = intel.data.data;
  const flow = flowEnv.data?.data ?? d.spotFlow;
  const daily = d.trend?.timeframes.find((t) => t.timeframe === '1d');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <RegimeBadge regime={d.regime.regime} conviction={d.regime.conviction} />
        <SignalBadge state={d.signal.state} confidence={d.signal.confidence} />
        <AccDistBadge phase={d.accDist.phase} strength={d.accDist.strength} />
        <span className="ml-auto"><DataFreshness meta={intel.data.meta} /></span>
      </div>

      <QualityNotice quality={d.quality} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ScoreGauge label="Money Flow" score={d.moneyFlow.score} size="lg"
                    confidence={d.moneyFlow.confidence} coverage={d.moneyFlow.coverage}
                    components={{
                      available: d.moneyFlow.components.filter((c) => c.score != null).length,
                      total: d.moneyFlow.components.length,
                    }}
                    sublabel={d.moneyFlow.direction} />
        <ScoreGauge label="Trend" score={d.trend?.score ?? null}
                    sublabel={d.trend?.rangebound ? 'trend strength low — range' : daily?.structure} />
        <ScoreGauge label="Spot Flow" score={flow?.score ?? null}
                    sublabel={flow ? `${flow.timeframe} · ${flow.sources.join(', ') || 'no venue'}` : undefined} />
        <ScoreGauge label="Liquidity" score={d.liquidity?.score ?? null}
                    sublabel={d.liquidity?.direction} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Cumulative Volume Delta</CardTitle>
            <div className="flex gap-1">
              {FLOW_TIMEFRAMES.map((t) => (
                <Button key={t} size="sm" active={tf === t} onClick={() => setTf(t)}>{t}</Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <CvdChart points={flow?.points ?? []} />
            <DeltaBars points={flow?.points ?? []} />
            {flow && (
              <>
                <div className="mt-2 grid grid-cols-2 gap-3 border-t border-border pt-2 text-xs sm:grid-cols-4">
                  <Stat label="CVD" value={fmtCompact(flow.cvd, '$')} />
                  <Stat label="Buy pressure"
                        value={flow.buyPressure == null ? '—' : `${(flow.buyPressure * 100).toFixed(1)}%`} />
                  <Stat label="Volume anomaly" value={flow.volumeAnomaly.label ?? 'insufficient history'} />
                  <Stat label="VWAP deviation"
                        value={flow.vwapDeviationPct == null ? '—' : `${flow.vwapDeviationPct.toFixed(2)}%`} />
                </div>
                {flow.excluded.length > 0 && (
                  <p className="mt-2 text-[11px] leading-snug text-muted">
                    {flow.excluded.join(', ')} excluded — those venues do not publish a taker-buy
                    split, so their volume cannot be attributed to buyers or sellers. They are left
                    out rather than assumed to be balanced.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Score breakdown</CardTitle></CardHeader>
            <CardContent><ScoreBreakdown moneyFlow={d.moneyFlow} /></CardContent>
          </Card>

          {d.trend && (
            <Card>
              <CardHeader><CardTitle>Trend by timeframe</CardTitle></CardHeader>
              <CardContent className="space-y-1.5">
                {d.trend.timeframes.map((t) => (
                  <div key={t.timeframe} className="flex items-center justify-between text-xs">
                    <span className="text-text">{t.timeframe}</span>
                    {t.insufficient ? (
                      <span className="text-muted">not enough history</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="text-[10px] text-muted">
                          {t.structure} · ADX {t.adx == null ? '—' : t.adx.toFixed(0)}
                        </span>
                        <span className={cn('tnum font-semibold',
                          t.score >= 60 ? 'text-up' : t.score <= 40 ? 'text-down' : 'text-warn')}>
                          {Math.round(t.score)}
                        </span>
                      </span>
                    )}
                  </div>
                ))}
                {d.trend.missing.length > 0 && (
                  <p className="pt-1 text-[11px] text-muted">
                    {d.trend.missing.join(', ')} skipped — weights renormalised over the rest.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {d.orderBook && (
        <Card>
          <CardHeader><CardTitle>Order book imbalance</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {d.orderBook.bands.map((b) => (
              <div key={b.band}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-muted">±{b.band}%</span>
                  <span className="tnum text-muted">
                    {b.imbalance == null
                      ? 'nothing resting in this band'
                      : `${(b.imbalance * 100).toFixed(1)}% bid · ${fmtCompact(b.bidDepthUsd + b.askDepthUsd, '$')} total`}
                  </span>
                </div>
                <div className="mt-1 flex h-1.5 w-full overflow-hidden rounded-full bg-panel-2">
                  {b.imbalance != null && (
                    <>
                      <div className="h-full bg-up" style={{ width: `${b.imbalance * 100}%` }} />
                      <div className="h-full bg-down" style={{ width: `${100 - b.imbalance * 100}%` }} />
                    </>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <WhyRisks report={d.analyst} />
      <Scenarios report={d.analyst} />
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
