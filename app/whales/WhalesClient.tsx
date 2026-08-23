'use client';
import { useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { PageHeader } from '@/components/PageHeader';
import { CoinPicker } from '@/components/CoinPicker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataFreshness, Skeleton, ErrorState } from '@/components/common';
import { ScoreGauge } from '@/components/intelligence/ScoreGauge';
import { fmtCompact, fmtPrice, ago } from '@/lib/format';
import { cn } from '@/lib/utils';
import { WHALE_TIERS, type WhaleActivity } from '@/lib/engines/whale';
import type { Envelope } from '@/lib/types';

export function WhalesClient() {
  const [symbol, setSymbol] = useState('BTC');
  const [minUsd, setMinUsd] = useState<number>(WHALE_TIERS[0]);
  const { data, loading, error } = useApi<Envelope<WhaleActivity>>(
    `/api/whales?symbol=${symbol}&minUsd=${minUsd}`, 10_000,
  );
  const w = data?.data;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Whale Activity"
        subtitle="Large executed fills across venues, plus exchange flow where a provider is configured."
        right={<CoinPicker value={symbol} onChange={setSymbol} />}
      />

      <div className="flex flex-wrap gap-1">
        {WHALE_TIERS.map((t) => (
          <Button key={t} size="sm" active={minUsd === t} onClick={() => setMinUsd(t)}>
            {fmtCompact(t, '$')}+
          </Button>
        ))}
      </div>

      {loading && !data && <Skeleton className="h-64 w-full" />}
      {error && !data && <ErrorState message={error} />}

      {w && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ScoreGauge label="Whale flow score" size="lg" score={w.score}
                        sublabel={w.tiers.length ? w.tiers.join(' + ') : 'no whale evidence'} />
            <ScoreGauge label="Buy share among whales"
                        score={w.whaleBuyRatio == null ? null : w.whaleBuyRatio * 100} />
            <div className="rounded-xl border border-border bg-panel px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-muted">Net whale flow</div>
              <div className={cn('mt-1 text-2xl font-semibold tnum',
                w.whaleNetUsd >= 0 ? 'text-up' : 'text-down')}>
                {fmtCompact(w.whaleNetUsd, '$')}
              </div>
              <div className="mt-0.5 text-[11px] text-muted">
                sample covers {(w.fillWindowMs / 1000).toFixed(0)}s of fills
              </div>
            </div>
            <div className="rounded-xl border border-border bg-panel px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-muted">Exchange flow</div>
              {w.exchangeFlow ? (
                <>
                  <div className={cn('mt-1 text-2xl font-semibold tnum',
                    w.exchangeFlow.netflowLatest <= 0 ? 'text-up' : 'text-down')}>
                    {w.exchangeFlow.netflowLatest <= 0 ? 'Outflow' : 'Inflow'}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    via {w.exchangeFlow.source}
                  </div>
                </>
              ) : (
                <div className="mt-1 text-[11px] leading-snug text-muted">{w.exchangeFlowNote}</div>
              )}
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Size buckets</CardTitle>
              {data && <DataFreshness meta={data.meta} />}
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="text-xs text-muted">
                    <tr className="border-b border-border">
                      <th className="px-2 py-2 text-left font-medium">Threshold</th>
                      <th className="px-2 py-2 text-right font-medium">Fills</th>
                      <th className="px-2 py-2 text-right font-medium">Buy</th>
                      <th className="px-2 py-2 text-right font-medium">Sell</th>
                      <th className="px-2 py-2 text-right font-medium">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {w.buckets.map((b) => (
                      <tr key={b.threshold} className="border-b border-border/50 last:border-0">
                        <td className="px-2 py-2 text-text">{fmtCompact(b.threshold, '$')}+</td>
                        <td className="px-2 py-2 text-right tnum text-muted">{b.count}</td>
                        <td className="px-2 py-2 text-right tnum text-up">{fmtCompact(b.buyUsd, '$')}</td>
                        <td className="px-2 py-2 text-right tnum text-down">{fmtCompact(b.sellUsd, '$')}</td>
                        <td className={cn('px-2 py-2 text-right tnum font-semibold',
                          b.netUsd >= 0 ? 'text-up' : 'text-down')}>
                          {fmtCompact(b.netUsd, '$')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Largest recent fills</CardTitle></CardHeader>
            <CardContent>
              {w.largestFills.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted">
                  No fills above {fmtCompact(minUsd, '$')} in the recent window.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="text-xs text-muted">
                      <tr className="border-b border-border">
                        <th className="px-2 py-2 text-left font-medium">Time</th>
                        <th className="px-2 py-2 text-right font-medium">Price</th>
                        <th className="px-2 py-2 text-right font-medium">Value</th>
                        <th className="px-2 py-2 text-center font-medium">Side</th>
                        <th className="px-2 py-2 text-right font-medium">Venue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {w.largestFills.map((f, i) => (
                        <tr key={i} className="border-b border-border/50 last:border-0">
                          <td className="px-2 py-2 text-muted">{ago(f.timestamp)}</td>
                          <td className="px-2 py-2 text-right tnum text-muted">{fmtPrice(f.price)}</td>
                          <td className="px-2 py-2 text-right tnum font-semibold text-text">
                            {fmtCompact(f.usd, '$')}
                          </td>
                          <td className={cn('px-2 py-2 text-center text-xs font-semibold',
                            f.side === 'buy' ? 'text-up' : 'text-down')}>
                            {f.side.toUpperCase()}
                          </td>
                          <td className="px-2 py-2 text-right text-xs text-muted">{f.exchange}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
