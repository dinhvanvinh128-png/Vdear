'use client';
import Link from 'next/link';
import { useApi } from '@/hooks/useApi';
import type { AggregatedTicker, Envelope } from '@/lib/types';
import { fmtPrice, fmtCompact, fmtPct } from '@/lib/format';

/** Horizontal auto-scrolling ticker (drag/scroll on mobile). No 3rd-party widget. */
export function TickerBar() {
  const { data } = useApi<Envelope<AggregatedTicker[]>>('/api/tickerbar', 5000);
  const coins = data?.data ?? [];
  const items = coins.length ? coins : [];

  return (
    <div className="h-[46px] overflow-x-auto border-b border-border bg-panel/50">
      <div className="flex h-full items-center gap-5 whitespace-nowrap px-4">
        {items.length === 0 && <span className="text-xs text-muted">Loading market ticker…</span>}
        {items.map((c) => {
          const up = c.priceChange24h >= 0;
          return (
            <Link key={c.symbol} href={`/coin/${c.base}`} className="flex items-center gap-1.5 text-xs">
              <span className="font-semibold text-text">{c.base}</span>
              <span className="tnum text-muted">${fmtPrice(c.vdearIndex)}</span>
              <span className={up ? 'tnum text-up' : 'tnum text-down'}>{fmtPct(c.priceChange24h)}</span>
              <span className="tnum text-muted/60">Vol {fmtCompact(c.volume24h, '$')}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
