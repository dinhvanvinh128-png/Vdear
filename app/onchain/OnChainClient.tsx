'use client';
import { useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { PageHeader } from '@/components/PageHeader';
import { CoinPicker } from '@/components/CoinPicker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataFreshness, Skeleton, ErrorState } from '@/components/common';
import { ScoreGauge } from '@/components/intelligence/ScoreGauge';
import { fmtCompact, fmtPct, ago } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Envelope } from '@/lib/types';
import type { OnChainResult } from '@/lib/services/onchain';

const LABELS: Record<string, string> = {
  activeAddresses: 'Active addresses',
  newAddresses: 'New addresses',
  txCount: 'Transaction count',
  transferValueUsd: 'Transfer value (USD)',
  feesUsd: 'Fees (USD)',
  supplyCurrent: 'Current supply',
};

export function OnChainClient() {
  const [symbol, setSymbol] = useState('BTC');
  const { data, loading, error } = useApi<Envelope<OnChainResult>>(
    `/api/onchain/${symbol}`, 300_000,
  );
  const m = data?.data.metrics;

  return (
    <div className="space-y-5">
      <PageHeader
        title="On-chain Activity"
        subtitle="Network usage scored against each asset's own 30-day baseline, not against absolute thresholds."
        right={<CoinPicker value={symbol} onChange={setSymbol} />}
      />

      {loading && !data && <Skeleton className="h-64 w-full" />}
      {error && !data && <ErrorState message={error} />}

      {m && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ScoreGauge label="On-chain score" size="lg" score={m.metrics.length ? m.score : null}
                        sublabel={m.sources.join(', ') || 'no provider answered'} />
            {m.metrics.slice(0, 3).map((x) => (
              <div key={x.metric} className="rounded-xl border border-border bg-panel px-4 py-3">
                <div className="text-[11px] uppercase tracking-wide text-muted">
                  {LABELS[x.metric] ?? x.metric}
                </div>
                <div className="mt-1 text-xl font-bold tnum text-text">
                  {x.metric.includes('Usd') ? fmtCompact(x.latest, '$') : fmtCompact(x.latest)}
                </div>
                <div className="mt-0.5 text-[11px] text-muted">
                  30d <span className={cn((x.change30d ?? 0) >= 0 ? 'text-up' : 'text-down')}>
                    {fmtPct(x.change30d)}
                  </span>
                  {' · '}{x.source}
                </div>
              </div>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>All metrics</CardTitle>
              {data && <DataFreshness meta={data.meta} />}
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead className="text-xs text-muted">
                    <tr className="border-b border-border">
                      <th className="px-2 py-2 text-left font-medium">Metric</th>
                      <th className="px-2 py-2 text-right font-medium">Latest</th>
                      <th className="px-2 py-2 text-right font-medium">7d</th>
                      <th className="px-2 py-2 text-right font-medium">30d</th>
                      <th className="px-2 py-2 text-right font-medium">z-score</th>
                      <th className="px-2 py-2 text-right font-medium">Source</th>
                      <th className="px-2 py-2 text-right font-medium">Observed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.metrics.map((x) => (
                      <tr key={x.metric} className="border-b border-border/50 last:border-0">
                        <td className="px-2 py-2 text-text">{LABELS[x.metric] ?? x.metric}</td>
                        <td className="px-2 py-2 text-right tnum text-muted">
                          {x.metric.includes('Usd') ? fmtCompact(x.latest, '$') : fmtCompact(x.latest)}
                        </td>
                        <td className={cn('px-2 py-2 text-right tnum',
                          (x.change7d ?? 0) >= 0 ? 'text-up' : 'text-down')}>{fmtPct(x.change7d)}</td>
                        <td className={cn('px-2 py-2 text-right tnum',
                          (x.change30d ?? 0) >= 0 ? 'text-up' : 'text-down')}>{fmtPct(x.change30d)}</td>
                        <td className="px-2 py-2 text-right tnum text-muted">
                          {x.zScore == null ? '—' : x.zScore.toFixed(2)}
                        </td>
                        <td className="px-2 py-2 text-right text-xs text-muted">{x.source}</td>
                        <td className="px-2 py-2 text-right text-xs text-muted">{ago(x.observedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {m.missing.length > 0 && (
                <div className="mt-3 rounded-lg border border-border bg-panel-2/40 px-3 py-2">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
                    No provider could supply
                  </div>
                  <div className="mt-1 text-[11px] text-muted">
                    {m.missing.map((x) => LABELS[x] ?? x).join(', ')}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Provider resolution</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {data!.data.attempts.map((a, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-text">{a.provider}</span>
                  <span className={cn(
                    a.outcome === 'ok' ? 'text-up'
                      : a.outcome === 'not_configured' ? 'text-muted' : 'text-warn')}>
                    {a.outcome}{a.message ? ` — ${a.message}` : ''}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
