import { rateLimitResponse } from '@/lib/api/guard';
import { NextRequest, NextResponse } from 'next/server';
import { binance } from '@/lib/exchanges/binance';
import { cached, TTL } from '@/lib/cache';
import { envelope } from '@/lib/aggregate';
import { toCanonical, splitSymbol } from '@/lib/symbols';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Open-interest history. Sourced from Binance (the venue that publishes an OI
 * time-series over REST). Other exchanges only expose current OI, so history is
 * single-source and labelled as such.
 */
export async function GET(req: NextRequest) {
  const limited = rateLimitResponse(req);
  if (limited) return limited;

  const sp = req.nextUrl.searchParams;
  const raw = (sp.get('symbol') || 'BTC').toUpperCase();
  const symbol = splitSymbol(raw).quote ? raw : toCanonical(raw);
  const period = sp.get('period') || '1h';
  const limit = Math.min(500, Math.max(10, parseInt(sp.get('limit') || '72', 10)));
  const key = `oihist:${symbol}:${period}:${limit}`;
  try {
    const series = await cached(key, TTL.klines, () => binance.getOpenInterestHistory(symbol, period, limit));
    return NextResponse.json(envelope(series, series.length ? ['binance'] : [], []));
  } catch (e) {
    return NextResponse.json(envelope([], [], [{ exchange: 'binance', message: e instanceof Error ? e.message : 'error' }]));
  }
}
