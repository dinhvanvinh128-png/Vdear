'use client';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { CoinPicker } from '@/components/CoinPicker';
import { LiquidationHeatmap } from '@/components/LiquidationHeatmap';

export default function LiquidationHeatmapPage() {
  const [coin, setCoin] = useState('BTC');
  return (
    <div className="space-y-4">
      <PageHeader
        title="Liquidation Heatmap"
        subtitle="Estimated liquidation intensity by price band (CoinGlass when configured)"
        right={<CoinPicker value={coin} onChange={setCoin} />}
      />
      <div className="max-w-2xl"><LiquidationHeatmap coin={coin} /></div>
    </div>
  );
}
