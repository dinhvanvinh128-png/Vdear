/** GeckoTerminal — on-chain DEX pool activity. */

export interface DexPool {
  id: string;
  name: string;
  network: string;
  dex: string | null;
  /** Pool liquidity in USD ("reserve"). */
  reserveUsd: number;
  volume24h: number;
  priceChange24h: number | null;
  buys24h: number;
  sells24h: number;
  buyers24h: number;
  sellers24h: number;
}

export interface DexActivity {
  network: string;
  pools: DexPool[];
  totalLiquidityUsd: number;
  totalVolume24h: number;
  totalBuys24h: number;
  totalSells24h: number;
  totalBuyers24h: number;
  totalSellers24h: number;
  /** buys / (buys + sells), 0..1. Null when there were no trades at all. */
  buyRatio: number | null;
  observedAt: number;
}
