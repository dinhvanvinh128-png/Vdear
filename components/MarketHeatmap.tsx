'use client';
import Link from 'next/link';
import { useApi } from '@/hooks/useApi';
import type { Envelope } from '@/lib/types';
import { fmtPct } from '@/lib/format';
import { Skeleton, DataFreshness } from '@/components/common';

interface Cell { symbol: string; base: string; price: number; change24h: number; volume24h: number }

function color(change: number): string {
  const clamped = Math.max(-10, Math.min(10, change));
  const a = 0.15 + (Math.abs(clamped) / 10) * 0.75;
  return change >= 0 ? `rgba(22,199,132,${a})` : `rgba(255,76,97,${a})`;
}

export function MarketHeatmap({ limit = 80 }: { limit?: number }) {
  const { data, loading } = useApi<Envelope<Cell[]>>(`/api/heatmap?limit=${limit}`, 15000);
  const cells = data?.data ?? [];

  if (loading && !data) return <Skeleton className="h-96 w-full" />;

  return (
    <div>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {cells.map((c) => (
          <Link
            key={c.symbol}
            href={`/coin/${c.base}`}
            className="flex aspect-[4/3] flex-col items-center justify-center rounded-lg border border-border/60 p-1 text-center transition-transform hover:scale-[1.03]"
            style={{ background: color(c.change24h) }}
          >
            <span className="text-xs font-bold">{c.base}</span>
            <span className="text-[11px] tnum">{fmtPct(c.change24h)}</span>
          </Link>
        ))}
      </div>
      <div className="mt-3"><DataFreshness meta={data?.meta} /></div>
    </div>
  );
}
