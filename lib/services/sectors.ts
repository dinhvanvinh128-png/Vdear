/**
 * Sector rotation service — CoinGecko categories + market-cap ranking.
 *
 * Both calls are on CoinGecko's tightest free-tier budget, so this caches
 * aggressively; sector rotation is not a second-by-second phenomenon.
 */
import type { Envelope } from '@/lib/types';
import { cached } from '@/lib/cache';
import { getCategories, getCoinMarkets } from '@/lib/providers/coingecko/client';
import { buildSectorMap, computeSectorRotation, type SectorRotation } from '@/lib/engines/sector';

const SECTOR_TTL = 10 * 60_000;

export interface SectorResult {
  rotation: SectorRotation | null;
  unavailable: { source: string; reason: string }[];
}

export async function getSectorRotation(): Promise<Envelope<SectorResult>> {
  const res = await cached('sectors', SECTOR_TTL, async (): Promise<SectorResult> => {
    const [categories, coins] = await Promise.all([getCategories(), getCoinMarkets(250)]);

    if (categories.length === 0 || coins.length === 0) {
      return {
        rotation: null,
        unavailable: [{
          source: 'CoinGecko',
          reason: 'Category taxonomy or market list unavailable — sector rotation needs both.',
        }],
      };
    }
    return {
      rotation: computeSectorRotation(coins, buildSectorMap(categories)),
      unavailable: [],
    };
  });

  return {
    data: res,
    meta: {
      kind: res.rotation ? ('live' as const) : ('unavailable' as const),
      sources: [], errors: [], generatedAt: Date.now(), cached: false,
    },
  };
}
