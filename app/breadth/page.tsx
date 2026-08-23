'use client';
import { useApi } from '@/hooks/useApi';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataFreshness, Skeleton, ErrorState } from '@/components/common';
import { BreadthPanel } from '@/components/intelligence/BreadthPanel';
import { ScoreGauge } from '@/components/intelligence/ScoreGauge';
import { breadthLabel, type MarketBreadth } from '@/lib/engines/breadth';
import type { Envelope } from '@/lib/types';

export default function BreadthPage() {
  const { data, loading, error } = useApi<Envelope<MarketBreadth>>('/api/breadth', 60_000);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Market Breadth"
        subtitle="How much of the market is actually participating — not just what BTC is doing."
        right={data ? <DataFreshness meta={data.meta} /> : undefined}
      />

      {loading && !data && <Skeleton className="h-64 w-full" />}
      {error && !data && <ErrorState message={error} />}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ScoreGauge label="Breadth score" score={data.data.score} size="lg"
                        sublabel={breadthLabel(data.data.score).replace('_', ' ')} />
            <ScoreGauge label="Advancing" score={data.data.advancing.pct}
                        sublabel={`${data.data.advancing.count} of ${data.data.universe}`} />
            <ScoreGauge label="Above EMA50" score={data.data.aboveEma50.pct}
                        sublabel={`sample: ${data.data.aboveEma50.sample}`} />
            <ScoreGauge label="Above EMA200" score={data.data.aboveEma200.pct}
                        sublabel={`sample: ${data.data.aboveEma200.sample}`} />
          </div>

          <BreadthPanel breadth={data.data} />

          <Card>
            <CardHeader><CardTitle>How this is measured</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs leading-relaxed text-muted">
              <p>
                Advance/decline and volume ratios cover the full USDT universe from the exchange
                ticker list. The moving-average ratios are computed from daily candles for the
                highest-volume assets, and each ratio reports its own sample size.
              </p>
              <p>
                An asset without enough history for a given average is excluded from that ratio
                rather than counted as being below it — so &ldquo;68% above EMA200&rdquo; always
                means 68% of the assets that could be judged, not 68% of everything.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
