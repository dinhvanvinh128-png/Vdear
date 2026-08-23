/** Raw CoinGecko payloads -> VDEAR-normalized shapes. Pure, unit-testable. */
import { num } from '@/lib/exchanges/http';
import type { CoinCategory, CoinMarket, GlobalMarket } from '@/lib/providers/coingecko/types';

export interface RawGlobal {
  data?: {
    total_market_cap?: Record<string, number>;
    total_volume?: Record<string, number>;
    market_cap_percentage?: Record<string, number>;
    market_cap_change_percentage_24h_usd?: number;
    active_cryptocurrencies?: number;
    markets?: number;
  };
}

export function mapGlobal(raw: RawGlobal): GlobalMarket | null {
  const d = raw?.data;
  if (!d) return null;
  return {
    totalMarketCapUsd: num(d.total_market_cap?.usd),
    totalVolumeUsd: num(d.total_volume?.usd),
    marketCapChange24h: num(d.market_cap_change_percentage_24h_usd),
    btcDominance: num(d.market_cap_percentage?.btc),
    ethDominance: num(d.market_cap_percentage?.eth),
    activeCryptocurrencies: num(d.active_cryptocurrencies),
    markets: num(d.markets),
  };
}

export interface RawCoinMarket {
  id: string; symbol: string; name: string; image: string;
  current_price: number | null; market_cap: number | null; market_cap_rank: number | null;
  fully_diluted_valuation: number | null; total_volume: number | null;
  price_change_percentage_1h_in_currency?: number | null;
  price_change_percentage_24h_in_currency?: number | null;
  price_change_percentage_7d_in_currency?: number | null;
  price_change_percentage_30d_in_currency?: number | null;
  price_change_percentage_24h?: number | null;
  circulating_supply: number | null; total_supply: number | null;
  ath: number | null; ath_change_percentage: number | null; atl: number | null;
  last_updated: string | null;
}

/** null (not 0) for a change CoinGecko did not report — 0 would read as "flat". */
function optNum(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function mapCoinMarket(r: RawCoinMarket): CoinMarket | null {
  if (!r || typeof r.symbol !== 'string') return null;
  return {
    id: r.id,
    symbol: r.symbol.toUpperCase(),
    name: r.name,
    image: r.image,
    price: num(r.current_price),
    marketCap: num(r.market_cap),
    marketCapRank: optNum(r.market_cap_rank),
    fullyDilutedValuation: optNum(r.fully_diluted_valuation),
    volume24h: num(r.total_volume),
    change1h: optNum(r.price_change_percentage_1h_in_currency),
    change24h: optNum(r.price_change_percentage_24h_in_currency ?? r.price_change_percentage_24h),
    change7d: optNum(r.price_change_percentage_7d_in_currency),
    change30d: optNum(r.price_change_percentage_30d_in_currency),
    circulatingSupply: optNum(r.circulating_supply),
    totalSupply: optNum(r.total_supply),
    ath: optNum(r.ath),
    athChangePct: optNum(r.ath_change_percentage),
    atl: optNum(r.atl),
    lastUpdated: r.last_updated ? Date.parse(r.last_updated) || Date.now() : Date.now(),
  };
}

export interface RawCategory {
  id: string; name: string;
  market_cap: number | null; market_cap_change_24h: number | null;
  volume_24h: number | null;
  top_3_coins?: string[];
  updated_at?: string | null;
}

export function mapCategory(r: RawCategory): CoinCategory | null {
  if (!r || typeof r.id !== 'string') return null;
  return {
    id: r.id,
    name: r.name,
    marketCap: optNum(r.market_cap),
    marketCapChange24h: optNum(r.market_cap_change_24h),
    volume24h: optNum(r.volume_24h),
    topCoins: Array.isArray(r.top_3_coins) ? r.top_3_coins : [],
    updatedAt: r.updated_at ? Date.parse(r.updated_at) || null : null,
  };
}
