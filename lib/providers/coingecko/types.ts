/** CoinGecko response shapes we depend on (public API v3). */

export interface GlobalMarket {
  totalMarketCapUsd: number;
  totalVolumeUsd: number;
  marketCapChange24h: number;
  btcDominance: number;
  ethDominance: number;
  activeCryptocurrencies: number;
  markets: number;
}

/** One row of /coins/markets. */
export interface CoinMarket {
  id: string;
  symbol: string;   // lowercase, e.g. "btc"
  name: string;
  image: string;
  price: number;
  marketCap: number;
  marketCapRank: number | null;
  fullyDilutedValuation: number | null;
  volume24h: number;
  change1h: number | null;
  change24h: number | null;
  change7d: number | null;
  change30d: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  ath: number | null;
  athChangePct: number | null;
  atl: number | null;
  lastUpdated: number;
}

/** One row of /coins/categories — the basis of sector rotation. */
export interface CoinCategory {
  id: string;
  name: string;
  marketCap: number | null;
  marketCapChange24h: number | null;
  volume24h: number | null;
  topCoins: string[];
  updatedAt: number | null;
}
