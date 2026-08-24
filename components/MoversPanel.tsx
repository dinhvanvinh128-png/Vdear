'use client';
import Link from 'next/link';
import { Flame, TrendingUp, TrendingDown, type LucideIcon } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import type { Envelope } from '@/lib/types';
import type { MarketOverview } from '@/lib/services/market';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmtPrice, fmtPct } from '@/lib/format';
import { Skeleton } from '@/components/common';
import type { AggregatedTicker } from '@/lib/types';

function List({ title, icon: Icon, coins }: { title: string; icon: LucideIcon; coins: AggregatedTicker[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-1.5">
        <Icon className="h-4 w-4 text-muted" aria-hidden /> {title}
      </CardTitle></CardHeader>
      <CardContent className="space-y-1">
        {coins.length === 0 && <Skeleton className="h-24 w-full" />}
        {coins.map((c) => {
          const up = c.priceChange24h >= 0;
          return (
            <Link key={c.symbol} href={`/coin/${c.base}`}
              className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-panel-2">
              <span className="font-semibold text-sm">{c.base}</span>
              <span className="flex items-center gap-3 text-sm">
                <span className="tnum text-muted">${fmtPrice(c.vdearIndex)}</span>
                <span className={cnPct(up)}>{fmtPct(c.priceChange24h)}</span>
              </span>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
const cnPct = (up: boolean) => `tnum w-20 text-right ${up ? 'text-up' : 'text-down'}`;

export function MoversPanel() {
  const { data } = useApi<Envelope<MarketOverview>>('/api/market', 10000);
  const o = data?.data;
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <List title="Trending (Volume)" icon={Flame} coins={o?.trending ?? []} />
      <List title="Top Gainers" icon={TrendingUp} coins={o?.topGainers ?? []} />
      <List title="Top Losers" icon={TrendingDown} coins={o?.topLosers ?? []} />
    </div>
  );
}
