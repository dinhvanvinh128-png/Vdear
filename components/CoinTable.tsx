'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Star, ArrowUpDown, Search } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { useFavorites } from '@/hooks/useFavorites';
import type { AggregatedTicker, Envelope } from '@/lib/types';
import { fmtPrice, fmtCompact, fmtPct, fmtFunding } from '@/lib/format';
import { DataFreshness, Skeleton, ErrorState } from '@/components/common';
import { cn } from '@/lib/utils';

type SortKey = 'volume24h' | 'priceChange24h' | 'vdearIndex' | 'fundingRate' | 'openInterest';

interface Props {
  endpoint: string;
  intervalMs?: number;
  showFunding?: boolean;
  showOI?: boolean;
  pageSize?: number;
  filter?: (c: AggregatedTicker) => boolean;
  favoritesOnly?: boolean;
}

export function CoinTable({
  endpoint, intervalMs = 12000, showFunding, showOI, pageSize = 25, filter, favoritesOnly,
}: Props) {
  const { data, loading, error } = useApi<Envelope<AggregatedTicker[]>>(endpoint, intervalMs);
  const { has, toggle, favs } = useFavorites();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('volume24h');
  const [dir, setDir] = useState<-1 | 1>(-1);
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    let list = data?.data ?? [];
    if (filter) list = list.filter(filter);
    if (favoritesOnly) list = list.filter((c) => favs.includes(c.base));
    if (q.trim()) {
      const s = q.trim().toUpperCase();
      list = list.filter((c) => c.base.includes(s) || c.symbol.includes(s));
    }
    list = [...list].sort((a, b) => {
      const av = (a[sort] ?? 0) as number;
      const bv = (b[sort] ?? 0) as number;
      return (av - bv) * dir;
    });
    return list;
  }, [data, filter, favoritesOnly, favs, q, sort, dir]);

  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const view = rows.slice(page * pageSize, page * pageSize + pageSize);

  const onSort = (k: SortKey) => {
    if (k === sort) setDir((d) => (d === -1 ? 1 : -1));
    else { setSort(k); setDir(-1); }
    setPage(0);
  };

  const Th = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => (
    <th className={cn('cursor-pointer select-none px-3 py-2 text-right font-medium hover:text-text', className)} onClick={() => onSort(k)}>
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={cn('h-3 w-3', sort === k ? 'text-brand' : 'text-muted/50')} />
      </span>
    </th>
  );

  if (error && !data) return <ErrorState message={error} />;

  return (
    <div className="rounded-xl border border-border bg-panel">
      <div className="flex items-center justify-between gap-3 border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
            placeholder="Search…"
            className="h-9 w-40 rounded-lg border border-border bg-panel-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-brand/40 sm:w-56"
          />
        </div>
        <span className="text-xs text-muted">{rows.length} coins</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left font-medium">Coin</th>
              <Th k="vdearIndex" label="Price (VDEAR)" />
              <Th k="priceChange24h" label="24H %" />
              <Th k="volume24h" label="Volume" />
              {showFunding && <Th k="fundingRate" label="Funding" />}
              {showOI && <Th k="openInterest" label="Open Interest" />}
              <th className="px-3 py-2 text-right font-medium">Sources</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data && Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-border/60">
                <td className="px-3 py-2" colSpan={7}><Skeleton className="h-5 w-full" /></td>
              </tr>
            ))}
            {view.map((c) => {
              const up = c.priceChange24h >= 0;
              return (
                <tr key={c.symbol} className="border-b border-border/60 hover:bg-panel-2/60">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggle(c.base)} aria-label="favorite" className="text-muted hover:text-warn">
                        <Star className={cn('h-4 w-4', has(c.base) && 'fill-warn text-warn')} />
                      </button>
                      <Link href={`/coin/${c.base}`} className="font-semibold hover:text-brand">{c.base}</Link>
                      <span className="text-xs text-muted">{c.quote}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tnum">${fmtPrice(c.vdearIndex)}</td>
                  <td className={cn('px-3 py-2 text-right tnum', up ? 'text-up' : 'text-down')}>{fmtPct(c.priceChange24h)}</td>
                  <td className="px-3 py-2 text-right tnum text-muted">{fmtCompact(c.volume24h, '$')}</td>
                  {showFunding && (
                    <td className={cn('px-3 py-2 text-right tnum', (c.fundingRate ?? 0) >= 0 ? 'text-up' : 'text-down')}>
                      {c.fundingRate != null ? fmtFunding(c.fundingRate) : 'N/A'}
                    </td>
                  )}
                  {showOI && (
                    <td className="px-3 py-2 text-right tnum text-muted">
                      {c.openInterest != null ? fmtCompact(c.openInterest, '$') : 'N/A'}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right text-xs text-muted">{c.sources.length}/4</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border p-3 text-xs">
        <DataFreshness meta={data?.meta} />
        <div className="flex items-center gap-2">
          <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-md border border-border px-2 py-1 disabled:opacity-40">Prev</button>
          <span className="text-muted">{page + 1} / {pages}</span>
          <button disabled={page >= pages - 1} onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            className="rounded-md border border-border px-2 py-1 disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  );
}
