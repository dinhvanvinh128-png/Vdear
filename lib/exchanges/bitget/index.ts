/**
 * Bitget connector — public market data (Spot + USDT-M Futures).
 * Docs: https://www.bitget.com/api-doc/
 * No API key required for these public endpoints.
 */
import { BaseAdapter, type AdapterCapabilities } from '@/lib/exchanges/types';
import { getJson, num } from '@/lib/exchanges/http';
import type {
  Candle, ExchangeId, FundingRate, MarketType,
  OpenInterest, OrderBook, Ticker, Trade,
} from '@/lib/types';
import { splitSymbol } from '@/lib/symbols';

const BASE = 'https://api.bitget.com';
const PRODUCT = 'USDT-FUTURES';

// VDEAR interval -> Bitget mix granularity
const GRAN: Record<string, string> = {
  '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1h': '1H', '4h': '4H', '1d': '1D', '1w': '1W',
};

type BgResp<T> = { code: string; msg: string; data: T };

interface BgMixTicker {
  symbol: string; lastPr: string; change24h: string; high24h: string; low24h: string;
  quoteVolume: string; baseVolume: string; fundingRate: string; holdingAmount: string;
  markPrice: string; indexPrice: string; ts: string;
}
interface BgSpotTicker {
  symbol: string; lastPr: string; change24h: string; high24h: string; low24h: string;
  quoteVolume: string; baseVolume: string; ts: string;
}

export class BitgetAdapter extends BaseAdapter {
  readonly id: ExchangeId = 'bitget';
  readonly label = 'Bitget';
  readonly color = '#00E0C7';
  readonly supports: AdapterCapabilities = {
    spot: true, futures: true, funding: true, openInterest: true,
    longShort: false, orderBook: true, trades: true, klines: true,
    wsPublic: 'wss://ws.bitget.com/v2/ws/public',
  };

  private mapMix(t: BgMixTicker): Ticker | null {
    const { base, quote } = splitSymbol(t.symbol);
    if (!quote) return null;
    const price = num(t.lastPr);
    const holding = num(t.holdingAmount);
    const mark = num(t.markPrice) || price;
    return {
      exchange: this.id, market: 'futures', symbol: t.symbol, base, quote,
      price, priceChange24h: num(t.change24h) * 100,
      volume24h: num(t.quoteVolume),
      high24h: num(t.high24h), low24h: num(t.low24h),
      fundingRate: t.fundingRate != null ? num(t.fundingRate) : null,
      openInterest: holding ? holding * mark : null,
      markPrice: num(t.markPrice) || null, indexPrice: num(t.indexPrice) || null,
      timestamp: num(t.ts) || Date.now(),
    };
  }
  private mapSpot(t: BgSpotTicker): Ticker | null {
    const { base, quote } = splitSymbol(t.symbol);
    if (!quote) return null;
    return {
      exchange: this.id, market: 'spot', symbol: t.symbol, base, quote,
      price: num(t.lastPr), priceChange24h: num(t.change24h) * 100,
      volume24h: num(t.quoteVolume), high24h: num(t.high24h), low24h: num(t.low24h),
      timestamp: num(t.ts) || Date.now(),
    };
  }

  async getTicker(symbol: string, market: MarketType): Promise<Ticker | null> {
    if (market === 'futures') {
      const j = await getJson<BgResp<BgMixTicker[]>>(
        `${BASE}/api/v2/mix/market/ticker?symbol=${symbol}&productType=${PRODUCT}`,
      );
      const t = j.data?.[0];
      return t ? this.mapMix(t) : null;
    }
    const j = await getJson<BgResp<BgSpotTicker[]>>(`${BASE}/api/v2/spot/market/tickers?symbol=${symbol}`);
    const t = j.data?.[0];
    return t ? this.mapSpot(t) : null;
  }

  async getTickers(market: MarketType): Promise<Ticker[]> {
    if (market === 'futures') {
      const j = await getJson<BgResp<BgMixTicker[]>>(
        `${BASE}/api/v2/mix/market/tickers?productType=${PRODUCT}`,
      );
      return (j.data || [])
        .filter((t) => t.symbol.endsWith('USDT'))
        .map((t) => this.mapMix(t))
        .filter((x): x is Ticker => x !== null);
    }
    const j = await getJson<BgResp<BgSpotTicker[]>>(`${BASE}/api/v2/spot/market/tickers`);
    return (j.data || [])
      .filter((t) => t.symbol.endsWith('USDT'))
      .map((t) => this.mapSpot(t))
      .filter((x): x is Ticker => x !== null);
  }

  async getKlines(symbol: string, interval: string, market: MarketType, limit = 200): Promise<Candle[]> {
    const gran = GRAN[interval];
    if (!gran) return [];
    const url = market === 'futures'
      ? `${BASE}/api/v2/mix/market/candles?symbol=${symbol}&productType=${PRODUCT}&granularity=${gran}&limit=${limit}`
      : `${BASE}/api/v2/spot/market/candles?symbol=${symbol}&granularity=${gran}&limit=${limit}`;
    const j = await getJson<BgResp<string[][]>>(url);
    // [ts, open, high, low, close, baseVol, quoteVol]
    return (j.data || [])
      .map((k) => ({
        time: Math.floor(num(k[0]) / 1000),
        open: num(k[1]), high: num(k[2]), low: num(k[3]), close: num(k[4]), volume: num(k[5]),
      }))
      .sort((a, b) => a.time - b.time);
  }

  async getOrderBook(symbol: string, market: MarketType, limit = 50): Promise<OrderBook | null> {
    const url = market === 'futures'
      ? `${BASE}/api/v2/mix/market/merge-depth?symbol=${symbol}&productType=${PRODUCT}&limit=${limit}`
      : `${BASE}/api/v2/spot/market/merge-depth?symbol=${symbol}&limit=${limit}`;
    const j = await getJson<BgResp<{ bids: string[][]; asks: string[][] }>>(url);
    const d = j.data;
    if (!d) return null;
    return {
      exchange: this.id, symbol,
      bids: (d.bids || []).map((b) => ({ price: num(b[0]), size: num(b[1]) })),
      asks: (d.asks || []).map((a) => ({ price: num(a[0]), size: num(a[1]) })),
      timestamp: Date.now(),
    };
  }

  async getTrades(symbol: string, market: MarketType, limit = 50): Promise<Trade[]> {
    const url = market === 'futures'
      ? `${BASE}/api/v2/mix/market/fills?symbol=${symbol}&productType=${PRODUCT}&limit=${limit}`
      : `${BASE}/api/v2/spot/market/fills?symbol=${symbol}&limit=${limit}`;
    const j = await getJson<BgResp<{ price: string; size: string; side: string; ts: string }[]>>(url);
    return (j.data || []).map((t) => ({
      exchange: this.id, symbol, price: num(t.price), size: num(t.size),
      side: t.side === 'buy' ? 'buy' : 'sell', timestamp: num(t.ts) || Date.now(),
    }));
  }

  async getFundingRate(symbol: string): Promise<FundingRate | null> {
    const j = await getJson<BgResp<{ fundingRate: string }[]>>(
      `${BASE}/api/v2/mix/market/current-fund-rate?symbol=${symbol}&productType=${PRODUCT}`,
    );
    const d = j.data?.[0];
    if (!d) return null;
    return { exchange: this.id, symbol, rate: num(d.fundingRate), nextFundingTime: null, timestamp: Date.now() };
  }

  async getOpenInterest(symbol: string): Promise<OpenInterest | null> {
    const t = await this.getTicker(symbol, 'futures');
    if (!t || t.openInterest == null) return null;
    return { exchange: this.id, symbol, valueUsd: t.openInterest, amount: null, timestamp: t.timestamp };
  }
}

export const bitget = new BitgetAdapter();
