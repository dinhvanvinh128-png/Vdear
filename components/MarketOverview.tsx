'use client';
import { useApi } from '@/hooks/useApi';
import type { Envelope } from '@/lib/types';
import type { MarketOverview as Overview } from '@/lib/services/market';
import { Stat, DataFreshness, Skeleton } from '@/components/common';
import { fmtCompact, fmtPct } from '@/lib/format';

const FG_TONE = (v: number) => (v >= 55 ? 'up' : v <= 45 ? 'down' : 'warn') as 'up' | 'down' | 'warn';

export function MarketOverview() {
  const { data, loading } = useApi<Envelope<Overview>>('/api/market', 10000);
  const o = data?.data;

  if (loading && !o) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[74px]" />)}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat
          label="Total Market Cap"
          value={o?.totalMarketCapUsd != null ? fmtCompact(o.totalMarketCapUsd, '$') : 'N/A'}
          sub={o?.marketCapChange24h != null ? fmtPct(o.marketCapChange24h) : undefined}
          tone={o?.marketCapChange24h != null ? (o.marketCapChange24h >= 0 ? 'up' : 'down') : undefined}
        />
        <Stat label="24H Volume (Fut.)" value={fmtCompact(o?.totalVolume24hUsd ?? 0, '$')} />
        <Stat label="BTC Dominance" value={o?.btcDominance != null ? `${o.btcDominance.toFixed(1)}%` : 'N/A'} />
        <Stat label="ETH Dominance" value={o?.ethDominance != null ? `${o.ethDominance.toFixed(1)}%` : 'N/A'} />
        <Stat label="Open Interest" value={fmtCompact(o?.openInterestUsd ?? 0, '$')} tone="info" />
        <Stat
          label="Fear & Greed"
          value={o?.fearGreed ? `${o.fearGreed.value}` : 'N/A'}
          sub={o?.fearGreed?.label}
          tone={o?.fearGreed ? FG_TONE(o.fearGreed.value) : undefined}
        />
      </div>
      <DataFreshness meta={data?.meta} />
    </div>
  );
}
