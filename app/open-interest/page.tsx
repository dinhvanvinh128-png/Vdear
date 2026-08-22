'use client';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { CoinPicker } from '@/components/CoinPicker';
import { OpenInterestChart } from '@/components/OpenInterestChart';
import { CoinTable } from '@/components/CoinTable';

export default function OpenInterestPage() {
  const [coin, setCoin] = useState('BTC');
  return (
    <div className="space-y-4">
      <PageHeader
        title="Open Interest"
        subtitle="Aggregate perpetual open interest — history from Binance, live totals across exchanges"
        right={<CoinPicker value={coin} onChange={setCoin} />}
      />
      <OpenInterestChart base={coin} />
      <PageHeader title="Open interest by coin" subtitle="Sort by OI to see where leverage is concentrated" />
      <CoinTable endpoint="/api/futures?limit=300" showOI showFunding pageSize={25} />
    </div>
  );
}
