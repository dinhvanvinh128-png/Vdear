/**
 * Per-venue public WebSocket adapters.
 *
 * These mirror the REST adapters' normalization exactly — same VDEAR types, same
 * taker-side convention — so a realtime tick and a REST tick are interchangeable
 * downstream. All endpoints are public and keyless; no credential is ever sent.
 */
import type { ExchangeId } from '@/lib/types';
import { splitSymbol } from '@/lib/symbols';
import type { RealtimeChannel, RealtimeEvent, VenueStream } from '@/lib/realtime/types';

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/** Binance combined stream — the symbol is encoded in the URL path. */
export const binanceStream: VenueStream = {
  exchange: 'binance',
  url: 'wss://stream.binance.com:9443/stream',
  subscribeFrame(symbol, channel) {
    const s = symbol.toLowerCase();
    const streams = channel === 'trade' ? [`${s}@aggTrade`] : [`${s}@ticker`];
    return JSON.stringify({ method: 'SUBSCRIBE', params: streams, id: Date.now() });
  },
  parse(raw, symbol) {
    const msg = safeParse(raw);
    const d = (msg?.data ?? msg) as Record<string, unknown> | undefined;
    if (!d) return [];

    if (d.e === 'aggTrade') {
      return [{
        channel: 'trade',
        trade: {
          exchange: 'binance', symbol,
          price: num(d.p), size: num(d.q),
          // `m` is isBuyerMaker: true means the taker SOLD.
          side: d.m ? 'sell' : 'buy',
          timestamp: num(d.T) || Date.now(),
        },
      }];
    }
    if (d.e === '24hrTicker') {
      return [{
        channel: 'ticker',
        tick: { exchange: 'binance', symbol, price: num(d.c), timestamp: num(d.E) || Date.now() },
        ticker: { priceChange24h: num(d.P), volume24h: num(d.q), high24h: num(d.h), low24h: num(d.l) },
      }];
    }
    return [];
  },
};

/** OKX v5 public channel. */
export const okxStream: VenueStream = {
  exchange: 'okx',
  url: 'wss://ws.okx.com:8443/ws/v5/public',
  subscribeFrame(symbol, channel) {
    const { base, quote } = splitSymbol(symbol);
    const instId = `${base}-${quote || 'USDT'}`;
    return JSON.stringify({
      op: 'subscribe',
      args: [{ channel: channel === 'trade' ? 'trades' : 'tickers', instId }],
    });
  },
  parse(raw, symbol) {
    const msg = safeParse(raw);
    const arg = msg?.arg as { channel?: string } | undefined;
    const rows = msg?.data as Record<string, unknown>[] | undefined;
    if (!arg || !Array.isArray(rows)) return [];

    if (arg.channel === 'trades') {
      return rows.map((r): RealtimeEvent => ({
        channel: 'trade',
        trade: {
          exchange: 'okx', symbol,
          price: num(r.px), size: num(r.sz),
          // OKX reports the TAKER side directly.
          side: r.side === 'buy' ? 'buy' : 'sell',
          timestamp: num(r.ts) || Date.now(),
        },
      }));
    }
    if (arg.channel === 'tickers') {
      return rows.map((r): RealtimeEvent => {
        const last = num(r.last);
        const open = num(r.open24h);
        return {
          channel: 'ticker',
          tick: { exchange: 'okx', symbol, price: last, timestamp: num(r.ts) || Date.now() },
          ticker: {
            priceChange24h: open ? ((last - open) / open) * 100 : 0,
            volume24h: num(r.volCcy24h), high24h: num(r.high24h), low24h: num(r.low24h),
          },
        };
      });
    }
    return [];
  },
  // OKX closes idle connections after 30s.
  pingFrame: 'ping',
  pingIntervalMs: 20_000,
};

/** Bybit v5 public spot stream. */
export const bybitStream: VenueStream = {
  exchange: 'bybit',
  url: 'wss://stream.bybit.com/v5/public/spot',
  subscribeFrame(symbol, channel) {
    const topic = channel === 'trade' ? `publicTrade.${symbol}` : `tickers.${symbol}`;
    return JSON.stringify({ op: 'subscribe', args: [topic] });
  },
  parse(raw, symbol) {
    const msg = safeParse(raw);
    if (!msg) return [];
    const topic = typeof msg.topic === 'string' ? msg.topic : '';
    if (!topic) return [];

    if (topic.startsWith('publicTrade')) {
      const rows = (msg.data ?? []) as Record<string, unknown>[];
      return rows.map((r): RealtimeEvent => ({
        channel: 'trade',
        trade: {
          exchange: 'bybit', symbol,
          price: num(r.p), size: num(r.v),
          // 'S' is the taker side.
          side: r.S === 'Buy' ? 'buy' : 'sell',
          timestamp: num(r.T) || Date.now(),
        },
      }));
    }
    if (topic.startsWith('tickers')) {
      const d = msg.data as Record<string, unknown> | undefined;
      if (!d) return [];
      return [{
        channel: 'ticker',
        tick: { exchange: 'bybit', symbol, price: num(d.lastPrice), timestamp: num(msg.ts) || Date.now() },
        ticker: {
          priceChange24h: num(d.price24hPcnt) * 100,
          volume24h: num(d.turnover24h), high24h: num(d.highPrice24h), low24h: num(d.lowPrice24h),
        },
      }];
    }
    return [];
  },
  pingFrame: JSON.stringify({ op: 'ping' }),
  pingIntervalMs: 20_000,
};

/** Bitget v2 public stream. */
export const bitgetStream: VenueStream = {
  exchange: 'bitget',
  url: 'wss://ws.bitget.com/v2/ws/public',
  subscribeFrame(symbol, channel) {
    return JSON.stringify({
      op: 'subscribe',
      args: [{ instType: 'SPOT', channel: channel === 'trade' ? 'trade' : 'ticker', instId: symbol }],
    });
  },
  parse(raw, symbol) {
    const msg = safeParse(raw);
    const arg = msg?.arg as { channel?: string } | undefined;
    const rows = msg?.data as Record<string, unknown>[] | undefined;
    if (!arg || !Array.isArray(rows)) return [];

    if (arg.channel === 'trade') {
      return rows.map((r): RealtimeEvent => ({
        channel: 'trade',
        trade: {
          exchange: 'bitget', symbol,
          price: num(r.price), size: num(r.size),
          side: r.side === 'buy' ? 'buy' : 'sell',
          timestamp: num(r.ts) || Date.now(),
        },
      }));
    }
    if (arg.channel === 'ticker') {
      return rows.map((r): RealtimeEvent => ({
        channel: 'ticker',
        tick: { exchange: 'bitget', symbol, price: num(r.lastPr), timestamp: num(r.ts) || Date.now() },
        ticker: {
          priceChange24h: num(r.change24h) * 100,
          volume24h: num(r.usdtVolume), high24h: num(r.high24h), low24h: num(r.low24h),
        },
      }));
    }
    return [];
  },
  pingFrame: 'ping',
  pingIntervalMs: 25_000,
};

export const VENUE_STREAMS: VenueStream[] = [
  binanceStream, okxStream, bybitStream, bitgetStream,
];

export function venueStream(exchange: ExchangeId): VenueStream | undefined {
  return VENUE_STREAMS.find((v) => v.exchange === exchange);
}

/** A malformed frame must never take down the stream. */
function safeParse(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export { safeParse, num as parseNumber };
export type { RealtimeChannel };
