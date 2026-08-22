'use client';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { CoinPicker } from '@/components/CoinPicker';
import { LiquidationMap } from '@/components/LiquidationMap';

export default function LiquidationMapPage() {
  const [coin, setCoin] = useState('BTC');
  return (
    <div className="space-y-4">
      <PageHeader
        title="Liquidation Map"
        subtitle="Estimated liquidation clusters above and below the current price"
        right={<CoinPicker value={coin} onChange={setCoin} />}
      />
      <div className="max-w-2xl"><LiquidationMap coin={coin} /></div>
    </div>
  );
}
