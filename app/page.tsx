import type { Metadata } from 'next';
import { IntelligenceDashboard } from '@/components/intelligence/IntelligenceDashboard';
import { MarketOverview } from '@/components/MarketOverview';
import { MoversPanel } from '@/components/MoversPanel';
import { PageHeader } from '@/components/PageHeader';

export const metadata: Metadata = {
  title: 'Crypto Market Intelligence',
  description:
    'Spot-flow-driven crypto market intelligence: CVD, market breadth, stablecoin liquidity, '
    + 'on-chain activity, whale flow and market regime — scored from real exchange and on-chain data.',
};

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="-mx-4 -mt-5 border-b border-border px-4 pb-6 pt-6">
        <div className="mx-auto max-w-7xl">
          <PageHeader
            title="Vdearypto — Crypto Intelligence Terminal"
            subtitle="Dữ liệu → bằng chứng → điểm số → trạng thái → giải thích. Spot dẫn dắt; phái sinh xác nhận."
          />
          <IntelligenceDashboard symbol="BTC" />
        </div>
      </section>

      <section>
        <PageHeader title="Toàn thị trường" subtitle="Vốn hoá, thị phần và hoạt động 24h" />
        <MarketOverview />
      </section>

      <MoversPanel />
    </div>
  );
}
