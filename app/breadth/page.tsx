import type { Metadata } from 'next';
import { BreadthClient } from '@/app/breadth/BreadthClient';

/**
 * Server wrapper so this route can carry its own metadata — a client component
 * cannot export one. The interactive view lives in BreadthClient.
 */
export const metadata: Metadata = {
  title: 'Market Breadth',
  description:
    'How much of the crypto market is actually participating, not just what BTC is doing. Percent advancing, share above the 20/50/200-day averages, advance-decline and volume breadth across the full USDT universe.',
};

export default function Page() {
  return <BreadthClient />;
}
