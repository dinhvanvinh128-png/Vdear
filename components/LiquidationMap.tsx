'use client';
import { useState } from 'react';
import { useApi } from '@/hooks/useApi';
import type { Envelope } from '@/lib/types';
import type { LiquidationMapResult } from '@/lib/services/derivatives';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fmtPrice, fmtCompact } from '@/lib/format';
import { Skeleton, DataFreshness } from '@/components/common';

/** Vertical liquidation map: short zones above price, long zones below. */
export function LiquidationMap({ coin }: { coin: string }) {
  const { data, loading } = useApi<Envelope<LiquidationMapResult>>(`/api/liquidations/map?coin=${coin}`, 20000);
  const [selected, setSelected] = useState<number | null>(null);
  const res = data?.data;
  const map = res?.map;

  const maxVal = map
    ? Math.max(1, ...[...map.longZones, ...map.shortZones].map((z) => z.estValueUsd))
    : 1;

  const Row = ({ price, value, side, i }: { price: number; value: number; side: 'long' | 'short'; i: number }) => {
    const pct = (value / maxVal) * 100;
    const active = selected === i;
    return (
      <button
        onClick={() => setSelected(active ? null : i)}
        className="flex w-full items-center gap-2 py-0.5 text-left"
      >
        <span className="w-24 shrink-0 text-right text-xs tnum text-muted">${fmtPrice(price)}</span>
        <span className="relative h-4 flex-1 overflow-hidden rounded bg-panel-2">
          <span
            className={side === 'short' ? 'absolute inset-y-0 left-0 bg-down/70' : 'absolute inset-y-0 left-0 bg-up/70'}
            style={{ width: `${Math.max(3, pct)}%` }}
          />
        </span>
        <span className="w-20 shrink-0 text-xs tnum text-muted">{fmtCompact(value, '$')}</span>
      </button>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{coin} Liquidation Map</CardTitle>
        {res && <Badge variant={res.source === 'coinglass' ? 'info' : 'warn'}>{res.source === 'coinglass' ? 'CoinGlass' : 'Estimated'}</Badge>}
      </CardHeader>
      <CardContent>
        {loading && !map && <Skeleton className="h-72 w-full" />}
        {map && (
          <>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-down">Short liquidation zones ▲</div>
            {map.shortZones.map((z, i) => <Row key={`s${i}`} price={z.price} value={z.estValueUsd} side="short" i={i} />)}

            <div className="my-3 flex items-center justify-between rounded-lg border border-brand/40 bg-brand/10 px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Current price</span>
              <span className="text-lg font-bold tnum text-brand">${fmtPrice(map.currentPrice)}</span>
            </div>

            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-up">Long liquidation zones ▼</div>
            {map.longZones.map((z, i) => <Row key={`l${i}`} price={z.price} value={z.estValueUsd} side="long" i={i + 100} />)}

            <p className="mt-3 text-[11px] text-muted">{res?.note}</p>
            <div className="mt-2"><DataFreshness meta={data?.meta} /></div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
