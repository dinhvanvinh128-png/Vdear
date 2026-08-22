'use client';
import { Star } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { useFavorites } from '@/hooks/useFavorites';
import type { AggregatedTicker, Envelope } from '@/lib/types';
import { fmtPrice, fmtCompact, fmtPct, fmtFunding } from '@/lib/format';
import { DataFreshness, Skeleton } from '@/components/common';
import { cn } from '@/lib/utils';

export function CoinHeader({ base }: { base: string }) {
  const { data, loading } = useApi<Envelope<AggregatedTicker>>(`/api/coins/${base}?market=futures`, 5000);
  const { has, toggle } = useFavorites();
  const c = data?.data;

  if (loading && !c) return <Skeleton className="h-24 w-full" />;

  const up = (c?.priceChange24h ?? 0) >= 0;
  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => toggle(base)} aria-label="favorite" className="text-muted hover:text-warn">
            <Star className={cn('h-6 w-6', has(base) && 'fill-warn text-warn')} />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold">{base} <span className="text-muted">/ USDT</span></h1>
            <div className="text-xs text-muted">Perpetual · aggregated</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black tnum">${c ? fmtPrice(c.vdearIndex) : '—'}</div>
          <div className={cn('text-sm font-semibold tnum', up ? 'text-up' : 'text-down')}>
            {c ? fmtPct(c.priceChange24h) : '—'} (24h)
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Metric label="24h High" value={c ? `$${fmtPrice(c.high24h)}` : '—'} />
        <Metric label="24h Low" value={c ? `$${fmtPrice(c.low24h)}` : '—'} />
        <Metric label="24h Volume" value={c ? fmtCompact(c.volume24h, '$') : '—'} />
        <Metric label="Funding (avg)" value={c?.fundingRate != null ? fmtFunding(c.fundingRate) : 'N/A'} />
      </div>
      <div className="mt-3"><DataFreshness meta={data?.meta} /></div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-panel-2 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 font-semibold tnum">{value}</div>
    </div>
  );
}
