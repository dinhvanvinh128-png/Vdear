'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { PageHeader } from '@/components/PageHeader';
import { CoinPicker } from '@/components/CoinPicker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataFreshness, Skeleton, ErrorState } from '@/components/common';
import { ago } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Envelope } from '@/lib/types';
import type { Alert } from '@/lib/engines/alerts';
import type { AlertRow } from '@/lib/db/repositories';

const SEVERITY: Record<string, string> = {
  info: 'border-info/30 bg-info/5 text-info',
  warning: 'border-warn/40 bg-warn/5 text-warn',
  critical: 'border-down/50 bg-down/10 text-down',
};

interface AlertsPayload {
  live: Alert[];
  history: (AlertRow & { triggered_at: string })[];
  persistence: string;
}

export function AlertsClient() {
  const [symbol, setSymbol] = useState('BTC');
  const { data, loading, error } = useApi<Envelope<AlertsPayload>>(
    `/api/alerts?symbol=${symbol}`, 30_000,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Market Alerts"
        subtitle="Conditions detected from the live engine output — CVD spikes, volume anomalies, whale flow, breadth shifts and regime changes."
        right={<CoinPicker value={symbol} onChange={setSymbol} />}
      />

      {loading && !data && <Skeleton className="h-56 w-full" />}
      {error && !data && <ErrorState message={error} />}

      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-4 w-4" /> Currently detected
              </CardTitle>
              <DataFreshness meta={data.meta} />
            </CardHeader>
            <CardContent>
              {data.data.live.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted">
                  No alert conditions are currently met for {symbol}.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.data.live.map((a) => (
                    <div key={a.dedupeKey}
                         className={cn('rounded-lg border px-3 py-2', SEVERITY[a.severity])}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide">
                          {a.asset} · {a.kind.replace(/_/g, ' ')}
                        </span>
                        <span className="tnum text-[10px] opacity-80">
                          {a.severity} · confidence {Math.round(a.confidence)}/100 · {ago(a.timestamp)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-text">{a.reason}</p>
                      <p className="mt-1 text-[11px] opacity-80">Source: {a.source}</p>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-3 text-[11px] leading-relaxed text-muted">{data.data.persistence}</p>
            </CardContent>
          </Card>

          {data.data.history.length > 0 && (
            <Card>
              <CardHeader><CardTitle>History</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {data.data.history.map((h, i) => (
                    <div key={i} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 pb-1.5 last:border-0">
                      <span className="text-xs text-text">{h.reason}</span>
                      <span className="tnum shrink-0 text-[10px] text-muted">
                        {ago(Date.parse(h.triggered_at))}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <p className="text-[11px] text-muted">
            Looking for personal price alerts?{' '}
            <Link href="/price-alerts" className="underline underline-offset-2">Price alerts</Link>
          </p>
        </>
      )}
    </div>
  );
}
