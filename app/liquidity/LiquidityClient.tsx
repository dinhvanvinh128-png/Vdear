'use client';
import { useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { PageHeader } from '@/components/PageHeader';
import { CoinPicker } from '@/components/CoinPicker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataFreshness, Skeleton, ErrorState } from '@/components/common';
import { ScoreGauge } from '@/components/intelligence/ScoreGauge';
import { fmtCompact } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Envelope } from '@/lib/types';
import type { LiquidityResult } from '@/lib/services/liquidity';
import type { StablecoinMetrics } from '@/lib/engines/stablecoin';
import type { DefiMetrics } from '@/lib/engines/defi';

export function LiquidityClient() {
  const [symbol, setSymbol] = useState('BTC');
  const book = useApi<Envelope<LiquidityResult>>(`/api/liquidity/${symbol}`, 15_000);
  const stables = useApi<Envelope<{ stablecoin: StablecoinMetrics | null; reason: string | null }>>(
    '/api/stablecoins', 300_000);
  const defi = useApi<Envelope<{ defi: DefiMetrics }>>('/api/defi', 300_000);

  const ob = book.data?.data.orderBook;
  const stable = stables.data?.data.stablecoin;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Liquidity"
        subtitle="Order book depth, spread, stablecoin supply and DEX liquidity — how much size this market can absorb."
        right={<CoinPicker value={symbol} onChange={setSymbol} />}
      />

      {book.loading && !book.data && <Skeleton className="h-64 w-full" />}
      {book.error && !book.data && <ErrorState message={book.error} />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ScoreGauge label="Liquidity score" size="lg" score={book.data?.data.score.score ?? null}
                    sublabel={book.data?.data.score.direction} />
        <ScoreGauge label="Order book" score={ob?.score ?? null}
                    sublabel={ob?.sources.join(', ')} />
        <ScoreGauge label="Stablecoin supply" score={stable?.score ?? null}
                    sublabel={stable?.direction} />
        <ScoreGauge label="DeFi / DEX" score={defi.data?.data.defi.score ?? null}
                    sublabel={defi.data?.data.defi.inputs.join(', ')} />
      </div>

      {ob && (
        <Card>
          <CardHeader>
            <CardTitle>{symbol} order book depth</CardTitle>
            {book.data && <DataFreshness meta={book.data.meta} />}
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Mid price" value={ob.midPrice?.toLocaleString('en-US') ?? '—'} />
              <Metric label="Spread"
                      value={ob.spreadPct == null ? '—' : `${ob.spreadPct.toFixed(4)}%`} />
              <Metric label="Imbalance (±1%)"
                      value={ob.headlineImbalance == null
                        ? '—' : `${(ob.headlineImbalance * 100).toFixed(1)}% bid`} />
            </div>

            <div className="mt-4 space-y-2">
              {ob.bands.map((b) => {
                const total = b.bidDepthUsd + b.askDepthUsd;
                const bidPct = b.imbalance == null ? 50 : b.imbalance * 100;
                return (
                  <div key={b.band}>
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="text-muted">±{b.band}%</span>
                      <span className="tnum text-muted">
                        {b.imbalance == null
                          ? 'nothing resting in this band'
                          : `${fmtCompact(b.bidDepthUsd, '$')} bid · ${fmtCompact(b.askDepthUsd, '$')} ask`}
                      </span>
                    </div>
                    <div className="mt-1 flex h-2 w-full overflow-hidden rounded-full bg-panel-2">
                      {total > 0 && (
                        <>
                          <div className="h-full bg-up" style={{ width: `${bidPct}%` }} />
                          <div className="h-full bg-down" style={{ width: `${100 - bidPct}%` }} />
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 space-y-1 border-t border-border pt-3">
              {book.data?.data.score.components.map((c) => (
                <div key={c.name} className="flex items-center justify-between text-xs">
                  <span className="text-muted">{c.name}</span>
                  <span className={cn('tnum font-semibold',
                    c.value >= 60 ? 'text-up' : c.value <= 40 ? 'text-down' : 'text-warn')}>
                    {Math.round(c.value)}
                  </span>
                </div>
              ))}
              {(book.data?.data.score.missing.length ?? 0) > 0 && (
                <p className="pt-1 text-[11px] text-muted">
                  Not available: {book.data!.data.score.missing.join(', ')} — excluded and weights renormalised.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {stable && (
        <Card>
          <CardHeader><CardTitle>Stablecoin liquidity</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-4">
              <Metric label="Total supply" value={fmtCompact(stable.totalUsd, '$')} />
              <Metric label="7d change"
                      value={stable.change7d == null ? '—' : `${stable.change7d.toFixed(2)}%`} />
              <Metric label="30d change"
                      value={stable.change30d == null ? '—' : `${stable.change30d.toFixed(2)}%`} />
              <Metric label="Direction" value={stable.direction} />
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[420px] text-xs">
                <thead className="text-muted">
                  <tr className="border-b border-border">
                    <th className="px-2 py-1.5 text-left font-medium">Chain</th>
                    <th className="px-2 py-1.5 text-right font-medium">Supply</th>
                    <th className="px-2 py-1.5 text-right font-medium">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {stable.byChain.slice(0, 8).map((c) => (
                    <tr key={c.chain} className="border-b border-border/50 last:border-0">
                      <td className="px-2 py-1.5 text-text">{c.chain}</td>
                      <td className="px-2 py-1.5 text-right tnum text-muted">{fmtCompact(c.usd, '$')}</td>
                      <td className="px-2 py-1.5 text-right tnum text-muted">{c.share.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {stables.data && !stable && (
        <ErrorState message={stables.data.data.reason ?? 'Stablecoin data unavailable'} />
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-panel-2/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 tnum text-sm font-semibold text-text">{value}</div>
    </div>
  );
}
