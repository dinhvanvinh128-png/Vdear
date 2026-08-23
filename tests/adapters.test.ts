/**
 * EXCHANGE ADAPTER NORMALIZATION.
 *
 * Each venue is driven end-to-end with a stubbed fetch: URL construction ->
 * response mapping -> VDEAR types. Fixtures follow each exchange's DOCUMENTED
 * response shape.
 *
 * The recurring class of bug these guard against is a unit mismatch that no
 * type checker can catch: base volume where quote volume is expected, a
 * fractional change where a percent is expected, an inverted taker side. Each
 * of those silently corrupts every score downstream while looking perfectly
 * valid.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { binance } from '@/lib/exchanges/binance';
import { okx } from '@/lib/exchanges/okx';
import { bybit } from '@/lib/exchanges/bybit';
import { bitget } from '@/lib/exchanges/bitget';
import { ADAPTERS, resolveAdapters } from '@/lib/exchanges/registry';
import { HttpError } from '@/lib/exchanges/http';

type FetchStub = (url: string) => unknown;

const realFetch = globalThis.fetch;
const requestedUrls: string[] = [];

/** Serve fixtures by URL substring; unmatched URLs fail loudly. */
function stubFetch(routes: [string, unknown][]): void {
  requestedUrls.length = 0;
  (globalThis as { fetch: unknown }).fetch = async (input: unknown) => {
    const url = String(input);
    requestedUrls.push(url);
    const hit = routes.find(([fragment]) => url.includes(fragment));
    if (!hit) {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => hit[1] };
  };
}

function restoreFetch(): void {
  (globalThis as { fetch: unknown }).fetch = realFetch;
}

function failFetch(status: number): void {
  (globalThis as { fetch: unknown }).fetch = async () => ({
    ok: false, status, json: async () => ({}),
  });
}

/* ================================ BINANCE ================================= */

test('binance 24h ticker maps quote volume, not base volume', async () => {
  // volume (base) and quoteVolume (USDT) differ by ~100,000x here. Reading the
  // wrong field would make every volume-weighted figure meaningless.
  stubFetch([['/ticker/24hr', {
    symbol: 'BTCUSDT', lastPrice: '100000.00', priceChangePercent: '2.35',
    highPrice: '101000', lowPrice: '99000',
    volume: '12000.5', quoteVolume: '1200500000', closeTime: 1700000000000,
  }]]);
  const t = (await binance.getTicker('BTCUSDT', 'spot'))!;
  restoreFetch();

  assert.equal(t.exchange, 'binance');
  assert.equal(t.symbol, 'BTCUSDT');
  assert.equal(t.base, 'BTC');
  assert.equal(t.quote, 'USDT');
  assert.equal(t.price, 100000);
  assert.equal(t.priceChange24h, 2.35, 'already a percent, not a fraction');
  assert.equal(t.volume24h, 1_200_500_000, 'QUOTE volume');
  assert.notEqual(t.volume24h, 12000.5);
  assert.equal(t.timestamp, 1700000000000);
});

test('binance flow candles read taker-buy volume from index 10', async () => {
  // [openTime, o, h, l, c, baseVol, closeTime, quoteVol, trades, takerBase, takerQuote, ignore]
  stubFetch([['/klines', [
    [1700000000000, '100', '105', '99', '104', '10', 1700000059999, '1040', 42, '7', '728', '0'],
  ]]]);
  const candles = await binance.getFlowCandles('BTCUSDT', '1m', 'spot', 1);
  restoreFetch();

  const c = candles[0]!;
  assert.equal(c.time, 1700000000, 'seconds, matching the Candle convention');
  assert.equal(c.close, 104);
  assert.equal(c.quoteVolume, 1040);
  assert.equal(c.takerBuyQuote, 728, 'index 10 — aggressive buying in USDT');
  assert.equal(c.takerBuyBase, 7, 'index 9');
  assert.equal(c.trades, 42);
  // The derived sell side is what CVD actually consumes.
  assert.equal(c.quoteVolume - c.takerBuyQuote!, 312);
});

test('binance trades invert isBuyerMaker into the taker side', async () => {
  stubFetch([['/trades', [
    { price: '100', qty: '1', time: 1, isBuyerMaker: true },
    { price: '101', qty: '2', time: 2, isBuyerMaker: false },
  ]]]);
  const trades = await binance.getTrades('BTCUSDT', 'spot', 2);
  restoreFetch();

  assert.equal(trades[0]!.side, 'sell', 'buyer was the maker, so the aggressor sold');
  assert.equal(trades[1]!.side, 'buy');
});

test('binance order book maps both sides in quote-comparable form', async () => {
  stubFetch([['/depth', {
    bids: [['99.9', '2'], ['99.8', '3']],
    asks: [['100.1', '1'], ['100.2', '4']],
  }]]);
  const book = (await binance.getOrderBook('BTCUSDT', 'spot', 10))!;
  restoreFetch();

  assert.equal(book.bids[0]!.price, 99.9);
  assert.equal(book.bids[0]!.size, 2);
  assert.equal(book.asks[0]!.price, 100.1);
  assert.equal(book.exchange, 'binance');
});

test('binance funding rate stays a FRACTION, not a percent', async () => {
  // 0.0001 = 0.01%. Multiplying here would make funding look 100x richer and
  // trip every leverage warning.
  stubFetch([['/premiumIndex', {
    lastFundingRate: '0.0001', nextFundingTime: 1700000000000, time: 1699999999000,
  }]]);
  const f = (await binance.getFundingRate('BTCUSDT'))!;
  restoreFetch();
  assert.equal(f.rate, 0.0001);
});

test('binance long/short converts account fractions to percent', async () => {
  stubFetch([['globalLongShortAccountRatio', [
    { longAccount: '0.62', shortAccount: '0.38', timestamp: 1700000000000 },
  ]]]);
  const ls = (await binance.getLongShort('BTCUSDT', '5m'))!;
  restoreFetch();
  assert.equal(ls.longPct, 62);
  assert.equal(ls.shortPct, 38);
});

test('binance open interest is valued at the mark price', async () => {
  stubFetch([
    ['/openInterest', { openInterest: '1000', time: 1700000000000 }],
    ['/premiumIndex', { markPrice: '100000' }],
  ]);
  const oi = (await binance.getOpenInterest('BTCUSDT'))!;
  restoreFetch();
  assert.equal(oi.amount, 1000);
  assert.equal(oi.valueUsd, 100_000_000, '1000 contracts at 100k');
});

/* ================================== OKX =================================== */

test('okx derives percent change from open24h rather than assuming a field', async () => {
  stubFetch([['/api/v5/market/ticker', {
    code: '0', msg: '',
    data: [{
      instId: 'BTC-USDT', last: '102000', open24h: '100000',
      high24h: '103000', low24h: '99500', vol24h: '5000', volCcy24h: '510000000',
      ts: '1700000000000',
    }],
  }]]);
  const t = (await okx.getTicker('BTCUSDT', 'spot'))!;
  restoreFetch();

  assert.equal(t.symbol, 'BTCUSDT', 'instId BTC-USDT normalized to the VDEAR symbol');
  assert.equal(t.base, 'BTC');
  assert.equal(t.price, 102000);
  assert.equal(t.priceChange24h, 2, '(102000-100000)/100000');
  assert.equal(t.volume24h, 510_000_000, 'volCcy24h is the quote-currency figure');
});

test('okx builds the SWAP instId for futures and spot for spot', async () => {
  stubFetch([['/api/v5/market/ticker', { code: '0', data: [] }]]);
  await okx.getTicker('BTCUSDT', 'futures');
  assert.ok(requestedUrls[0]!.includes('BTC-USDT-SWAP'), requestedUrls[0]);

  await okx.getTicker('BTCUSDT', 'spot');
  assert.ok(requestedUrls[1]!.includes('instId=BTC-USDT'), requestedUrls[1]);
  assert.equal(requestedUrls[1]!.includes('SWAP'), false);
  restoreFetch();
});

test('okx candles are reversed into ascending order', async () => {
  // OKX returns newest-first; every indicator assumes oldest-first.
  stubFetch([['/api/v5/market/candles', {
    code: '0',
    data: [
      ['1700000120000', '3', '3', '3', '3', '1', '3'],
      ['1700000060000', '2', '2', '2', '2', '1', '2'],
      ['1700000000000', '1', '1', '1', '1', '1', '1'],
    ],
  }]]);
  const candles = await okx.getKlines('BTCUSDT', '1m', 'spot', 3);
  restoreFetch();

  assert.deepEqual(candles.map((c) => c.close), [1, 2, 3]);
  assert.ok(candles[0]!.time < candles[2]!.time);
});

test('okx trades carry the taker side directly', async () => {
  stubFetch([['/api/v5/market/trades', {
    code: '0',
    data: [{ px: '100', sz: '1', side: 'sell', ts: '1700000000000' }],
  }]]);
  const trades = await okx.getTrades('BTCUSDT', 'spot', 1);
  restoreFetch();
  assert.equal(trades[0]!.side, 'sell');
  assert.equal(trades[0]!.exchange, 'okx');
});

/* ================================= BYBIT ================================== */

test('bybit converts its fractional 24h change into a percent', async () => {
  // price24hPcnt is a FRACTION. Passing it through unscaled would report a 5%
  // move as 0.05% and flatten every trend and breadth reading.
  stubFetch([['/v5/market/tickers', {
    retCode: 0,
    result: {
      list: [{
        symbol: 'BTCUSDT', lastPrice: '105000', price24hPcnt: '0.05',
        highPrice24h: '106000', lowPrice24h: '99000',
        turnover24h: '900000000', volume24h: '8500',
      }],
    },
  }]]);
  const t = (await bybit.getTicker('BTCUSDT', 'spot'))!;
  restoreFetch();

  assert.equal(t.price, 105000);
  assert.equal(t.priceChange24h, 5, '0.05 is 5%');
  assert.equal(t.volume24h, 900_000_000, 'turnover24h is the quote figure');
});

test('bybit candles are reversed into ascending order', async () => {
  stubFetch([['/v5/market/kline', {
    retCode: 0,
    result: {
      list: [
        ['1700000120000', '3', '3', '3', '3', '1', '3'],
        ['1700000060000', '2', '2', '2', '2', '1', '2'],
        ['1700000000000', '1', '1', '1', '1', '1', '1'],
      ],
    },
  }]]);
  const candles = await bybit.getKlines('BTCUSDT', '1m', 'spot', 3);
  restoreFetch();
  assert.deepEqual(candles.map((c) => c.close), [1, 2, 3]);
});

test('bybit trades map S=Buy to the taker side', async () => {
  stubFetch([['/v5/market/recent-trade', {
    retCode: 0,
    result: { list: [{ price: '100', size: '2', side: 'Buy', time: '1700000000000' }] },
  }]]);
  const trades = await bybit.getTrades('BTCUSDT', 'spot', 1);
  restoreFetch();
  assert.equal(trades[0]!.side, 'buy');
  assert.equal(trades[0]!.size, 2);
});

/* ================================ BITGET ================================== */

test('bitget spot ticker normalizes into the VDEAR shape', async () => {
  stubFetch([['/api/v2/spot/market/tickers', {
    code: '00000',
    data: [{
      symbol: 'BTCUSDT', lastPr: '100000', open: '98000',
      high24h: '101000', low24h: '97000',
      quoteVolume: '750000000', baseVolume: '7500',
      change24h: '0.0204', ts: '1700000000000',
    }],
  }]]);
  const t = (await bitget.getTicker('BTCUSDT', 'spot'))!;
  restoreFetch();

  assert.equal(t.exchange, 'bitget');
  assert.equal(t.price, 100000);
  assert.equal(t.base, 'BTC');
  assert.equal(t.volume24h, 750_000_000, 'quoteVolume, not baseVolume');
  // change24h is a FRACTION on Bitget: 0.0204 must become 2.04%, not 0.0204%.
  assert.ok(Math.abs(t.priceChange24h - 2.04) < 1e-9,
    `expected 2.04%, got ${t.priceChange24h}`);
});

/* ============================ SHARED CONTRACT ============================= */

test('every adapter declares whether it publishes a taker split', () => {
  assert.equal(binance.supports.takerVolume, true, 'Binance publishes it');
  for (const a of [okx, bybit, bitget]) {
    assert.equal(a.supports.takerVolume, false, `${a.id} does not publish a taker split`);
  }
  // The declaration must match reality: a venue claiming no taker volume must
  // return no flow candles rather than a fabricated split.
  assert.deepEqual(ADAPTERS.filter((a) => a.supports.takerVolume).map((a) => a.id), ['binance']);
});

test('adapters without taker volume return no flow candles', async () => {
  for (const a of [okx, bybit, bitget]) {
    assert.deepEqual(await a.getFlowCandles('BTCUSDT', '1h', 'spot', 10), [],
      `${a.id} must not fabricate a taker split`);
  }
});

test('an upstream error propagates as HttpError rather than a silent empty result', async () => {
  failFetch(503);
  await assert.rejects(() => binance.getTicker('BTCUSDT', 'spot'), HttpError);
  await assert.rejects(() => bybit.getTicker('BTCUSDT', 'spot'), HttpError);
  restoreFetch();
});

test('a 4xx is distinguishable from a 5xx so retry policy can act on it', async () => {
  failFetch(400);
  try {
    await binance.getTicker('BADSYMBOL', 'spot');
    assert.fail('expected a rejection');
  } catch (e) {
    assert.ok(e instanceof HttpError);
    assert.equal((e as HttpError).status, 400);
  }
  restoreFetch();
});

test('every adapter reports the same capability keys', () => {
  const keys = Object.keys(binance.supports).sort();
  for (const a of ADAPTERS) {
    const own = Object.keys(a.supports).sort();
    // wsPublic is optional; compare the required set.
    const required = keys.filter((k) => k !== 'wsPublic');
    for (const k of required) {
      assert.ok(k in a.supports, `${a.id} is missing capability "${k}"`);
    }
    assert.ok(own.length >= required.length);
  }
});

test('resolveAdapters parses the exchange query safely', () => {
  assert.equal(resolveAdapters('all').length, 4);
  assert.equal(resolveAdapters(null).length, 4, 'no filter means every venue');
  assert.deepEqual(resolveAdapters('binance,okx').map((a) => a.id), ['binance', 'okx']);
  assert.deepEqual(resolveAdapters('BINANCE').map((a) => a.id), ['binance'], 'case-insensitive');
  assert.deepEqual(resolveAdapters('nonsense').map((a) => a.id), [], 'unknown venue matches nothing');
});
