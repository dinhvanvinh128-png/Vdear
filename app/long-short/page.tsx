'use client';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { CoinPicker } from '@/components/CoinPicker';
import { CoinDerivatives } from '@/components/coin/CoinDerivatives';

export default function LongShortPage() {
  const [coin, setCoin] = useState('BTC');
  return (
    <div className="space-y-4">
      <PageHeader
        title="Long / Short Ratio"
        subtitle="Account long/short ratio per exchange (where the venue publishes it)"
        right={<CoinPicker value={coin} onChange={setCoin} />}
      />
      <CoinDerivatives base={coin} />
      <p className="text-xs text-muted">
        Long/short ratios come from each exchange&apos;s public statistics endpoint and cover accounts,
        not notional. Not all venues publish this — missing sources show as N/A.
      </p>
    </div>
  );
}
