import type { Metadata } from 'next';
import { OnChainClient } from '@/app/onchain/OnChainClient';

/**
 * Server wrapper so this route can carry its own metadata — a client component
 * cannot export one. The interactive view lives in OnChainClient.
 */
export const metadata: Metadata = {
  title: 'On-chain Activity',
  description:
    'Active and new addresses, transaction count, transfer value and fees — scored against each asset own 30-day baseline rather than against absolute thresholds.',
};

export default function Page() {
  return <OnChainClient />;
}
