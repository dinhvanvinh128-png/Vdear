'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useApi } from '@/hooks/useApi';
import type { Envelope } from '@/lib/types';
import { PageHeader } from '@/components/PageHeader';
import { CoinPicker } from '@/components/CoinPicker';
import { LiquidationMap } from '@/components/LiquidationMap';
import { LiquidationHeatmap } from '@/components/LiquidationHeatmap';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fmtCompact, fmtPct, fmtPrice } from '@/lib/format';
import { Skeleton } from '@/components/common';

interface LiqOverview {
  source: string;
  byOpenInterest: { symbol: string; base: string; price: number; openInterestUsd: number; change24h: number }[];
  note: string;
}

export default function LiquidationsPage() {
  const [coin, setCoin] = useState('BTC');
  const { data, loading } = useApi<Envelope<LiqOverview>>('/api/liquidations', 20000);
  const o = data?.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Liquidations"
        subtitle="Liquidation map, heatmap and open-interest exposure across exchanges"
        right={<CoinPicker value={coin} onChange={setCoin} />}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <LiquidationMap coin={coin} />
        <LiquidationHeatmap coin={coin} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Open-Interest Exposure (risk proxy)</CardTitle>
          {o && <Badge variant={o.source === 'coinglass' ? 'info' : 'warn'}>{o.source === 'coinglass' ? 'CoinGlass' : 'Estimated'}</Badge>}
        </CardHeader>
        <CardContent>
          {loading && !o && <Skeleton className="h-56 w-full" />}
          {o && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-border">
                    <th className="px-2 py-2 text-left font-medium">Coin</th>
                    <th className="px-2 py-2 text-right font-medium">Price</th>
                    <th className="px-2 py-2 text-right font-medium">Open Interest</th>
                    <th className="px-2 py-2 text-right font-medium">24H %</th>
                  </tr>
                </thead>
                <tbody>
                  {o.byOpenInterest.map((c) => (
                    <tr key={c.symbol} className="border-b border-border/60 hover:bg-panel-2/60">
                      <td className="px-2 py-2"><Link href={`/coin/${c.base}`} className="font-semibold hover:text-brand">{c.base}</Link></td>
                      <td className="px-2 py-2 text-right tnum">${fmtPrice(c.price)}</td>
                      <td className="px-2 py-2 text-right tnum text-info">{fmtCompact(c.openInterestUsd, '$')}</td>
                      <td className={`px-2 py-2 text-right tnum ${c.change24h >= 0 ? 'text-up' : 'text-down'}`}>{fmtPct(c.change24h)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-[11px] text-muted">{o.note}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
