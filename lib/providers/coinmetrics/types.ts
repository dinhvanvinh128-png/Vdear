/**
 * Coin Metrics Community API v4 — the free on-chain backbone.
 *
 * Metric IDs are Coin Metrics' own. Only the community subset is used, so this
 * works with no key at all; COINMETRICS_API_KEY simply raises the rate limit and
 * unlocks the wider Pro catalogue.
 */

export const CM_METRICS = {
  activeAddresses: 'AdrActCnt',
  newAddresses: 'AdrNewCnt',
  txCount: 'TxCnt',
  transferValueUsd: 'TxTfrValAdjUSD',
  feesUsd: 'FeeTotUSD',
  supplyCurrent: 'SplyCur',
  marketCapUsd: 'CapMrktCurUSD',
  priceUsd: 'PriceUSD',
} as const;

export type CmMetricKey = keyof typeof CM_METRICS;

/** One daily observation of one metric. */
export interface CmPoint {
  time: number; // ms epoch
  value: number;
}

export interface CmSeries {
  asset: string;
  metric: CmMetricKey;
  metricId: string;
  points: CmPoint[];
}

/** Everything the on-chain engine needs for one asset. */
export interface OnChainSnapshot {
  asset: string;
  series: Partial<Record<CmMetricKey, CmPoint[]>>;
  observedAt: number;
}
