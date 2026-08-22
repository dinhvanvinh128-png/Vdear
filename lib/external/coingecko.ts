/**
 * CoinGecko — used ONLY for data the exchanges don't provide: global market
 * cap, dominance, and coin metadata/logos. Public endpoints, no key required.
 * Fails soft: callers get null and render "N/A" rather than crashing.
 */
import { getJson, num } from '@/lib/exchanges/http';

const BASE = 'https://api.coingecko.com/api/v3';

export interface GlobalMarket {
  totalMarketCapUsd: number;
  totalVolumeUsd: number;
  marketCapChange24h: number;
  btcDominance: number;
  ethDominance: number;
}

export async function getGlobal(): Promise<GlobalMarket | null> {
  try {
    const j = await getJson<{
      data: {
        total_market_cap: Record<string, number>;
        total_volume: Record<string, number>;
        market_cap_percentage: Record<string, number>;
        market_cap_change_percentage_24h_usd: number;
      };
    }>(`${BASE}/global`, { timeoutMs: 8000 });
    const d = j.data;
    return {
      totalMarketCapUsd: num(d.total_market_cap?.usd),
      totalVolumeUsd: num(d.total_volume?.usd),
      marketCapChange24h: num(d.market_cap_change_percentage_24h_usd),
      btcDominance: num(d.market_cap_percentage?.btc),
      ethDominance: num(d.market_cap_percentage?.eth),
    };
  } catch {
    return null;
  }
}
