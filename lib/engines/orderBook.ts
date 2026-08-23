/**
 * ORDER BOOK IMBALANCE (spec: Order Book Imbalance, ±0.25 / 0.5 / 1 / 2 %).
 *
 * Imbalance = bidDepth / (bidDepth + askDepth) inside a price band around mid.
 * Banding matters: raw top-of-book is noise, and the full book includes resting
 * orders so far away they will never be touched. The four bands answer
 * "how much real support is within reach" at four distances.
 *
 * Depth is measured in QUOTE currency (price x size), because 10 BTC of bids at
 * $100k and 10 BTC at $50k are not the same wall.
 */
import type { OrderBook, OrderBookLevel } from '@/lib/types';
import { clamp, scaleAround } from '@/lib/indicators/series';

/** Bands the spec asks for, as percentages from mid price. */
export const DEPTH_BANDS = [0.25, 0.5, 1, 2] as const;
export type DepthBand = (typeof DEPTH_BANDS)[number];

export interface BandImbalance {
  band: DepthBand;
  bidDepthUsd: number;
  askDepthUsd: number;
  /** bid / (bid + ask), 0..1. Null when the band is empty on both sides. */
  imbalance: number | null;
}

export interface OrderBookMetrics {
  symbol: string;
  midPrice: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  spreadAbs: number | null;
  spreadPct: number | null;
  bands: BandImbalance[];
  /** Imbalance at the ±1% band — the headline figure. */
  headlineImbalance: number | null;
  /** 0..100; 50 = balanced book. */
  score: number;
  sources: string[];
}

export function midPriceOf(book: OrderBook): number | null {
  const bid = book.bids[0]?.price;
  const ask = book.asks[0]?.price;
  if (bid == null || ask == null || bid <= 0 || ask <= 0) return null;
  return (bid + ask) / 2;
}

/** Quote-currency depth within `pct` of `mid` on one side. */
export function depthWithin(
  levels: readonly OrderBookLevel[], mid: number, pct: number, side: 'bid' | 'ask',
): number {
  const limit = side === 'bid' ? mid * (1 - pct / 100) : mid * (1 + pct / 100);
  let depth = 0;
  for (const l of levels) {
    if (!Number.isFinite(l.price) || !Number.isFinite(l.size)) continue;
    if (side === 'bid' ? l.price < limit : l.price > limit) continue;
    depth += l.price * l.size;
  }
  return depth;
}

export function bandImbalance(book: OrderBook, mid: number, band: DepthBand): BandImbalance {
  const bidDepthUsd = depthWithin(book.bids, mid, band, 'bid');
  const askDepthUsd = depthWithin(book.asks, mid, band, 'ask');
  const total = bidDepthUsd + askDepthUsd;
  return {
    band, bidDepthUsd, askDepthUsd,
    // An empty band is unknown pressure, not balanced pressure.
    imbalance: total > 0 ? bidDepthUsd / total : null,
  };
}

/**
 * Merge books from several venues into one view.
 *
 * Depth is additive, so bands are summed across venues; mid is volume-weighted
 * by each book's own near-touch depth so a thin venue cannot drag it.
 */
export function computeOrderBookMetrics(
  symbol: string, books: readonly OrderBook[],
): OrderBookMetrics {
  const usable = books.filter((b) => b.bids.length > 0 && b.asks.length > 0);
  if (usable.length === 0) {
    return {
      symbol, midPrice: null, bestBid: null, bestAsk: null,
      spreadAbs: null, spreadPct: null,
      bands: DEPTH_BANDS.map((band) => ({ band, bidDepthUsd: 0, askDepthUsd: 0, imbalance: null })),
      headlineImbalance: null, score: 50, sources: [],
    };
  }

  const mids = usable
    .map((b) => ({ book: b, mid: midPriceOf(b) }))
    .filter((x): x is { book: OrderBook; mid: number } => x.mid != null);
  if (mids.length === 0) {
    return {
      symbol, midPrice: null, bestBid: null, bestAsk: null,
      spreadAbs: null, spreadPct: null,
      bands: DEPTH_BANDS.map((band) => ({ band, bidDepthUsd: 0, askDepthUsd: 0, imbalance: null })),
      headlineImbalance: null, score: 50, sources: usable.map((b) => b.exchange),
    };
  }

  let wsum = 0;
  let acc = 0;
  for (const { book, mid } of mids) {
    const w = depthWithin(book.bids, mid, 0.5, 'bid') + depthWithin(book.asks, mid, 0.5, 'ask');
    const weight = w > 0 ? w : 1;
    acc += mid * weight;
    wsum += weight;
  }
  const midPrice = acc / wsum;

  const bestBid = Math.max(...mids.map(({ book }) => book.bids[0]!.price));
  const bestAsk = Math.min(...mids.map(({ book }) => book.asks[0]!.price));
  const spreadAbs = bestAsk - bestBid;

  const bands: BandImbalance[] = DEPTH_BANDS.map((band) => {
    let bid = 0;
    let ask = 0;
    for (const { book } of mids) {
      bid += depthWithin(book.bids, midPrice, band, 'bid');
      ask += depthWithin(book.asks, midPrice, band, 'ask');
    }
    const total = bid + ask;
    return { band, bidDepthUsd: bid, askDepthUsd: ask, imbalance: total > 0 ? bid / total : null };
  });

  const headline = bands.find((b) => b.band === 1)?.imbalance ?? null;

  return {
    symbol,
    midPrice,
    bestBid,
    bestAsk,
    spreadAbs,
    spreadPct: bestBid > 0 ? (spreadAbs / bestBid) * 100 : null,
    bands,
    headlineImbalance: headline,
    score: scoreOrderBook(bands),
    sources: mids.map(({ book }) => book.exchange),
  };
}

/**
 * 0..100 from the band imbalances.
 *
 * Near bands are weighted more heavily than far ones: depth 0.25% away will be
 * consumed by the next move, depth 2% away may never be reached.
 */
export function scoreOrderBook(bands: readonly BandImbalance[]): number {
  const WEIGHTS: Record<number, number> = { 0.25: 0.4, 0.5: 0.3, 1: 0.2, 2: 0.1 };
  let wsum = 0;
  let acc = 0;
  for (const b of bands) {
    if (b.imbalance == null) continue;
    const w = WEIGHTS[b.band] ?? 0.1;
    // 0.5 imbalance (balanced) maps to 50; 0.75 bid-heavy maps to 100.
    acc += scaleAround(b.imbalance, 0.5, 0.25) * w;
    wsum += w;
  }
  return wsum > 0 ? clamp(acc / wsum) : 50;
}
