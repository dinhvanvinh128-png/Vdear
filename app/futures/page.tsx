'use client';
import { useApi } from '@/hooks/useApi';
import type { AggregatedTicker, Envelope } from '@/lib/types';
import { PageHeader } from '@/components/PageHeader';
import { CoinTable } from '@/components/CoinTable';
import { Stat } from '@/components/common';
import { fmtCompact } from '@/lib/format';

export default function FuturesPage() {
  const { data } = useApi<Envelope<AggregatedTicker[]> & { totals?: { openInterestUsd: number; volume24hUsd: number } }>(
    '/api/futures?limit=300', 12000,
  );
  const totals = data?.totals;
  return (
    <div className="space-y-4">
      <PageHeader title="Futures" subtitle="USDT perpetuals — funding, open interest and volume across exchanges" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Total Open Interest" value={fmtCompact(totals?.openInterestUsd ?? 0, '$')} tone="info" />
        <Stat label="24H Volume" value={fmtCompact(totals?.volume24hUsd ?? 0, '$')} />
        <Stat label="Contracts Tracked" value={data?.data.length ?? '—'} />
      </div>
      <CoinTable endpoint="/api/futures?limit=300" showFunding showOI pageSize={30} />
    </div>
  );
}
