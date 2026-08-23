import type { MetadataRoute } from 'next';
import { DEFAULT_BASES } from '@/lib/symbols';
import { siteUrl } from '@/lib/site';

const SITE = siteUrl();

/** Intelligence routes rank highest — they are what the product is for. */
const INTELLIGENCE = [
  '/money-flow', '/breadth', '/liquidity', '/whales', '/onchain', '/sectors', '/alerts',
];

const MARKET = [
  '/markets', '/coins', '/heatmap',
];

const DERIVATIVES = [
  '/futures', '/funding', '/open-interest', '/long-short',
  '/liquidations', '/liquidations/map', '/liquidations/heatmap',
];

const TOOLS = ['/watchlist', '/portfolio', '/price-alerts', '/whale', '/news', '/status'];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entry = (path: string, priority: number) => ({
    url: `${SITE}${path}`,
    lastModified: now,
    changeFrequency: 'hourly' as const,
    priority,
  });

  return [
    entry('', 1),
    ...INTELLIGENCE.map((r) => entry(r, 0.9)),
    ...MARKET.map((r) => entry(r, 0.8)),
    ...DERIVATIVES.map((r) => entry(r, 0.6)),
    ...TOOLS.map((r) => entry(r, 0.4)),
    ...DEFAULT_BASES.map((b) => entry(`/coin/${b}`, 0.7)),
  ];
}
