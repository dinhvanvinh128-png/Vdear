import type { Metadata } from 'next';
import { WhalesClient } from '@/app/whales/WhalesClient';

/**
 * Server wrapper so this route can carry its own metadata — a client component
 * cannot export one. The interactive view lives in WhalesClient.
 */
export const metadata: Metadata = {
  title: 'Whale Activity',
  description:
    'Large executed fills across Binance, OKX, Bybit and Bitget, bucketed from $100K to $10M+, plus exchange inflow and outflow where a provider is configured.',
};

export default function Page() {
  return <WhalesClient />;
}
