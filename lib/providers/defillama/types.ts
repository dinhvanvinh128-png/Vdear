/** DeFiLlama — stablecoin supply, chain TVL and DEX volume. */

export interface StablecoinAsset {
  id: string;
  name: string;
  symbol: string;
  pegType: string;
  /** Circulating supply in USD terms. */
  circulating: number;
  circulatingPrevDay: number;
  circulatingPrevWeek: number;
  circulatingPrevMonth: number;
  chains: string[];
}

export interface StablecoinSupply {
  totalUsd: number;
  totalPrevDay: number;
  totalPrevWeek: number;
  totalPrevMonth: number;
  /** Percent change over each window. Null when the base is missing/zero. */
  change1d: number | null;
  change7d: number | null;
  change30d: number | null;
  assets: StablecoinAsset[];
  /** Supply by chain, descending. */
  byChain: { chain: string; usd: number; share: number }[];
  observedAt: number;
}

export interface ChainTvl {
  name: string;
  tvl: number;
  geckoId: string | null;
  tokenSymbol: string | null;
}

export interface TvlSnapshot {
  totalUsd: number;
  chains: ChainTvl[];
  /** Percent change from the historical series, when it is available. */
  change1d: number | null;
  change7d: number | null;
  change30d: number | null;
  observedAt: number;
}

export interface DexVolume {
  total24h: number;
  total7d: number;
  change1d: number | null;
  change7d: number | null;
  /** Top protocols by 24h volume. */
  protocols: { name: string; volume24h: number; change1d: number | null }[];
  observedAt: number;
}
