/**
 * VDEAR Crypto — canonical (normalized) data model.
 *
 * Every exchange adapter MUST map its native response into these shapes.
 * Frontend components and API routes only ever consume VDEAR-normalized types,
 * never a raw exchange payload. This is the contract that lets us add/remove
 * exchanges (Coinbase, Kraken, Gate, Hyperliquid, Deribit…) without rewrites.
 */

export type ExchangeId = 'binance' | 'okx' | 'bybit' | 'bitget';

export type MarketType = 'spot' | 'futures';

export type DataSourceKind = 'live' | 'demo' | 'estimated' | 'unavailable';

/** A single exchange's view of one symbol. */
export interface Ticker {
  exchange: ExchangeId;
  market: MarketType;
  /** Canonical symbol, e.g. "BTCUSDT" (base+quote, no separators). */
  symbol: string;
  base: string;
  quote: string;
  price: number;
  /** 24h price change, percent (e.g. 2.35 = +2.35%). */
  priceChange24h: number;
  /** 24h quote volume (USDT). */
  volume24h: number;
  high24h: number;
  low24h: number;
  /** Futures-only fields (null on spot). */
  fundingRate?: number | null;
  openInterest?: number | null;
  markPrice?: number | null;
  indexPrice?: number | null;
  /** ms epoch when the source produced this. */
  timestamp: number;
}

/** One OHLCV candle. */
export interface Candle {
  time: number; // seconds epoch (lightweight-charts convention)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  exchange: ExchangeId;
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface Trade {
  exchange: ExchangeId;
  symbol: string;
  price: number;
  size: number;
  side: 'buy' | 'sell';
  timestamp: number;
}

export interface FundingRate {
  exchange: ExchangeId;
  symbol: string;
  rate: number; // fraction, e.g. 0.0001 = 0.01%
  nextFundingTime?: number | null;
  timestamp: number;
}

export interface OpenInterest {
  exchange: ExchangeId;
  symbol: string;
  /** OI value in USD (notional). */
  valueUsd: number;
  /** OI in base-asset units when the source reports it. */
  amount?: number | null;
  timestamp: number;
}

export interface LongShortRatio {
  exchange: ExchangeId;
  symbol: string;
  longPct: number; // 0..100
  shortPct: number; // 0..100
  timestamp: number;
}

export interface LiquidationEvent {
  exchange: ExchangeId;
  symbol: string;
  side: 'long' | 'short'; // side that was liquidated
  valueUsd: number;
  price: number;
  timestamp: number;
}

/** A price band with estimated liquidation notional (for map/heatmap). */
export interface LiquidationZone {
  price: number;
  side: 'long' | 'short';
  /** Estimated notional at this band (USD). Always flagged as estimated. */
  estValueUsd: number;
  /** 0..1 relative intensity for rendering. */
  intensity: number;
}

/* ------------------------------------------------------------------ *
 * Aggregated (multi-exchange) shapes — the VDEAR layer.
 * ------------------------------------------------------------------ */

export type IndexMethod = 'equal' | 'volume' | 'exchange';

export interface AggregatedTicker {
  symbol: string;
  base: string;
  quote: string;
  /** VDEAR composite price (see IndexMethod). */
  vdearIndex: number;
  indexMethod: IndexMethod;
  /** Simple mean of exchange prices. */
  avgPrice: number;
  /** max-min across exchanges. */
  spreadAbs: number;
  spreadPct: number;
  priceChange24h: number; // volume-weighted
  volume24h: number; // summed across sources
  high24h: number;
  low24h: number;
  fundingRate?: number | null; // volume-weighted avg where available
  openInterest?: number | null; // summed
  /** Per-exchange breakdown, one entry per source that responded. */
  sources: Ticker[];
  /** Exchanges that were queried but failed/returned nothing. */
  missing: ExchangeId[];
  timestamp: number;
}

/** Every API payload is wrapped so the UI can show freshness + provenance. */
export interface Envelope<T> {
  data: T;
  meta: {
    kind: DataSourceKind;
    /** Exchanges that contributed data. */
    sources: ExchangeId[];
    /** Exchanges that were tried but failed. */
    errors: { exchange: ExchangeId; message: string }[];
    /** ms epoch the payload was assembled. */
    generatedAt: number;
    /** Whether the payload was served from cache. */
    cached: boolean;
  };
}
