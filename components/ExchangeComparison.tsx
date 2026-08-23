'use client';
import { useApi } from '@/hooks/useApi';
import type { AggregatedTicker, Envelope } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmtPrice, fmtCompact } from '@/lib/format';
import { DataFreshness, Skeleton } from '@/components/common';
import { ADAPTER_MAP } from '@/lib/exchanges/registry';
import type { ExchangeId } from '@/lib/types';

/** Multi-exchange price comparison + VDEAR index + spread/premium (spec §14-15). */
export function ExchangeComparison({ base }: { base: string }) {
  const { data, loading } = useApi<Envelope<AggregatedTicker>>(`/api/coins/${base}?market=futures`, 5000);
  const agg = data?.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Multi-Exchange Comparison</CardTitle>
        {agg && <span className="text-xs text-muted">Spread {agg.spreadPct.toFixed(3)}%</span>}
      </CardHeader>
      <CardContent>
        {loading && !agg && <Skeleton className="h-40 w-full" />}
        {agg && (
          <>
            <div className="mb-3 flex items-baseline justify-between rounded-lg border border-brand/30 bg-brand/10 px-3 py-2">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted">VDEAR Index</div>
                <div className="text-lg font-semibold tnum text-brand">${fmtPrice(agg.vdearIndex)}</div>
              </div>
              <div className="text-right text-[11px] text-muted">
                <div>{agg.indexMethod}-weighted</div>
                <div>avg ${fmtPrice(agg.avgPrice)}</div>
              </div>
            </div>

            <table className="w-full text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="py-1.5 text-left font-medium">Exchange</th>
                  <th className="py-1.5 text-right font-medium">Price</th>
                  <th className="py-1.5 text-right font-medium">vs Index</th>
                  <th className="py-1.5 text-right font-medium">Volume</th>
                </tr>
              </thead>
              <tbody>
                {agg.sources.map((s) => {
                  const prem = agg.vdearIndex ? ((s.price - agg.vdearIndex) / agg.vdearIndex) * 100 : 0;
                  const color = ADAPTER_MAP[s.exchange as ExchangeId]?.color ?? '#888';
                  return (
                    <tr key={s.exchange} className="border-b border-border/50">
                      <td className="py-1.5">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                          {ADAPTER_MAP[s.exchange as ExchangeId]?.label ?? s.exchange}
                        </span>
                      </td>
                      <td className="py-1.5 text-right tnum">${fmtPrice(s.price)}</td>
                      <td className={`py-1.5 text-right tnum ${prem >= 0 ? 'text-up' : 'text-down'}`}>
                        {prem >= 0 ? '+' : ''}{prem.toFixed(3)}%
                      </td>
                      <td className="py-1.5 text-right tnum text-muted">{fmtCompact(s.volume24h, '$')}</td>
                    </tr>
                  );
                })}
                {agg.missing.map((m) => (
                  <tr key={m} className="border-b border-border/50 text-muted">
                    <td className="py-1.5">{ADAPTER_MAP[m]?.label ?? m}</td>
                    <td className="py-1.5 text-right" colSpan={3}>N/A</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3"><DataFreshness meta={data?.meta} /></div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
