'use client';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { CoinPicker } from '@/components/CoinPicker';
import { CoinDerivatives } from '@/components/coin/CoinDerivatives';
import { CoinTable } from '@/components/CoinTable';

export default function FundingPage() {
  const [coin, setCoin] = useState('BTC');
  return (
    <div className="space-y-4">
      <PageHeader
        title="Funding Rate"
        subtitle="Per-exchange funding + Vdearypto average. High funding ≠ a guaranteed reversal."
        right={<CoinPicker value={coin} onChange={setCoin} />}
      />
      <CoinDerivatives base={coin} />
      <PageHeader title="Funding across markets" subtitle="Sort by funding to surface extreme positive/negative rates" />
      <CoinTable endpoint="/api/futures?limit=300" showFunding showOI pageSize={30} />
    </div>
  );
}
