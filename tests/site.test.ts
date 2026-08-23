/**
 * Canonical site URL resolution.
 *
 * A wrong value here is quiet and damaging: canonical tags and OpenGraph URLs
 * point at a host the site does not serve, while the sitemap points somewhere
 * else. The fallback chain must therefore be correct on a fresh Vercel import
 * with zero configuration.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { siteUrl, absoluteUrl } from '@/lib/site';

const KEYS = ['NEXT_PUBLIC_SITE_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_URL'] as const;

function withEnv<T>(env: Partial<Record<(typeof KEYS)[number], string>>, run: () => T): T {
  const saved = KEYS.map((k) => [k, process.env[k]] as const);
  for (const k of KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  try {
    return run();
  } finally {
    for (const k of KEYS) delete process.env[k];
    for (const [k, v] of saved) if (v !== undefined) process.env[k] = v;
  }
}

test('an explicit NEXT_PUBLIC_SITE_URL wins over everything', () => {
  const url = withEnv({
    NEXT_PUBLIC_SITE_URL: 'https://vdear.io',
    VERCEL_PROJECT_PRODUCTION_URL: 'vdear.vercel.app',
    VERCEL_URL: 'vdear-abc123.vercel.app',
  }, siteUrl);
  assert.equal(url, 'https://vdear.io');
});

test('the stable production domain beats the per-deployment URL', () => {
  // VERCEL_URL changes on every deploy; a canonical tag must not follow it.
  const url = withEnv({
    VERCEL_PROJECT_PRODUCTION_URL: 'vdear.vercel.app',
    VERCEL_URL: 'vdear-abc123.vercel.app',
  }, siteUrl);
  assert.equal(url, 'https://vdear.vercel.app');
});

test('a preview build falls back to its own deployment URL', () => {
  assert.equal(withEnv({ VERCEL_URL: 'vdear-abc123.vercel.app' }, siteUrl),
    'https://vdear-abc123.vercel.app');
});

test('with nothing set it is localhost, never a plausible-looking placeholder', () => {
  // A hard-coded host would be worse than localhost: it reads as correct in a
  // canonical tag while pointing at a site that may not exist.
  const url = withEnv({}, siteUrl);
  assert.equal(url, 'http://localhost:3000');
  assert.equal(url.includes('vercel.app'), false);
});

test('Vercel values arrive without a protocol and get https added', () => {
  assert.equal(withEnv({ VERCEL_URL: 'x.vercel.app' }, siteUrl), 'https://x.vercel.app');
  // An explicit value that already has one is left alone.
  assert.equal(withEnv({ NEXT_PUBLIC_SITE_URL: 'http://localhost:4000' }, siteUrl),
    'http://localhost:4000');
});

test('trailing slashes and whitespace are normalised away', () => {
  // Otherwise every sitemap entry would contain a double slash.
  assert.equal(withEnv({ NEXT_PUBLIC_SITE_URL: 'https://vdear.io/' }, siteUrl), 'https://vdear.io');
  assert.equal(withEnv({ NEXT_PUBLIC_SITE_URL: '  https://vdear.io///  ' }, siteUrl), 'https://vdear.io');
});

test('a blank env var is treated as unset rather than as an empty host', () => {
  // Vercel projects commonly have the variable declared but empty.
  assert.equal(withEnv({ NEXT_PUBLIC_SITE_URL: '   ', VERCEL_URL: 'x.vercel.app' }, siteUrl),
    'https://x.vercel.app');
});

test('absoluteUrl joins without producing a double slash', () => {
  withEnv({ NEXT_PUBLIC_SITE_URL: 'https://vdear.io' }, () => {
    assert.equal(absoluteUrl('/money-flow'), 'https://vdear.io/money-flow');
    assert.equal(absoluteUrl('money-flow'), 'https://vdear.io/money-flow');
    assert.equal(absoluteUrl('/'), 'https://vdear.io');
    assert.equal(absoluteUrl(''), 'https://vdear.io');
  });
});
