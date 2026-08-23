import type { Metadata } from 'next';
import { LiquidityClient } from '@/app/liquidity/LiquidityClient';

/**
 * Server wrapper so this route can carry its own metadata — a client component
 * cannot export one. The interactive view lives in LiquidityClient.
 */
export const metadata: Metadata = {
  title: 'Liquidity',
  description:
    'Order book depth at 0.25%, 0.5%, 1% and 2% from mid, spread, stablecoin supply and DEX liquidity — how much size this market can absorb, and whether liquidity is expanding or contracting.',
};

export default function Page() {
  return <LiquidityClient />;
}
