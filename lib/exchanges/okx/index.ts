/**
 * OKX connector — public market data (Spot + Perpetual SWAP).
 * Docs: https://www.okx.com/docs-v5/
 * No API key required for these public endpoints.
 */
import { BaseAdapter, type AdapterCapabilities } from '@/lib/exchanges/types';
import { getJson, num } from '@/lib/exchanges/http';
import type {
  Candle, ExchangeId, FundingRate, LongShortRatio, MarketType,
  OpenInterest, OrderBook, Ticker, Trade,
} from '@/lib/types';
import { splitSymbol } from '@/lib/symbols';

const BASE = 'https://www.okx.com';

// VDEAR interval -> OKX bar
const BAR: Record<string, string> = {
  '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1h': '1H', '4h': '4H', '1d': '1D', '1w': '1W',
};

type OkxResp<T> = { code: string; msg: string; data: T };

/** VDEAR symbol (BTCUSDT) -> OKX instId. */
function toInst(symbol: string, market: MarketType): string {
  const { base, quote } = splitSymbol(symbol);
  const spot = `${base}-${quote || 'USDT'}`;
  return market === 'futures' ? `${spot}-SWAP` : spot;
}
/** OKX instId -> VDEAR symbol. */
function fromInst(instId: string): { symbol: string; base: string; quote: string } | null {
  const parts = instId.split('-');
  if (parts.length < 2) return null;
  const base = parts[0];
  const quote = parts[1];
  return { symbol: `${base}${quote}`, base, quote };
}

interface OkxTicker {
  instId: string; last: string; open24h: string; high24h: string; low24h: string;
  vol24h: string; volCcy24h: string; ts: string;
}

export class OkxAdapter extends BaseAdapter {
  readonly id: ExchangeId = 'okx';
  readonly label = 'OKX';
  readonly color = '#20C997';
  readonly supports: AdapterCapabilities = {
    spot: true, futures: true, funding: true, openInterest: true,
    longShort: true, orderBook: true, trades: true, klines: true,
    wsPublic: 'wss://ws.okx.com:8443/ws/v5/public',
  };

  private mapTicker(t: OkxTicker, market: MarketType): Ticker | null {
    const id = fromInst(t.instId);
    if (!id) return null;
    const last = num(t.last);
    const open = num(t.open24h);
    const change = open ? ((last - open) / open) * 100 : 0;
    return {
      exchange: this.id, market, symbol: id.symbol, base: id.base, quote: id.quote,
      price: last, priceChange24h: change,
      // volCcy24h is quote-currency volume for USDT pairs.
      volume24h: num(t.volCcy24h),
      high24h: num(t.high24h), low24h: num(t.low24h),
      timestamp: num(t.ts) || Date.now(),
    };
  }

  async getTicker(symbol: string, market: MarketType): Promise<Ticker | null> {
    const inst = toInst(symbol, market);
    const j = await getJson<OkxResp<OkxTicker[]>>(`${BASE}/api/v5/market/ticker?instId=${inst}`);
    const t = j.data?.[0];
    return t ? this.mapTicker(t, market) : null;
  }

  async getTickers(market: MarketType): Promise<Ticker[]> {
    const instType = market === 'futures' ? 'SWAP' : 'SPOT';
    const j = await getJson<OkxResp<OkxTicker[]>>(`${BASE}/api/v5/market/tickers?instType=${instType}`);
    return (j.data || [])
      .filter((t) => {
        const id = fromInst(t.instId);
        return id !== null && id.quote === 'USDT';
      })
      .map((t) => this.mapTicker(t, market))
      .filter((x): x is Ticker => x !== null);
  }

  async getKlines(symbol: string, interval: string, market: MarketType, limit = 200): Promise<Candle[]> {
    const bar = BAR[interval];
    if (!bar) return [];
    const inst = toInst(symbol, market);
    const j = await getJson<OkxResp<string[][]>>(
      `${BASE}/api/v5/market/candles?instId=${inst}&bar=${bar}&limit=${limit}`,
    );
    // OKX returns newest-first: [ts, o, h, l, c, vol, volCcy, ...]
    return (j.data || [])
      .map((k) => ({
        time: Math.floor(num(k[0]) / 1000),
        open: num(k[1]), high: num(k[2]), low: num(k[3]), close: num(k[4]), volume: num(k[5]),
      }))
      .sort((a, b) => a.time - b.time);
  }

  async getOrderBook(symbol: string, market: MarketType, limit = 50): Promise<OrderBook | null> {
    const inst = toInst(symbol, market);
    const j = await getJson<OkxResp<{ bids: string[][]; asks: string[][] }[]>>(
      `${BASE}/api/v5/market/books?instId=${inst}&sz=${limit}`,
    );
    const d = j.data?.[0];
    if (!d) return null;
    return {
      exchange: this.id, symbol,
      bids: d.bids.map((b) => ({ price: num(b[0]), size: num(b[1]) })),
      asks: d.asks.map((a) => ({ price: num(a[0]), size: num(a[1]) })),
      timestamp: Date.now(),
    };
  }

  async getTrades(symbol: string, market: MarketType, limit = 50): Promise<Trade[]> {
    const inst = toInst(symbol, market);
    const j = await getJson<OkxResp<{ px: string; sz: string; side: string; ts: string }[]>>(
      `${BASE}/api/v5/market/trades?instId=${inst}&limit=${limit}`,
    );
    return (j.data || []).map((t) => ({
      exchange: this.id, symbol, price: num(t.px), size: num(t.sz),
      side: t.side === 'buy' ? 'buy' : 'sell', timestamp: num(t.ts) || Date.now(),
    }));
  }

  async getFundingRate(symbol: string): Promise<FundingRate | null> {
    const inst = toInst(symbol, 'futures');
    const j = await getJson<OkxResp<{ fundingRate: string; nextFundingTime: string }[]>>(
      `${BASE}/api/v5/public/funding-rate?instId=${inst}`,
    );
    const d = j.data?.[0];
    if (!d) return null;
    return {
      exchange: this.id, symbol, rate: num(d.fundingRate),
      nextFundingTime: num(d.nextFundingTime) || null, timestamp: Date.now(),
    };
  }

  async getOpenInterest(symbol: string): Promise<OpenInterest | null> {
    const inst = toInst(symbol, 'futures');
    const [oiResp, tickerResp] = await Promise.all([
      getJson<OkxResp<{ oi: string; oiCcy: string }[]>>(`${BASE}/api/v5/public/open-interest?instId=${inst}`),
      getJson<OkxResp<OkxTicker[]>>(`${BASE}/api/v5/market/ticker?instId=${inst}`).catch(() => null),
    ]);
    const d = oiResp.data?.[0];
    if (!d) return null;
    const amount = num(d.oiCcy); // in base currency
    const price = tickerResp?.data?.[0] ? num(tickerResp.data[0].last) : 0;
    return {
      exchange: this.id, symbol, amount, valueUsd: price ? amount * price : 0, timestamp: Date.now(),
    };
  }

  async getLongShort(symbol: string, interval = '5m'): Promise<LongShortRatio | null> {
    const { base } = splitSymbol(symbol);
    const period = ['5m', '15m', '30m', '1h', '2h', '4h', '1d'].includes(interval) ? interval : '5m';
    // Contract long/short account ratio (returns [ts, ratio]).
    const j = await getJson<OkxResp<string[][]>>(
      `${BASE}/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=${base}&period=${period}`,
    ).catch(() => null);
    const row = j?.data?.[0];
    if (!row) return null;
    const ratio = num(row[1]); // long/short ratio
    const longPct = (ratio / (1 + ratio)) * 100;
    return {
      exchange: this.id, symbol, longPct, shortPct: 100 - longPct, timestamp: num(row[0]) || Date.now(),
    };
  }
}

export const okx = new OkxAdapter();
