/**
 * Bybit connector — public market data (Spot + Linear Perpetual).
 * Docs: https://bybit-exchange.github.io/docs/v5/intro
 * No API key required for these public endpoints.
 */
import { BaseAdapter, type AdapterCapabilities } from '@/lib/exchanges/types';
import { getJson, num } from '@/lib/exchanges/http';
import type {
  Candle, ExchangeId, FundingRate, LongShortRatio, MarketType,
  OpenInterest, OrderBook, Ticker, Trade,
} from '@/lib/types';
import { splitSymbol } from '@/lib/symbols';

const BASE = 'https://api.bybit.com';

const INTERVAL: Record<string, string> = {
  '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
  '1h': '60', '4h': '240', '1d': 'D', '1w': 'W',
};

type BybitResp<T> = { retCode: number; retMsg: string; result: T };

function category(market: MarketType) {
  return market === 'futures' ? 'linear' : 'spot';
}

interface BybitTicker {
  symbol: string; lastPrice: string; price24hPcnt: string;
  highPrice24h: string; lowPrice24h: string; turnover24h: string; volume24h: string;
  fundingRate?: string; openInterest?: string; openInterestValue?: string;
  markPrice?: string; indexPrice?: string;
}

export class BybitAdapter extends BaseAdapter {
  readonly id: ExchangeId = 'bybit';
  readonly label = 'Bybit';
  readonly color = '#F7A600';
  readonly supports: AdapterCapabilities = {
    spot: true, futures: true, funding: true, openInterest: true,
    longShort: true, orderBook: true, trades: true, klines: true,
    takerVolume: false,
    wsPublic: 'wss://stream.bybit.com/v5/public/linear',
  };

  private mapTicker(t: BybitTicker, market: MarketType): Ticker | null {
    const { base, quote } = splitSymbol(t.symbol);
    if (!quote) return null;
    return {
      exchange: this.id, market, symbol: t.symbol, base, quote,
      price: num(t.lastPrice),
      priceChange24h: num(t.price24hPcnt) * 100,
      volume24h: num(t.turnover24h),
      high24h: num(t.highPrice24h), low24h: num(t.lowPrice24h),
      fundingRate: t.fundingRate != null ? num(t.fundingRate) : null,
      openInterest: t.openInterestValue != null ? num(t.openInterestValue) : null,
      markPrice: t.markPrice != null ? num(t.markPrice) : null,
      indexPrice: t.indexPrice != null ? num(t.indexPrice) : null,
      timestamp: Date.now(),
    };
  }

  async getTicker(symbol: string, market: MarketType): Promise<Ticker | null> {
    const j = await getJson<BybitResp<{ list: BybitTicker[] }>>(
      `${BASE}/v5/market/tickers?category=${category(market)}&symbol=${symbol}`,
    );
    const t = j.result?.list?.[0];
    return t ? this.mapTicker(t, market) : null;
  }

  async getTickers(market: MarketType): Promise<Ticker[]> {
    const j = await getJson<BybitResp<{ list: BybitTicker[] }>>(
      `${BASE}/v5/market/tickers?category=${category(market)}`,
    );
    return (j.result?.list || [])
      .filter((t) => t.symbol.endsWith('USDT'))
      .map((t) => this.mapTicker(t, market))
      .filter((x): x is Ticker => x !== null);
  }

  async getKlines(symbol: string, interval: string, market: MarketType, limit = 200): Promise<Candle[]> {
    const iv = INTERVAL[interval];
    if (!iv) return [];
    const j = await getJson<BybitResp<{ list: string[][] }>>(
      `${BASE}/v5/market/kline?category=${category(market)}&symbol=${symbol}&interval=${iv}&limit=${limit}`,
    );
    // Bybit returns newest-first: [start, open, high, low, close, volume, turnover]
    return (j.result?.list || [])
      .map((k) => ({
        time: Math.floor(num(k[0]) / 1000),
        open: num(k[1]), high: num(k[2]), low: num(k[3]), close: num(k[4]), volume: num(k[5]),
      }))
      .sort((a, b) => a.time - b.time);
  }

  async getOrderBook(symbol: string, market: MarketType, limit = 50): Promise<OrderBook | null> {
    const j = await getJson<BybitResp<{ b: string[][]; a: string[][] }>>(
      `${BASE}/v5/market/orderbook?category=${category(market)}&symbol=${symbol}&limit=${limit}`,
    );
    const r = j.result;
    if (!r) return null;
    return {
      exchange: this.id, symbol,
      bids: (r.b || []).map((b) => ({ price: num(b[0]), size: num(b[1]) })),
      asks: (r.a || []).map((a) => ({ price: num(a[0]), size: num(a[1]) })),
      timestamp: Date.now(),
    };
  }

  async getTrades(symbol: string, market: MarketType, limit = 50): Promise<Trade[]> {
    const j = await getJson<BybitResp<{ list: { price: string; size: string; side: string; time: string }[] }>>(
      `${BASE}/v5/market/recent-trade?category=${category(market)}&symbol=${symbol}&limit=${limit}`,
    );
    return (j.result?.list || []).map((t) => ({
      exchange: this.id, symbol, price: num(t.price), size: num(t.size),
      side: t.side === 'Buy' ? 'buy' : 'sell', timestamp: num(t.time) || Date.now(),
    }));
  }

  async getFundingRate(symbol: string): Promise<FundingRate | null> {
    const t = await this.getTicker(symbol, 'futures');
    if (!t || t.fundingRate == null) return null;
    return { exchange: this.id, symbol, rate: t.fundingRate, nextFundingTime: null, timestamp: t.timestamp };
  }

  async getOpenInterest(symbol: string): Promise<OpenInterest | null> {
    const t = await this.getTicker(symbol, 'futures');
    if (!t || t.openInterest == null) return null;
    return { exchange: this.id, symbol, valueUsd: t.openInterest, amount: null, timestamp: t.timestamp };
  }

  async getLongShort(symbol: string, interval = '5m'): Promise<LongShortRatio | null> {
    const MAP: Record<string, string> = {
      '5m': '5min', '15m': '15min', '30m': '30min', '1h': '1h', '4h': '4h', '1d': '1d',
    };
    const period = ['5min', '15min', '30min', '1h', '4h', '1d'].includes(interval)
      ? interval
      : MAP[interval] || '5min';
    const j = await getJson<BybitResp<{ list: { buyRatio: string; sellRatio: string; timestamp: string }[] }>>(
      `${BASE}/v5/market/account-ratio?category=linear&symbol=${symbol}&period=${period}&limit=1`,
    ).catch(() => null);
    const r = j?.result?.list?.[0];
    if (!r) return null;
    return {
      exchange: this.id, symbol,
      longPct: num(r.buyRatio) * 100, shortPct: num(r.sellRatio) * 100,
      timestamp: num(r.timestamp) || Date.now(),
    };
  }
}

export const bybit = new BybitAdapter();
