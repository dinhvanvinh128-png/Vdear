'use client';
import { useApi } from '@/hooks/useApi';
import type { Envelope, FundingRate, LongShortRatio, OpenInterest } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmtFunding, fmtCompact } from '@/lib/format';
import { Skeleton } from '@/components/common';
import { ADAPTER_MAP } from '@/lib/exchanges/registry';
import type { ExchangeId } from '@/lib/types';
import { cn } from '@/lib/utils';

function Dot({ id }: { id: ExchangeId }) {
  return <span className="h-2 w-2 rounded-full" style={{ background: ADAPTER_MAP[id]?.color ?? '#888' }} />;
}

export function CoinDerivatives({ base }: { base: string }) {
  const funding = useApi<Envelope<{ perExchange: FundingRate[]; average: number | null }>>(`/api/funding?symbol=${base}`, 15000);
  const oi = useApi<Envelope<{ perExchange: OpenInterest[]; totalUsd: number }>>(`/api/open-interest?symbol=${base}`, 15000);
  const ls = useApi<Envelope<{ perExchange: LongShortRatio[]; avgLong: number | null }>>(`/api/longshort/${base}`, 30000);

  const fundingWarn = (r: number) => {
    const p = Math.abs(r * 100);
    return p >= 0.1 ? 'Extreme' : p >= 0.05 ? 'High' : 'Normal';
  };

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Card>
        <CardHeader><CardTitle>Funding Rate</CardTitle>
          {funding.data?.data.average != null && (
            <span className={cn('text-xs', funding.data.data.average >= 0 ? 'text-up' : 'text-down')}>
              avg {fmtFunding(funding.data.data.average)}
            </span>
          )}
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {!funding.data && <Skeleton className="h-20 w-full" />}
          {funding.data?.data.perExchange.map((f) => (
            <div key={f.exchange} className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-muted"><Dot id={f.exchange} />{ADAPTER_MAP[f.exchange]?.label}</span>
              <span className={cn('tnum', f.rate >= 0 ? 'text-up' : 'text-down')}>{fmtFunding(f.rate)}</span>
            </div>
          ))}
          {funding.data?.data.average != null && (
            <div className="mt-2 border-t border-border pt-2 text-xs text-muted">
              Status: <span className="font-semibold text-text">{fundingWarn(funding.data.data.average)}</span>
              {' '}— funding alone is not a guaranteed long/short signal.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Open Interest</CardTitle>
          {oi.data && <span className="text-xs text-info">{fmtCompact(oi.data.data.totalUsd, '$')}</span>}
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {!oi.data && <Skeleton className="h-20 w-full" />}
          {oi.data?.data.perExchange.map((o) => (
            <div key={o.exchange} className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-muted"><Dot id={o.exchange} />{ADAPTER_MAP[o.exchange]?.label}</span>
              <span className="tnum text-muted">{fmtCompact(o.valueUsd, '$')}</span>
            </div>
          ))}
          {oi.data && oi.data.data.perExchange.length === 0 && <div className="text-xs text-muted">N/A</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Long / Short</CardTitle>
          {ls.data?.data.avgLong != null && <span className="text-xs text-muted">avg {ls.data.data.avgLong.toFixed(1)}% long</span>}
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!ls.data && <Skeleton className="h-20 w-full" />}
          {ls.data?.data.perExchange.map((r) => (
            <div key={r.exchange}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted"><Dot id={r.exchange} />{ADAPTER_MAP[r.exchange]?.label}</span>
                <span className="text-muted">{r.longPct.toFixed(1)}% / {r.shortPct.toFixed(1)}%</span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-panel-2">
                <div className="bg-up" style={{ width: `${r.longPct}%` }} />
                <div className="bg-down" style={{ width: `${r.shortPct}%` }} />
              </div>
            </div>
          ))}
          {ls.data && ls.data.data.perExchange.length === 0 && <div className="text-xs text-muted">N/A on available sources</div>}
        </CardContent>
      </Card>
    </div>
  );
}
