/**
 * REALTIME.
 *
 * The venue parsers must produce exactly the same normalized types as the REST
 * adapters — in particular the TAKER side, which each venue encodes differently
 * and which every flow calculation depends on. Getting that backwards on one
 * venue would silently invert its contribution to CVD.
 *
 * The client is driven by a fake socket so connect/retry/teardown are verified
 * without a network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  binanceStream, okxStream, bybitStream, bitgetStream, VENUE_STREAMS, venueStream, safeParse,
} from '@/lib/realtime/venues';
import { subscribe, backoffDelay, type WebSocketLike } from '@/lib/realtime/client';

/* ============================ TAKER SIDE ================================== */

test('Binance: isBuyerMaker=true means the TAKER SOLD', () => {
  const sell = binanceStream.parse(JSON.stringify({
    data: { e: 'aggTrade', p: '100', q: '2', T: 1000, m: true },
  }), 'BTCUSDT');
  assert.equal(sell[0]!.trade!.side, 'sell', 'buyer was the maker, so the aggressor sold');

  const buy = binanceStream.parse(JSON.stringify({
    data: { e: 'aggTrade', p: '100', q: '2', T: 1000, m: false },
  }), 'BTCUSDT');
  assert.equal(buy[0]!.trade!.side, 'buy');
  assert.equal(buy[0]!.trade!.price, 100);
  assert.equal(buy[0]!.trade!.size, 2);
  assert.equal(buy[0]!.trade!.exchange, 'binance');
});

test('OKX reports the taker side directly', () => {
  const events = okxStream.parse(JSON.stringify({
    arg: { channel: 'trades', instId: 'BTC-USDT' },
    data: [{ px: '100', sz: '1', side: 'sell', ts: '1700000000000' }],
  }), 'BTCUSDT');
  assert.equal(events[0]!.trade!.side, 'sell');
  assert.equal(events[0]!.trade!.timestamp, 1700000000000);
});

test('Bybit S=Buy is the taker side', () => {
  const events = bybitStream.parse(JSON.stringify({
    topic: 'publicTrade.BTCUSDT',
    data: [{ p: '100', v: '3', S: 'Buy', T: 1700000000000 }],
  }), 'BTCUSDT');
  assert.equal(events[0]!.trade!.side, 'buy');
  assert.equal(events[0]!.trade!.size, 3);
});

test('Bitget reports the taker side directly', () => {
  const events = bitgetStream.parse(JSON.stringify({
    arg: { instType: 'SPOT', channel: 'trade', instId: 'BTCUSDT' },
    data: [{ price: '100', size: '1.5', side: 'sell', ts: '1700000000000' }],
  }), 'BTCUSDT');
  assert.equal(events[0]!.trade!.side, 'sell');
  assert.equal(events[0]!.trade!.exchange, 'bitget');
});

test('all four venues agree on the shape of a normalized trade', () => {
  const frames: [typeof binanceStream, string][] = [
    [binanceStream, JSON.stringify({ data: { e: 'aggTrade', p: '10', q: '1', T: 5, m: false } })],
    [okxStream, JSON.stringify({ arg: { channel: 'trades' }, data: [{ px: '10', sz: '1', side: 'buy', ts: '5' }] })],
    [bybitStream, JSON.stringify({ topic: 'publicTrade.X', data: [{ p: '10', v: '1', S: 'Buy', T: 5 }] })],
    [bitgetStream, JSON.stringify({ arg: { channel: 'trade' }, data: [{ price: '10', size: '1', side: 'buy', ts: '5' }] })],
  ];
  for (const [venue, raw] of frames) {
    const t = venue.parse(raw, 'BTCUSDT')[0]!.trade!;
    assert.equal(t.price, 10, `${venue.exchange} price`);
    assert.equal(t.size, 1, `${venue.exchange} size`);
    assert.equal(t.side, 'buy', `${venue.exchange} side`);
    assert.equal(t.symbol, 'BTCUSDT', `${venue.exchange} symbol`);
    assert.equal(t.exchange, venue.exchange);
  }
});

/* ============================== TICKERS =================================== */

test('Binance ticker maps percent change and quote volume', () => {
  const e = binanceStream.parse(JSON.stringify({
    data: { e: '24hrTicker', c: '105', P: '5.0', q: '1000000', h: '110', l: '100', E: 42 },
  }), 'BTCUSDT')[0]!;
  assert.equal(e.tick!.price, 105);
  assert.equal(e.ticker!.priceChange24h, 5);
  assert.equal(e.ticker!.volume24h, 1_000_000);
});

test('OKX ticker derives percent change from open24h', () => {
  const e = okxStream.parse(JSON.stringify({
    arg: { channel: 'tickers' },
    data: [{ last: '110', open24h: '100', volCcy24h: '5000', high24h: '111', low24h: '99', ts: '7' }],
  }), 'BTCUSDT')[0]!;
  assert.equal(e.tick!.price, 110);
  assert.ok(Math.abs(e.ticker!.priceChange24h! - 10) < 1e-9, 'derived from open, not assumed');
});

test('Bybit converts its fractional 24h change to percent', () => {
  const e = bybitStream.parse(JSON.stringify({
    topic: 'tickers.BTCUSDT',
    data: { lastPrice: '105', price24hPcnt: '0.05', turnover24h: '900', highPrice24h: '110', lowPrice24h: '100' },
    ts: 9,
  }), 'BTCUSDT')[0]!;
  assert.equal(e.ticker!.priceChange24h, 5, '0.05 is 5%, not 0.05%');
});

test('Bitget converts its fractional 24h change to percent', () => {
  const e = bitgetStream.parse(JSON.stringify({
    arg: { channel: 'ticker' },
    data: [{ lastPr: '105', change24h: '0.05', usdtVolume: '900', high24h: '110', low24h: '100', ts: '9' }],
  }), 'BTCUSDT')[0]!;
  assert.equal(e.ticker!.priceChange24h, 5);
});

/* ============================ ROBUSTNESS ================================== */

test('heartbeats, acks and malformed frames yield no events', () => {
  for (const v of VENUE_STREAMS) {
    assert.deepEqual(v.parse('pong', 'BTCUSDT'), [], `${v.exchange} plain text`);
    assert.deepEqual(v.parse('{not json', 'BTCUSDT'), [], `${v.exchange} broken json`);
    assert.deepEqual(v.parse('{}', 'BTCUSDT'), [], `${v.exchange} empty object`);
    assert.deepEqual(v.parse('null', 'BTCUSDT'), [], `${v.exchange} null`);
    assert.deepEqual(v.parse(JSON.stringify({ event: 'subscribe', code: '0' }), 'BTCUSDT'), [],
      `${v.exchange} subscription ack`);
  }
});

test('safeParse never throws on junk', () => {
  assert.equal(safeParse('{oops'), null);
  assert.equal(safeParse('42'), null, 'a bare number is not a message object');
  assert.deepEqual(safeParse('{"a":1}'), { a: 1 });
});

test('subscription frames name the requested symbol and channel', () => {
  assert.match(binanceStream.subscribeFrame('BTCUSDT', 'trade')!, /btcusdt@aggTrade/);
  assert.match(binanceStream.subscribeFrame('BTCUSDT', 'ticker')!, /btcusdt@ticker/);
  assert.match(okxStream.subscribeFrame('BTCUSDT', 'trade')!, /BTC-USDT/);
  assert.match(bybitStream.subscribeFrame('BTCUSDT', 'ticker')!, /tickers\.BTCUSDT/);
  assert.match(bitgetStream.subscribeFrame('BTCUSDT', 'trade')!, /BTCUSDT/);
});

test('every stream endpoint is public and carries no credential', () => {
  for (const v of VENUE_STREAMS) {
    assert.match(v.url, /^wss:\/\//, `${v.exchange} must use wss`);
    assert.equal(/key|token|secret|sign/i.test(v.url), false,
      `${v.exchange} URL must not carry credentials`);
  }
  assert.equal(venueStream('binance')?.exchange, 'binance');
});

/* ============================== CLIENT ==================================== */

class FakeSocket implements WebSocketLike {
  static instances: FakeSocket[] = [];
  sent: string[] = [];
  closed = false;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;

  constructor(readonly url: string) { FakeSocket.instances.push(this); }
  send(data: string) { this.sent.push(data); }
  close() { this.closed = true; }
  open() { this.onopen?.({}); }
  emit(data: string) { this.onmessage?.({ data }); }
  drop() { this.onclose?.({}); }
}

test('the client connects to every venue and subscribes on open', () => {
  FakeSocket.instances = [];
  const events: string[] = [];
  const sub = subscribe({
    symbol: 'BTCUSDT', channel: 'trade',
    handlers: { onEvent: (e) => events.push(e.channel) },
    socketFactory: (url) => new FakeSocket(url),
  });

  assert.equal(FakeSocket.instances.length, 4, 'one socket per venue');
  FakeSocket.instances.forEach((s) => s.open());
  FakeSocket.instances.forEach((s) => {
    assert.equal(s.sent.length, 1, `${s.url} should have sent a subscribe frame`);
  });

  assert.deepEqual(sub.status(), {
    binance: 'open', okx: 'open', bybit: 'open', bitget: 'open',
  });
  sub.close();
  assert.ok(FakeSocket.instances.every((s) => s.closed), 'close() tears down every socket');
});

test('the client can be limited to specific venues', () => {
  FakeSocket.instances = [];
  const sub = subscribe({
    symbol: 'BTCUSDT', channel: 'ticker', exchanges: ['binance'],
    handlers: { onEvent: () => {} },
    socketFactory: (url) => new FakeSocket(url),
  });
  assert.equal(FakeSocket.instances.length, 1);
  assert.match(FakeSocket.instances[0]!.url, /binance/);
  sub.close();
});

test('events from one venue flow through to the handler', () => {
  FakeSocket.instances = [];
  const trades: number[] = [];
  const sub = subscribe({
    symbol: 'BTCUSDT', channel: 'trade', exchanges: ['binance'],
    handlers: { onEvent: (e) => { if (e.trade) trades.push(e.trade.price); } },
    socketFactory: (url) => new FakeSocket(url),
  });
  const s = FakeSocket.instances[0]!;
  s.open();
  s.emit(JSON.stringify({ data: { e: 'aggTrade', p: '123', q: '1', T: 1, m: false } }));
  assert.deepEqual(trades, [123]);
  sub.close();
});

test('ONE VENUE SENDING GARBAGE DOES NOT BREAK THE OTHERS', () => {
  FakeSocket.instances = [];
  const prices: number[] = [];
  const sub = subscribe({
    symbol: 'BTCUSDT', channel: 'trade', exchanges: ['binance', 'okx'],
    handlers: { onEvent: (e) => { if (e.trade) prices.push(e.trade.price); } },
    socketFactory: (url) => new FakeSocket(url),
  });
  const [a, b] = FakeSocket.instances;
  a!.open(); b!.open();

  a!.emit('<<< not json at all >>>');
  b!.emit(JSON.stringify({ arg: { channel: 'trades' }, data: [{ px: '456', sz: '1', side: 'buy', ts: '1' }] }));

  assert.deepEqual(prices, [456], 'the healthy venue still delivers');
  sub.close();
});

test('a venue that keeps failing is dropped rather than retried forever', async () => {
  FakeSocket.instances = [];
  const statuses: string[] = [];
  const sub = subscribe({
    symbol: 'BTCUSDT', channel: 'ticker', exchanges: ['binance'],
    maxRetries: 2,
    handlers: { onEvent: () => {}, onStatus: (_e, s) => statuses.push(s) },
    socketFactory: (url) => new FakeSocket(url),
  });

  // Fail more times than maxRetries allows, letting each scheduled retry run.
  for (let i = 0; i < 4; i++) {
    const socket = FakeSocket.instances[FakeSocket.instances.length - 1]!;
    socket.drop();
    await new Promise((r) => setTimeout(r, 40));
  }

  assert.ok(statuses.includes('unsupported'),
    'the venue is eventually reported as down instead of reconnecting indefinitely');
  assert.ok(FakeSocket.instances.length <= 4, 'retries are bounded');
  sub.close();
});

test('reconnect backoff grows and is jittered', () => {
  const full = () => 1;
  assert.equal(backoffDelay(0, full), 500);
  assert.equal(backoffDelay(1, full), 1000);
  assert.equal(backoffDelay(2, full), 2000);
  assert.equal(backoffDelay(9, full), 15_000, 'capped');
  // Jitter: without it, every open tab reconnects in lockstep after a blip.
  assert.equal(backoffDelay(3, () => 0), 0);
  assert.ok(backoffDelay(3, () => 0.5) < backoffDelay(3, full));
});

test('a socket that throws on construction is retried, not fatal', () => {
  FakeSocket.instances = [];
  let first = true;
  const sub = subscribe({
    symbol: 'BTCUSDT', channel: 'ticker', exchanges: ['binance'],
    handlers: { onEvent: () => {} },
    socketFactory: (url) => {
      if (first) { first = false; throw new Error('blocked'); }
      return new FakeSocket(url);
    },
  });
  assert.deepEqual(sub.status(), { binance: 'error' });
  sub.close();
});
