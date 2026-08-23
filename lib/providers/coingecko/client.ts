/**
 * CoinGecko — market-wide statistics the exchanges cannot give us:
 * total market cap, dominance, market-cap ranking, and the CATEGORY taxonomy
 * that the sector-rotation engine is built on.
 *
 * Free public API needs no key (and is heavily rate-limited, hence the tight
 * budget in lib/net/rateLimiter). Setting COINGECKO_API_KEY switches to the Pro
 * host and raises that budget. Fails soft everywhere: a null means "we don't
 * know", and callers must render that rather than substitute a value.
 */
import { request } from '@/lib/net/request';
import { envKey } from '@/lib/providers/types';
import type { CoinCategory, CoinMarket, GlobalMarket } from '@/lib/providers/coingecko/types';
import {
  mapCategory, mapCoinMarket, mapGlobal,
  type RawCategory, type RawCoinMarket, type RawGlobal,
} from '@/lib/providers/coingecko/mapper';

const FREE_BASE = 'https://api.coingecko.com/api/v3';
const PRO_BASE = 'https://pro-api.coingecko.com/api/v3';

export function coingeckoConfigured(): boolean {
  return !!envKey('COINGECKO_API_KEY');
}

function base(): string {
  return coingeckoConfigured() ? PRO_BASE : FREE_BASE;
}

/** Pro key travels in a header, never in the URL (URLs end up in logs). */
function headers(): Record<string, string> {
  const key = envKey('COINGECKO_API_KEY');
  return key ? { 'x-cg-pro-api-key': key } : {};
}

async function get<T>(path: string, timeoutMs = 9000): Promise<T> {
  return request<T>(`${base()}${path}`, { headers: headers(), timeoutMs });
}

export async function getGlobal(): Promise<GlobalMarket | null> {
  try {
    return mapGlobal(await get<RawGlobal>('/global'));
  } catch {
    return null;
  }
}

/**
 * Market-cap ranked coins. `perPage` maxes at 250 per CoinGecko's docs; ask for
 * more and we page, staying inside the rate limiter.
 */
export async function getCoinMarkets(limit = 250): Promise<CoinMarket[]> {
  const perPage = Math.min(250, Math.max(1, limit));
  const pages = Math.ceil(Math.min(1000, limit) / perPage);
  const out: CoinMarket[] = [];
  for (let page = 1; page <= pages; page++) {
    try {
      const rows = await get<RawCoinMarket[]>(
        `/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=${page}`
        + '&price_change_percentage=1h%2C24h%2C7d%2C30d&sparkline=false',
      );
      if (!Array.isArray(rows) || rows.length === 0) break;
      for (const r of rows) {
        const m = mapCoinMarket(r);
        if (m) out.push(m);
      }
      if (rows.length < perPage) break;
    } catch {
      break; // partial data is fine and is reported via the Envelope; invented data is not
    }
  }
  return out.slice(0, limit);
}

/** The sector taxonomy behind /sectors. */
export async function getCategories(): Promise<CoinCategory[]> {
  try {
    const rows = await get<RawCategory[]>('/coins/categories');
    if (!Array.isArray(rows)) return [];
    return rows.map(mapCategory).filter((c): c is CoinCategory => c !== null);
  } catch {
    return [];
  }
}

export async function ping(): Promise<boolean> {
  try {
    await request<{ gecko_says?: string }>(`${base()}/ping`, {
      headers: headers(), timeoutMs: 6000, skipRateLimit: true,
    });
    return true;
  } catch {
    return false;
  }
}
