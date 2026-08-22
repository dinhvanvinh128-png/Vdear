import { PageHeader } from '@/components/PageHeader';
import { MarketHeatmap } from '@/components/MarketHeatmap';

export const metadata = { title: 'Market Heatmap' };

export default function HeatmapPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Market Heatmap" subtitle="24h performance across the top USDT perpetuals, colored by change" />
      <MarketHeatmap limit={96} />
    </div>
  );
}
