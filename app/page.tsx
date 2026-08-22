import { MarketOverview } from '@/components/MarketOverview';
import { MoversPanel } from '@/components/MoversPanel';
import { CoinTable } from '@/components/CoinTable';
import { PageHeader } from '@/components/PageHeader';

export default function HomePage() {
  return (
    <div className="space-y-6">
      <section className="aurora -mx-4 -mt-5 px-4 pb-4 pt-6">
        <div className="mx-auto max-w-7xl">
          <PageHeader
            title="Market Dashboard"
            subtitle="Real-time multi-exchange intelligence — Binance · OKX · Bybit · Bitget"
          />
          <MarketOverview />
        </div>
      </section>

      <MoversPanel />

      <section>
        <PageHeader title="Futures Market" subtitle="Top USDT perpetuals by 24h volume, aggregated across exchanges" />
        <CoinTable endpoint="/api/futures?limit=100" showFunding showOI pageSize={20} />
      </section>
    </div>
  );
}
