import type { MetadataRoute } from 'next';
import { DEFAULT_BASES } from '@/lib/symbols';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://vdear-crypto.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes = [
    '', '/coins', '/futures', '/funding', '/open-interest', '/long-short',
    '/liquidations', '/liquidations/map', '/liquidations/heatmap', '/heatmap',
    '/watchlist', '/portfolio', '/alerts', '/whale', '/news', '/status',
  ].map((r) => ({ url: `${SITE}${r}`, lastModified: now, changeFrequency: 'hourly' as const, priority: r === '' ? 1 : 0.7 }));

  const coins = DEFAULT_BASES.map((b) => ({
    url: `${SITE}/coin/${b}`, lastModified: now, changeFrequency: 'hourly' as const, priority: 0.6,
  }));

  return [...routes, ...coins];
}
