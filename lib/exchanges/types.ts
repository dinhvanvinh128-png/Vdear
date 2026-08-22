/**
 * The common contract every exchange connector implements.
 *
 * Adapters are pure data mappers: they call the exchange's PUBLIC market-data
 * endpoints and return VDEAR-normalized types. They never read secrets, never
 * throw for "no data" (return [] / null), and never leak native payloads.
 *
 * Not every exchange supports every method — unsupported ones return an empty
 * result and set `supports` accordingly, so the aggregator can skip them.
 */
import type {
  Candle,
  ExchangeId,
  FundingRate,
  LongShortRatio,
  MarketType,
  OpenInterest,
  OrderBook,
  Ticker,
  Trade,
} from '@/lib/types';

export interface AdapterCapabilities {
  spot: boolean;
  futures: boolean;
  funding: boolean;
  openInterest: boolean;
  longShort: boolean;
  orderBook: boolean;
  trades: boolean;
  klines: boolean;
  /** Public WebSocket base URL, if the exchange exposes one (client uses it). */
  wsPublic?: string;
}

export interface ExchangeAdapter {
  readonly id: ExchangeId;
  readonly label: string;
  readonly color: string;
  readonly supports: AdapterCapabilities;

  /** One symbol on one market. Returns null if unavailable. */
  getTicker(symbol: string, market: MarketType): Promise<Ticker | null>;
  /** All (or a large set of) tickers for a market — used for market scans. */
  getTickers(market: MarketType): Promise<Ticker[]>;
  getOrderBook(symbol: string, market: MarketType, limit?: number): Promise<OrderBook | null>;
  getTrades(symbol: string, market: MarketType, limit?: number): Promise<Trade[]>;
  getKlines(symbol: string, interval: string, market: MarketType, limit?: number): Promise<Candle[]>;
  getFundingRate(symbol: string): Promise<FundingRate | null>;
  getOpenInterest(symbol: string): Promise<OpenInterest | null>;
  getLongShort(symbol: string, interval?: string): Promise<LongShortRatio | null>;
}

/** Shared no-op defaults so adapters only implement what they support. */
export abstract class BaseAdapter implements ExchangeAdapter {
  abstract readonly id: ExchangeId;
  abstract readonly label: string;
  abstract readonly color: string;
  abstract readonly supports: AdapterCapabilities;

  abstract getTicker(symbol: string, market: MarketType): Promise<Ticker | null>;
  abstract getTickers(market: MarketType): Promise<Ticker[]>;

  // Default no-op implementations. Signatures MUST match the interface so
  // concrete adapters can override them without violating substitutability.
  async getOrderBook(_symbol: string, _market: MarketType, _limit?: number): Promise<OrderBook | null> {
    return null;
  }
  async getTrades(_symbol: string, _market: MarketType, _limit?: number): Promise<Trade[]> {
    return [];
  }
  async getKlines(_symbol: string, _interval: string, _market: MarketType, _limit?: number): Promise<Candle[]> {
    return [];
  }
  async getFundingRate(_symbol: string): Promise<FundingRate | null> {
    return null;
  }
  async getOpenInterest(_symbol: string): Promise<OpenInterest | null> {
    return null;
  }
  async getLongShort(_symbol: string, _interval?: string): Promise<LongShortRatio | null> {
    return null;
  }
}
