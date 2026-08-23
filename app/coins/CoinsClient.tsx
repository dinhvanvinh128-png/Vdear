'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { CoinTable } from '@/components/CoinTable';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

function CoinsInner() {
  const sp = useSearchParams();
  const tab = sp.get('tab') || 'all';
  const filter = tab === 'gainers'
    ? (c: { priceChange24h: number; volume24h: number }) => c.priceChange24h > 0 && c.volume24h > 1_000_000
    : tab === 'losers'
      ? (c: { priceChange24h: number; volume24h: number }) => c.priceChange24h < 0 && c.volume24h > 1_000_000
      : undefined;

  return (
    <div className="space-y-4">
      <PageHeader
        title="All Coins"
        subtitle="USDT markets aggregated across Binance, OKX, Bybit and Bitget"
        right={
          <div className="flex gap-1">
            <Link href="/coins"><Button size="sm" active={tab === 'all'}>All</Button></Link>
            <Link href="/coins?tab=gainers"><Button size="sm" active={tab === 'gainers'}>Gainers</Button></Link>
            <Link href="/coins?tab=losers"><Button size="sm" active={tab === 'losers'}>Losers</Button></Link>
          </div>
        }
      />
      <CoinTable endpoint="/api/coins?market=futures&limit=400" showFunding pageSize={30} filter={filter} />
    </div>
  );
}

export function CoinsClient() {
  return (
    <Suspense fallback={<div className="text-sm text-muted">Loading…</div>}>
      <CoinsInner />
    </Suspense>
  );
}
