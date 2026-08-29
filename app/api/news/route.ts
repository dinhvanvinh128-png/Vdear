import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * News feed. A production feed requires a licensed provider (e.g. CryptoPanic,
 * CoinDesk API, RSS). We do NOT copy full article text (spec §30). Until a
 * provider key is configured we return an explicit "not configured" payload
 * rather than fabricated headlines.
 */
export async function GET() {
  const configured = !!process.env.NEWS_API_KEY;
  return NextResponse.json({
    data: { items: [] as unknown[] },
    meta: {
      kind: 'unavailable',
      configured,
      sources: [],
      generatedAt: Date.now(),
      note: configured
        ? 'News provider configured but no adapter wired yet.'
        : 'News provider not configured. Set NEWS_API_KEY and wire a source adapter.',
    },
  });
}
