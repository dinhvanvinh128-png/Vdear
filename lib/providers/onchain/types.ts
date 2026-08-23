/**
 * The on-chain abstraction (spec: ON-CHAIN DATA — "Không phụ thuộc Coin Metrics
 * duy nhất", design an `OnChainProvider` so Glassnode / CryptoQuant / Artemis /
 * Dune / Flipside / raw RPC can be added later).
 *
 * Consumers ask for a METRIC, not a vendor. The resolver walks a preference
 * chain and returns the first provider that actually answers, along with WHICH
 * one answered — so the UI can show provenance and the confidence layer can
 * weigh a premium first-party source above a free aggregate one.
 */
import type { ProviderId } from '@/lib/providers/types';
import type { SourceKind } from '@/lib/quality/confidence';

export interface OnChainPoint {
  time: number; // ms epoch
  value: number;
}

/** Vendor-neutral metric names. Each provider maps these onto its own IDs. */
export type OnChainMetric =
  | 'activeAddresses'
  | 'newAddresses'
  | 'txCount'
  | 'transferValueUsd'
  | 'feesUsd'
  | 'supplyCurrent'
  | 'exchangeInflow'
  | 'exchangeOutflow'
  | 'exchangeNetflow'
  | 'exchangeReserve'
  | 'mvrv'
  | 'sopr';

export interface OnChainSeries {
  metric: OnChainMetric;
  asset: string;
  points: OnChainPoint[];
  /** Which vendor actually served this. */
  source: ProviderId;
  kind: SourceKind;
}

export interface OnChainProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** Metrics this vendor can serve at all (before plan/key checks). */
  readonly supports: readonly OnChainMetric[];
  configured(): boolean;
  fetch(metric: OnChainMetric, asset: string, days: number): Promise<OnChainSeries | null>;
}

export interface OnChainResolution {
  series: OnChainSeries | null;
  /** Every provider tried, and why it did not answer. Shown on /status. */
  attempts: { provider: ProviderId; outcome: 'ok' | 'not_configured' | 'unsupported' | 'failed'; message?: string }[];
}
