import type { Metadata } from 'next';
import { MoneyFlowClient } from '@/app/money-flow/MoneyFlowClient';

/**
 * Server wrapper so this route can carry its own metadata — a client component
 * cannot export one. The interactive view lives in MoneyFlowClient.
 */
export const metadata: Metadata = {
  title: 'Money Flow',
  description:
    'Where crypto capital is moving. A weighted Money Flow Score built from spot CVD, market breadth, stablecoin liquidity, on-chain activity and whale flow — with the coverage and confidence behind every number.',
};

export default function Page() {
  return <MoneyFlowClient />;
}
