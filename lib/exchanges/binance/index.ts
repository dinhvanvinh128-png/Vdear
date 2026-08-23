/**
 * Binance connector — public market data (Spot + USDⓈ-M Futures).
 * Docs: https://binance-docs.github.io/apidocs/
 * No API key required for these public endpoints.
 */
import { BaseAdapter, type AdapterCapabilities } from '@/lib/exchanges/types';
import { getJson, num } from '@/lib/exchanges/http';
import type {
  Candle, ExchangeId, FlowCandle, FundingRate, LongShortRatio, MarketType,
  OpenInterest, OrderBook, Ticker, Trade,
} from '@/lib/types';
import { splitSymbol } from '@/lib/symbols';

const SPOT = 'https://api.binance.com';
const FUT = 'https://fapi.binance.com';

const INTERVALS: Record<string, string> = {
  '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w',
};

interface B24h {
  symbol: string; lastPrice: string; priceChangePercent: string;
  highPrice: string; lowPrice: string; quoteVolume: string; volume: string; closeTime: number;
}

export class BinanceAdapter extends BaseAdapter {
  readonly id: ExchangeId = 'binance';
  readonly label = 'Binance';
  readonly color = '#F0B90B';
  readonly supports: AdapterCapabilities = {
    spot: true, futures: true, funding: true, openInterest: true,
    longShort: true, orderBook: true, trades: true, klines: true,
    takerVolume: true,
    wsPublic: 'wss://fstream.binance.com/ws',
  };

  private base(market: MarketType) {
    return market === 'futures' ? FUT : SPOT;
  }
  private path(market: MarketType, p: string) {
    return market === 'futures' ? `/fapi/v1${p}` : `/api/v3${p}`;
  }

  private map24h(t: B24h, market: MarketType): Ticker | null {
    const { base, quote } = splitSymbol(t.symbol);
    if (!quote) return null;
    return {
      exchange: this.id, market, symbol: t.symbol, base, quote,
      price: num(t.lastPrice),
      priceChange24h: num(t.priceChangePercent),
      volume24h: num(t.quoteVolume),
      high24h: num(t.highPrice), low24h: num(t.lowPrice),
      timestamp: t.closeTime || Date.now(),
    };
  }

  async getTicker(symbol: string, market: MarketType): Promise<Ticker | null> {
    const url = `${this.base(market)}${this.path(market, '/ticker/24hr')}?symbol=${symbol}`;
    const t = await getJson<B24h>(url);
    return this.map24h(t, market);
  }

  async getTickers(market: MarketType): Promise<Ticker[]> {
    const url = `${this.base(market)}${this.path(market, '/ticker/24hr')}`;
    const rows = await getJson<B24h[]>(url);
    return rows
      .filter((r) => r.symbol.endsWith('USDT') && !r.symbol.includes('_'))
      .map((r) => this.map24h(r, market))
      .filter((x): x is Ticker => x !== null);
  }

  async getKlines(symbol: string, interval: string, market: MarketType, limit = 200): Promise<Candle[]> {
    const iv = INTERVALS[interval];
    if (!iv) return [];
    const url = `${this.base(market)}${this.path(market, '/klines')}?symbol=${symbol}&interval=${iv}&limit=${limit}`;
    const rows = await getJson<unknown[][]>(url);
    return rows.map((k) => ({
      time: Math.floor(num(k[0]) / 1000),
      open: num(k[1]), high: num(k[2]), low: num(k[3]), close: num(k[4]), volume: num(k[5]),
    }));
  }

  /**
   * Candles WITH the taker-buy split — the exact input for CVD.
   *
   * Binance's kline array carries more than OHLCV:
   *   [0] openTime  [5] baseVolume  [7] quoteVolume  [8] tradeCount
   *   [9] takerBuyBaseVolume  [10] takerBuyQuoteVolume
   *
   * Index 10 is aggressive BUY volume in USDT. Sell volume is therefore
   * quoteVolume - takerBuyQuote exactly, with no assumption about the split.
   * Docs: https://binance-docs.github.io/apidocs/spot/en/#kline-candlestick-data
   */
  async getFlowCandles(
    symbol: string, interval: string, market: MarketType, limit = 200,
  ): Promise<FlowCandle[]> {
    const iv = INTERVALS[interval];
    if (!iv) return [];
    const url = `${this.base(market)}${this.path(market, '/klines')}`
      + `?symbol=${symbol}&interval=${iv}&limit=${Math.min(1000, limit)}`;
    const rows = await getJson<unknown[][]>(url);
    return rows.map((k) => ({
      time: Math.floor(num(k[0]) / 1000),
      open: num(k[1]), high: num(k[2]), low: num(k[3]), close: num(k[4]),
      volume: num(k[5]),
      quoteVolume: num(k[7]),
      trades: num(k[8]),
      takerBuyBase: num(k[9]),
      takerBuyQuote: num(k[10]),
    }));
  }

  async getOrderBook(symbol: string, market: MarketType, limit = 50): Promise<OrderBook | null> {
    const url = `${this.base(market)}${this.path(market, '/depth')}?symbol=${symbol}&limit=${limit}`;
    const j = await getJson<{ bids: [string, string][]; asks: [string, string][] }>(url);
    return {
      exchange: this.id, symbol,
      bids: j.bids.map(([p, s]) => ({ price: num(p), size: num(s) })),
      asks: j.asks.map(([p, s]) => ({ price: num(p), size: num(s) })),
      timestamp: Date.now(),
    };
  }

  async getTrades(symbol: string, market: MarketType, limit = 50): Promise<Trade[]> {
    const url = `${this.base(market)}${this.path(market, '/trades')}?symbol=${symbol}&limit=${limit}`;
    const rows = await getJson<{ price: string; qty: string; time: number; isBuyerMaker: boolean }[]>(url);
    return rows.map((r) => ({
      exchange: this.id, symbol, price: num(r.price), size: num(r.qty),
      side: r.isBuyerMaker ? 'sell' : 'buy', timestamp: r.time,
    }));
  }

  async getFundingRate(symbol: string): Promise<FundingRate | null> {
    const url = `${FUT}/fapi/v1/premiumIndex?symbol=${symbol}`;
    const j = await getJson<{ lastFundingRate: string; nextFundingTime: number; time: number }>(url);
    return {
      exchange: this.id, symbol, rate: num(j.lastFundingRate),
      nextFundingTime: j.nextFundingTime || null, timestamp: j.time || Date.now(),
    };
  }

  async getOpenInterest(symbol: string): Promise<OpenInterest | null> {
    const [oi, prem] = await Promise.all([
      getJson<{ openInterest: string; time: number }>(`${FUT}/fapi/v1/openInterest?symbol=${symbol}`),
      getJson<{ markPrice: string }>(`${FUT}/fapi/v1/premiumIndex?symbol=${symbol}`).catch(() => null),
    ]);
    const amount = num(oi.openInterest);
    const mark = prem ? num(prem.markPrice) : 0;
    return {
      exchange: this.id, symbol, amount, valueUsd: mark ? amount * mark : 0,
      timestamp: oi.time || Date.now(),
    };
  }

  /** Binance-specific: historical OI series (not part of the common interface). */
  async getOpenInterestHistory(
    symbol: string, period = '1h', limit = 48,
  ): Promise<{ time: number; valueUsd: number; amount: number }[]> {
    const p = ['5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d'].includes(period) ? period : '1h';
    const url = `${FUT}/futures/data/openInterestHist?symbol=${symbol}&period=${p}&limit=${Math.min(500, limit)}`;
    const rows = await getJson<{ sumOpenInterest: string; sumOpenInterestValue: string; timestamp: number }[]>(url);
    return rows.map((r) => ({
      time: r.timestamp, valueUsd: num(r.sumOpenInterestValue), amount: num(r.sumOpenInterest),
    }));
  }

  async getLongShort(symbol: string, interval = '5m'): Promise<LongShortRatio | null> {
    const period = ['5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d'].includes(interval) ? interval : '5m';
    const url = `${FUT}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=${period}&limit=1`;
    const rows = await getJson<{ longAccount: string; shortAccount: string; timestamp: number }[]>(url);
    const r = rows[rows.length - 1];
    if (!r) return null;
    return {
      exchange: this.id, symbol,
      longPct: num(r.longAccount) * 100, shortPct: num(r.shortAccount) * 100,
      timestamp: r.timestamp || Date.now(),
    };
  }
}

export const binance = new BinanceAdapter();
