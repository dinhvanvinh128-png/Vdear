/**
 * SECTOR ROTATION ENGINE (spec: SECTOR ROTATION).
 *
 * Groups the market into the sectors the spec names — Layer 1, Layer 2, DeFi,
 * AI, RWA, Meme, Gaming, DePIN, Infrastructure, Oracle — and ranks them by
 * where money is actually moving, so the classic BTC -> ETH -> SOL -> DeFi ->
 * AI -> Meme progression becomes visible instead of anecdotal.
 *
 * Sector membership comes from CoinGecko's own category taxonomy rather than a
 * hand-maintained list, so new assets are classified without a code change. The
 * mapping below only translates CoinGecko's many category ids onto the spec's
 * ten buckets; anything unmatched lands in `other` and is reported, not hidden.
 */
import type { CoinCategory, CoinMarket } from '@/lib/providers/coingecko/types';
import { clamp, scaleAround } from '@/lib/indicators/series';

export const SECTORS = [
  'layer1', 'layer2', 'defi', 'ai', 'rwa', 'meme',
  'gaming', 'depin', 'infrastructure', 'oracle', 'other',
] as const;
export type Sector = (typeof SECTORS)[number];

export const SECTOR_LABELS: Record<Sector, string> = {
  layer1: 'Layer 1', layer2: 'Layer 2', defi: 'DeFi', ai: 'AI', rwa: 'RWA',
  meme: 'Meme', gaming: 'Gaming', depin: 'DePIN',
  infrastructure: 'Infrastructure', oracle: 'Oracle', other: 'Other',
};

/**
 * Substring patterns matched against a CoinGecko category id, most specific
 * first (an "ai-agents" category must not be swallowed by "layer-1").
 */
const SECTOR_PATTERNS: [Sector, string[]][] = [
  ['oracle', ['oracle']],
  ['depin', ['depin', 'decentralized-physical']],
  ['rwa', ['real-world-assets', 'tokenized-', 'rwa']],
  ['ai', ['artificial-intelligence', 'ai-agent', 'ai-meme', 'machine-learning', 'ai-applications']],
  ['meme', ['meme']],
  ['gaming', ['gaming', 'play-to-earn', 'metaverse', 'gamefi']],
  ['layer2', ['layer-2', 'rollup', 'zero-knowledge', 'optimistic']],
  ['defi', ['decentralized-finance', 'defi', 'dex', 'lending-borrowing', 'yield', 'liquid-staking', 'derivatives']],
  ['infrastructure', ['infrastructure', 'storage', 'bridge', 'data-availability', 'wallets', 'privacy']],
  ['layer1', ['layer-1', 'smart-contract-platform', 'proof-of-work', 'proof-of-stake']],
];

export function sectorOfCategory(categoryId: string): Sector | null {
  const id = categoryId.toLowerCase();
  for (const [sector, patterns] of SECTOR_PATTERNS) {
    if (patterns.some((p) => id.includes(p))) return sector;
  }
  return null;
}

export interface SectorMetrics {
  sector: Sector;
  label: string;
  marketCapUsd: number;
  volume24hUsd: number;
  /** Market-cap weighted 24h / 7d change across the sector's members. */
  change24h: number | null;
  change7d: number | null;
  /** volume / marketCap — how hard the sector is being traded relative to size. */
  turnover: number | null;
  memberCount: number;
  topMovers: { symbol: string; change24h: number | null; volume24h: number }[];
  /** 0..100 momentum score. */
  score: number;
}

export interface SectorRotation {
  sectors: SectorMetrics[];
  /** Sectors ranked by score, strongest first — the rotation read. */
  leaders: Sector[];
  laggards: Sector[];
  /** Total across all classified assets. */
  totalMarketCapUsd: number;
  totalVolume24hUsd: number;
  /** Assets that matched no category pattern. */
  unclassified: number;
  observedAt: number;
}

/**
 * Build a coin-id -> sector map from the category list.
 *
 * A coin can sit in several categories; the FIRST pattern match in
 * SECTOR_PATTERNS order wins, so "ai" beats "layer1" for an AI L1 — which is
 * how a trader would describe it when discussing rotation.
 */
export function buildSectorMap(categories: readonly CoinCategory[]): Map<string, Sector> {
  const map = new Map<string, Sector>();
  const rank = new Map<string, number>();

  categories.forEach((cat) => {
    const sector = sectorOfCategory(cat.id);
    if (!sector) return;
    const priority = SECTOR_PATTERNS.findIndex(([s]) => s === sector);
    for (const coinId of cat.topCoins) {
      if (!coinId) continue;
      const existing = rank.get(coinId);
      if (existing == null || priority < existing) {
        map.set(coinId, sector);
        rank.set(coinId, priority);
      }
    }
  });
  return map;
}

export function computeSectorRotation(
  coins: readonly CoinMarket[],
  sectorMap: Map<string, Sector>,
  now = Date.now(),
): SectorRotation {
  const groups = new Map<Sector, CoinMarket[]>();
  let unclassified = 0;

  for (const coin of coins) {
    const sector = sectorMap.get(coin.id);
    if (!sector) { unclassified++; continue; }
    const arr = groups.get(sector);
    if (arr) arr.push(coin);
    else groups.set(sector, [coin]);
  }

  const sectors: SectorMetrics[] = [];
  for (const [sector, members] of groups) {
    const marketCapUsd = members.reduce((s, c) => s + c.marketCap, 0);
    const volume24hUsd = members.reduce((s, c) => s + c.volume24h, 0);

    // Market-cap weight the changes so a $50m token cannot swing a sector read.
    const weighted = (pick: (c: CoinMarket) => number | null): number | null => {
      let wsum = 0, acc = 0;
      for (const c of members) {
        const v = pick(c);
        if (v == null || c.marketCap <= 0) continue;
        acc += v * c.marketCap;
        wsum += c.marketCap;
      }
      return wsum > 0 ? acc / wsum : null;
    };

    const metrics: Omit<SectorMetrics, 'score'> = {
      sector,
      label: SECTOR_LABELS[sector],
      marketCapUsd,
      volume24hUsd,
      change24h: weighted((c) => c.change24h),
      change7d: weighted((c) => c.change7d),
      turnover: marketCapUsd > 0 ? volume24hUsd / marketCapUsd : null,
      memberCount: members.length,
      topMovers: [...members]
        .sort((a, b) => (b.change24h ?? -999) - (a.change24h ?? -999))
        .slice(0, 5)
        .map((c) => ({ symbol: c.symbol, change24h: c.change24h, volume24h: c.volume24h })),
    };
    sectors.push({ ...metrics, score: scoreSector(metrics) });
  }

  sectors.sort((a, b) => b.score - a.score);

  return {
    sectors,
    leaders: sectors.slice(0, 3).map((s) => s.sector),
    laggards: sectors.slice(-3).map((s) => s.sector).reverse(),
    totalMarketCapUsd: sectors.reduce((s, x) => s + x.marketCapUsd, 0),
    totalVolume24hUsd: sectors.reduce((s, x) => s + x.volume24hUsd, 0),
    unclassified,
    observedAt: now,
  };
}

/**
 * Sector momentum 0..100.
 *
 * Turnover matters as much as price: a sector rising on no volume is drift,
 * a sector rising on elevated turnover is rotation actually happening.
 */
export function scoreSector(s: Omit<SectorMetrics, 'score'>): number {
  const parts: { value: number; weight: number }[] = [];
  if (s.change24h != null) parts.push({ value: scaleAround(s.change24h, 0, 10), weight: 0.45 });
  if (s.change7d != null) parts.push({ value: scaleAround(s.change7d, 0, 25), weight: 0.3 });
  // 10% daily turnover is very hot for a whole sector.
  if (s.turnover != null) parts.push({ value: scaleAround(s.turnover, 0.05, 0.1), weight: 0.25 });

  if (parts.length === 0) return 50;
  const wsum = parts.reduce((sum, p) => sum + p.weight, 0);
  return clamp(parts.reduce((sum, p) => sum + p.value * p.weight, 0) / wsum);
}
