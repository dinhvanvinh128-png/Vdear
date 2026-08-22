'use client';
import { useApi } from '@/hooks/useApi';
import type { Envelope, LiquidationZone } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fmtPrice, fmtCompact } from '@/lib/format';
import { Skeleton, DataFreshness } from '@/components/common';

interface HeatmapData {
  source: 'coinglass' | 'estimated';
  currentPrice: number;
  column?: LiquidationZone[];
  cells?: unknown;
  note: string;
}

/** Estimated heatmap column: price bands colored by liquidation intensity. */
export function LiquidationHeatmap({ coin }: { coin: string }) {
  const { data, loading } = useApi<Envelope<HeatmapData>>(`/api/liquidations/heatmap?coin=${coin}`, 20000);
  const d = data?.data;
  const column = d?.column ?? [];

  const cellColor = (z: LiquidationZone) => {
    const a = 0.15 + z.intensity * 0.7;
    return z.side === 'short' ? `rgba(255,76,97,${a})` : `rgba(22,199,132,${a})`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{coin} Liquidation Heatmap</CardTitle>
        {d && <Badge variant={d.source === 'coinglass' ? 'info' : 'warn'}>{d.source === 'coinglass' ? 'CoinGlass' : 'Estimated'}</Badge>}
      </CardHeader>
      <CardContent>
        {loading && !d && <Skeleton className="h-72 w-full" />}
        {d && d.source === 'coinglass' && (
          <div className="py-8 text-center text-sm text-muted">
            Live CoinGlass heatmap connected. Render cells per your plan schema.
          </div>
        )}
        {d && d.source === 'estimated' && (
          <div className="space-y-0.5">
            {column.map((z, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-right text-xs tnum text-muted">${fmtPrice(z.price)}</span>
                <div className="h-5 flex-1 rounded" style={{ background: cellColor(z) }} title={`${fmtCompact(z.estValueUsd, '$')} est.`} />
                <span className="w-8 shrink-0 text-[10px] uppercase text-muted">{z.side === 'short' ? 'S' : 'L'}</span>
              </div>
            ))}
          </div>
        )}
        {d && <p className="mt-3 text-[11px] text-muted">{d.note}</p>}
        <div className="mt-2"><DataFreshness meta={data?.meta} /></div>
      </CardContent>
    </Card>
  );
}
