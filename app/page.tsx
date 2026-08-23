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
      <section className="aurora -mx-4 -mt-5 px-4 pb-5 pt-6">
        <div className="mx-auto max-w-7xl">
          <PageHeader
            title="VDEAR — Crypto Market Intelligence"
            subtitle="Data → evidence → score → regime → explanation. Spot flow first; derivatives confirm."
          />
          <IntelligenceDashboard symbol="BTC" />
        </div>
      </section>

      <section>
        <PageHeader title="Global Market" subtitle="Total market cap, dominance and 24h activity" />
        <MarketOverview />
      </section>

      <MoversPanel />
    </div>
  );
}
