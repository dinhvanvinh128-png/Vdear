/**
 * Canonical site URL — one source of truth for metadataBase, robots and sitemap.
 *
 * Previously `app/layout.tsx` hard-coded the host while `robots.ts` and
 * `sitemap.ts` read the environment, so a deployment on any other domain
 * produced canonical/OpenGraph URLs pointing at one host and a sitemap pointing
 * at another. All three now call this.
 *
 * The fallback chain is ordered so the app is correct on a fresh Vercel import
 * with NO configuration at all:
 *
 *   NEXT_PUBLIC_SITE_URL            an explicit choice always wins
 *   VERCEL_PROJECT_PRODUCTION_URL   the stable production domain Vercel assigns
 *   VERCEL_URL                      this specific deployment (preview builds)
 *   http://localhost:3000           local development
 *
 * Vercel injects the two VERCEL_* values automatically, without the protocol,
 * which is why https:// is added here. Nothing is hard-coded to a real domain:
 * a placeholder host would be worse than localhost, because it looks plausible
 * in a canonical tag while pointing somewhere the site does not exist.
 */

function clean(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit && explicit.trim()) return clean(explicit);

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production && production.trim()) return clean(production);

  const deployment = process.env.VERCEL_URL;
  if (deployment && deployment.trim()) return clean(deployment);

  return 'http://localhost:3000';
}

/** Absolute URL for a path, for sitemap entries and canonical links. */
export function absoluteUrl(path: string): string {
  const base = siteUrl();
  if (!path || path === '/') return base;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
