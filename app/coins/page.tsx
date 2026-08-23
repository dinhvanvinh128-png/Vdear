import type { Metadata } from 'next';
import { CoinsClient } from '@/app/coins/CoinsClient';

/**
 * Server wrapper so this route can carry its own metadata. The interactive view
 * lives in CoinsClient, which keeps its own Suspense boundary because
 * useSearchParams() requires one during static prerender.
 */
export const metadata: Metadata = {
  title: 'All Coins',
  description:
    'Every USDT market aggregated across Binance, OKX, Bybit and Bitget, with a composite index '
    + 'price, cross-venue spread, funding and open interest. Filter to gainers or losers.',
};

export default function Page() {
  return <CoinsClient />;
}
