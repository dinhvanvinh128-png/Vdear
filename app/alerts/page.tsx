import type { Metadata } from 'next';
import { AlertsClient } from '@/app/alerts/AlertsClient';

/**
 * Server wrapper so this route can carry its own metadata — a client component
 * cannot export one. The interactive view lives in AlertsClient.
 */
export const metadata: Metadata = {
  title: 'Market Alerts',
  description:
    'Conditions detected live from the scoring engines: CVD spikes, volume anomalies, whale flow, exchange in/outflow, stablecoin shifts, breadth breakouts and regime changes.',
};

export default function Page() {
  return <AlertsClient />;
}
