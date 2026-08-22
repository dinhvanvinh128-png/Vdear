/**
 * Normalization / aggregation layer — the "VDEAR" in the pipeline.
 *
 * Fans a request out across every adapter, tolerates partial failure, and
 * merges the survivors into a single VDEAR view: composite index price,
 * spread, volume-weighted change/funding, summed OI, and full provenance.
 */
import type { ExchangeAdapter } from '@/lib/exchanges/types';
import type {
  AggregatedTicker, Envelope, ExchangeId, IndexMethod, MarketType, Ticker, DataSourceKind,
} from '@/lib/types';

export interface FanOut<T> {
  results: T[];
  ok: ExchangeId[];
  errors: { exchange: ExchangeId; message: string }[];
}

/**
 * Run `fn` against every adapter concurrently. One adapter failing (or timing
 * out) never fails the batch — its error is collected and the rest proceed.
 */
export async function fanOut<T>(
  adapters: ExchangeAdapter[],
  fn: (a: ExchangeAdapter) => Promise<T | null>,
): Promise<FanOut<T>> {
  const settled = await Promise.allSettled(adapters.map((a) => fn(a)));
  const results: T[] = [];
  const ok: ExchangeId[] = [];
  const errors: { exchange: ExchangeId; message: string }[] = [];
  settled.forEach((s, i) => {
    const id = adapters[i].id;
    if (s.status === 'fulfilled' && s.value != null) {
      results.push(s.value);
      ok.push(id);
    } else if (s.status === 'rejected') {
      errors.push({ exchange: id, message: shortMsg(s.reason) });
    } else {
      // fulfilled with null = queried but no data for this symbol
      errors.push({ exchange: id, message: 'no data' });
    }
  });
  return { results, ok, errors };
}

function shortMsg(e: unknown): string {
  if (e instanceof Error) return e.message.slice(0, 140);
  return String(e).slice(0, 140);
}

/**
 * Composite index price across exchanges.
 *  - equal:    simple mean
 *  - volume:   volume-weighted (default; robust to a thin venue printing a bad tick)
 *  - exchange: fixed weights (Binance-heavy) — kept as a hook for future tuning
 */
export function computeIndex(tickers: Ticker[], method: IndexMethod): number {
  if (tickers.length === 0) return 0;
  if (method === 'equal') {
    return tickers.reduce((s, t) => s + t.price, 0) / tickers.length;
  }
  if (method === 'exchange') {
    const W: Record<ExchangeId, number> = { binance: 0.4, okx: 0.25, bybit: 0.2, bitget: 0.15 };
    let num = 0, den = 0;
    for (const t of tickers) { const w = W[t.exchange] ?? 0.1; num += t.price * w; den += w; }
    return den ? num / den : 0;
  }
  // volume-weighted
  let vnum = 0, vden = 0;
  for (const t of tickers) { const w = t.volume24h > 0 ? t.volume24h : 1; vnum += t.price * w; vden += w; }
  return vden ? vnum / vden : tickers.reduce((s, t) => s + t.price, 0) / tickers.length;
}

/** Merge per-exchange tickers for ONE symbol into a VDEAR aggregate. */
export function mergeTickers(
  symbol: string,
  sources: Ticker[],
  allTried: ExchangeId[],
  method: IndexMethod = 'volume',
): AggregatedTicker {
  const prices = sources.map((s) => s.price).filter((p) => p > 0);
  const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
  const maxP = prices.length ? Math.max(...prices) : 0;
  const minP = prices.length ? Math.min(...prices) : 0;
  const vdearIndex = computeIndex(sources, method);

  const totalVol = sources.reduce((s, t) => s + (t.volume24h || 0), 0);
  const vwChange = totalVol > 0
    ? sources.reduce((s, t) => s + t.priceChange24h * (t.volume24h || 0), 0) / totalVol
    : sources.reduce((s, t) => s + t.priceChange24h, 0) / (sources.length || 1);

  const fundingSources = sources.filter((s) => s.fundingRate != null);
  const fundingVol = fundingSources.reduce((s, t) => s + (t.volume24h || 0), 0);
  const fundingRate = fundingSources.length === 0 ? null
    : fundingVol > 0
      ? fundingSources.reduce((s, t) => s + (t.fundingRate as number) * (t.volume24h || 0), 0) / fundingVol
      : fundingSources.reduce((s, t) => s + (t.fundingRate as number), 0) / fundingSources.length;

  const oiSources = sources.filter((s) => s.openInterest != null);
  const openInterest = oiSources.length
    ? oiSources.reduce((s, t) => s + (t.openInterest as number), 0)
    : null;

  const base = sources[0]?.base ?? symbol;
  const quote = sources[0]?.quote ?? 'USDT';
  const missing = allTried.filter((id) => !sources.some((s) => s.exchange === id));

  return {
    symbol, base, quote,
    vdearIndex, indexMethod: method, avgPrice,
    spreadAbs: maxP - minP,
    spreadPct: minP > 0 ? ((maxP - minP) / minP) * 100 : 0,
    priceChange24h: vwChange,
    volume24h: totalVol,
    high24h: sources.length ? Math.max(...sources.map((s) => s.high24h)) : 0,
    low24h: sources.length ? Math.min(...sources.map((s) => s.low24h).filter((n) => n > 0)) : 0,
    fundingRate, openInterest,
    sources, missing,
    timestamp: Date.now(),
  };
}

export function envelope<T>(
  data: T,
  ok: ExchangeId[],
  errors: { exchange: ExchangeId; message: string }[],
  opts: { cached?: boolean; kind?: DataSourceKind } = {},
): Envelope<T> {
  return {
    data,
    meta: {
      kind: opts.kind ?? (ok.length ? 'live' : 'unavailable'),
      sources: ok,
      errors,
      generatedAt: Date.now(),
      cached: opts.cached ?? false,
    },
  };
}

export function parseMarket(v: string | null | undefined): MarketType {
  return v === 'spot' ? 'spot' : 'futures';
}

export function parseIndexMethod(v: string | null | undefined): IndexMethod {
  return v === 'equal' || v === 'exchange' ? v : 'volume';
}
