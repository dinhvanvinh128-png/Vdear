import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { MarketOverview } from '@/components/MarketOverview';
import { CoinTable } from '@/components/CoinTable';

export const metadata: Metadata = {
  title: 'Markets',
  description:
    'Global crypto market overview — total market cap, dominance, volume and every USDT spot '
    + 'market aggregated across Binance, OKX, Bybit and Bitget.',
};

export default function MarketsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Global Market"
        subtitle="Total market cap, dominance and volume, plus every USDT market aggregated across venues"
      />
      <MarketOverview />
      <CoinTable endpoint="/api/coins?market=spot&limit=200" pageSize={25} />
    </div>
  );
}
