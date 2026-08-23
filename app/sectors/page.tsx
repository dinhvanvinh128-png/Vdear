import type { Metadata } from 'next';
import { SectorsClient } from '@/app/sectors/SectorsClient';

/**
 * Server wrapper so this route can carry its own metadata — a client component
 * cannot export one. The interactive view lives in SectorsClient.
 */
export const metadata: Metadata = {
  title: 'Sector Rotation',
  description:
    'Which crypto sectors money is rotating into: Layer 1, Layer 2, DeFi, AI, RWA, Meme, Gaming, DePIN, Infrastructure and Oracle, ranked by market-cap weighted momentum and turnover.',
};

export default function Page() {
  return <SectorsClient />;
}
