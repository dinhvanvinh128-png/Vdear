/**
 * Provider normalization: raw upstream payloads -> VDEAR shapes.
 *
 * The mappers are the seam where a third party's quirks stop being our problem,
 * so they are tested against fixtures shaped after each vendor's documented
 * schema — including the awkward cases (values as strings, peg-type nesting,
 * omitted fields, de-listed assets) that would otherwise silently produce a
 * wrong number.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { mapStablecoins, mapTvl, mapDexVolume, unpeg } from '@/lib/providers/defillama/mapper';
import { mapGlobal, mapCoinMarket, mapCategory } from '@/lib/providers/coingecko/mapper';
import { mapRows, CM_METRIC_BY_ID, latestOf, valuesOf } from '@/lib/providers/coinmetrics/mapper';
import { mapActivity, mapPool } from '@/lib/providers/geckoterminal/mapper';
import { notConfigured, fromError, fail, ok, label } from '@/lib/providers/types';
import { confidenceFor, combineConfidence, confidenceLabel, SOURCE_CONFIDENCE } from '@/lib/quality/confidence';

/* ------------------------------- DeFiLlama -------------------------------- */

test('unpeg unwraps DeFiLlama peg-type nesting', () => {
  assert.equal(unpeg({ peggedUSD: 1000 }), 1000);
  assert.equal(unpeg(500), 500);
  assert.equal(unpeg(null), 0);
  assert.equal(unpeg({ peggedUSD: 100, peggedEUR: 50 }), 150, 'sums across peg types');
});

test('stablecoin supply totals and computes real deltas', () => {
  const r = mapStablecoins({
    peggedAssets: [
      {
        id: '1', name: 'Tether', symbol: 'USDT', pegType: 'peggedUSD',
        circulating: { peggedUSD: 110 }, circulatingPrevDay: { peggedUSD: 100 },
        circulatingPrevWeek: { peggedUSD: 90 }, circulatingPrevMonth: { peggedUSD: 55 },
        chains: ['Ethereum', 'Tron'],
        chainCirculating: {
          Ethereum: { current: { peggedUSD: 60 } },
          Tron: { current: { peggedUSD: 50 } },
        },
      },
      {
        id: '2', name: 'USD Coin', symbol: 'USDC', pegType: 'peggedUSD',
        circulating: { peggedUSD: 90 }, circulatingPrevDay: { peggedUSD: 100 },
        circulatingPrevWeek: { peggedUSD: 110 }, circulatingPrevMonth: { peggedUSD: 45 },
        chains: ['Ethereum'],
        chainCirculating: { Ethereum: { current: { peggedUSD: 90 } } },
      },
    ],
  }, 1000);

  assert.ok(r);
  assert.equal(r!.totalUsd, 200);
  assert.equal(r!.change1d, 0, '110+90 vs 100+100 is flat overall');
  assert.equal(r!.change7d, 0, '200 vs 200');
  assert.equal(r!.change30d, 100, '200 vs 100 is a doubling');
  assert.equal(r!.assets[0]!.symbol, 'USDT', 'sorted by size');
  assert.deepEqual(r!.byChain.map((c) => c.chain), ['Ethereum', 'Tron']);
  assert.equal(r!.byChain[0]!.usd, 150, 'chain totals combine across assets');
  assert.equal(r!.byChain[0]!.share, 75);
  assert.equal(r!.observedAt, 1000);
});

test('a wound-down stablecoin is excluded, not read as a liquidity drain', () => {
  const r = mapStablecoins({
    peggedAssets: [
      { id: '1', symbol: 'USDT', circulating: { peggedUSD: 100 }, circulatingPrevDay: { peggedUSD: 100 } },
      // Fully redeemed: including it would drag the total change downward.
      { id: '2', symbol: 'DEAD', circulating: { peggedUSD: 0 }, circulatingPrevDay: { peggedUSD: 5000 } },
    ],
  });
  assert.equal(r!.totalUsd, 100);
  assert.equal(r!.change1d, 0, 'the live supply is unchanged');
  assert.equal(r!.assets.length, 1);
});

test('stablecoin mapper returns null on an empty payload rather than zeros', () => {
  assert.equal(mapStablecoins({ peggedAssets: [] }), null);
  assert.equal(mapStablecoins({}), null);
});

test('TVL sums chains and derives deltas from the daily series', () => {
  const history = Array.from({ length: 40 }, (_, i) => ({ date: i * 86400, tvl: 100 + i }));
  // Series ends at 139; totals below come to 139 as well.
  const r = mapTvl(
    [
      { name: 'Ethereum', tvl: 100, gecko_id: 'ethereum', tokenSymbol: 'ETH' },
      { name: 'Solana', tvl: 39, gecko_id: 'solana', tokenSymbol: 'SOL' },
      { name: 'Dead', tvl: 0 },
    ],
    history,
  );
  assert.ok(r);
  assert.equal(r!.totalUsd, 139);
  assert.equal(r!.chains.length, 2, 'zero-TVL chains dropped');
  assert.equal(r!.chains[0]!.name, 'Ethereum', 'sorted descending');
  // one day back = 138 -> +0.72%
  assert.ok(Math.abs(r!.change1d! - 0.7246) < 0.01);
});

test('TVL still maps when the history call failed (deltas become null)', () => {
  const r = mapTvl([{ name: 'Ethereum', tvl: 100 }], []);
  assert.equal(r!.totalUsd, 100);
  assert.equal(r!.change1d, null, 'unknown, not zero');
  assert.equal(r!.change30d, null);
});

test('DEX volume keeps top protocols and preserves null changes', () => {
  const r = mapDexVolume({
    total24h: 5_000_000_000, total7d: 30_000_000_000, change_1d: 12.5,
    protocols: [
      { name: 'Uniswap', total24h: 2e9, change_1d: 5 },
      { name: 'Curve', total24h: 5e8 },
      { name: 'Ghost', total24h: 0 },
    ],
  });
  assert.equal(r!.total24h, 5e9);
  assert.equal(r!.change1d, 12.5);
  assert.equal(r!.change7d, null, 'absent means unknown');
  assert.equal(r!.protocols.length, 2, 'zero-volume protocol dropped');
  assert.equal(r!.protocols[0]!.name, 'Uniswap');
  assert.equal(r!.protocols[1]!.change1d, null);
});

/* -------------------------------- CoinGecko ------------------------------- */

test('global market maps dominance and totals', () => {
  const g = mapGlobal({
    data: {
      total_market_cap: { usd: 2.5e12 }, total_volume: { usd: 1e11 },
      market_cap_percentage: { btc: 54.2, eth: 12.8 },
      market_cap_change_percentage_24h_usd: -1.4,
      active_cryptocurrencies: 17000, markets: 1100,
    },
  });
  assert.equal(g!.totalMarketCapUsd, 2.5e12);
  assert.equal(g!.btcDominance, 54.2);
  assert.equal(g!.marketCapChange24h, -1.4);
  assert.equal(mapGlobal({}), null, 'no data block means no claim');
});

test('coin market distinguishes "no change reported" from "flat"', () => {
  const m = mapCoinMarket({
    id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', image: 'x',
    current_price: 100000, market_cap: 2e12, market_cap_rank: 1,
    fully_diluted_valuation: null, total_volume: 5e10,
    price_change_percentage_24h_in_currency: 0,
    circulating_supply: 19.7e6, total_supply: 21e6,
    ath: 110000, ath_change_percentage: -9, atl: 67, last_updated: '2024-01-01T00:00:00.000Z',
  });
  assert.equal(m!.symbol, 'BTC', 'upper-cased to the VDEAR convention');
  assert.equal(m!.change24h, 0, 'a reported zero stays zero');
  assert.equal(m!.change7d, null, 'an unreported window is null, not zero');
  assert.equal(m!.fullyDilutedValuation, null);
  assert.equal(m!.marketCapRank, 1);
});

test('coin market falls back to the non-suffixed 24h change field', () => {
  const m = mapCoinMarket({
    id: 'x', symbol: 'x', name: 'X', image: '', current_price: 1, market_cap: 1,
    market_cap_rank: 9, fully_diluted_valuation: null, total_volume: 1,
    price_change_percentage_24h: 3.5,
    circulating_supply: null, total_supply: null, ath: null,
    ath_change_percentage: null, atl: null, last_updated: null,
  });
  assert.equal(m!.change24h, 3.5);
});

test('category maps the sector taxonomy', () => {
  const c = mapCategory({
    id: 'artificial-intelligence', name: 'AI', market_cap: 3e10,
    market_cap_change_24h: 4.2, volume_24h: 2e9, top_3_coins: ['a', 'b', 'c'],
  });
  assert.equal(c!.id, 'artificial-intelligence');
  assert.equal(c!.marketCapChange24h, 4.2);
  assert.equal(c!.topCoins.length, 3);
  assert.equal(c!.updatedAt, null);
});

/* ------------------------------ Coin Metrics ------------------------------ */

test('coin metrics parses string values and sorts chronologically', () => {
  const out = mapRows([
    { asset: 'btc', time: '2024-01-02T00:00:00.000Z', AdrActCnt: '950000', TxCnt: '300000' },
    { asset: 'btc', time: '2024-01-01T00:00:00.000Z', AdrActCnt: '900000', TxCnt: '280000' },
  ], ['activeAddresses', 'txCount']);

  assert.equal(out.activeAddresses!.length, 2);
  assert.equal(out.activeAddresses![0]!.value, 900000, 'sorted ascending by time');
  assert.equal(latestOf(out.activeAddresses)!.value, 950000);
  assert.deepEqual(valuesOf(out.txCount), [280000, 300000]);
});

test('an omitted coin metrics field stays omitted, never becomes 0', () => {
  // A day with no fee data must not report "$0 of fees" — that is a real claim.
  const out = mapRows([
    { asset: 'btc', time: '2024-01-01T00:00:00.000Z', AdrActCnt: '900000' },
  ], ['activeAddresses', 'feesUsd']);
  assert.equal(out.activeAddresses!.length, 1);
  assert.equal(out.feesUsd, undefined);
});

test('coin metrics skips unparseable rows without failing the batch', () => {
  const out = mapRows([
    { asset: 'btc', time: 'not-a-date', AdrActCnt: '1' },
    { asset: 'btc', time: '2024-01-01T00:00:00.000Z', AdrActCnt: 'NaN' },
    { asset: 'btc', time: '2024-01-02T00:00:00.000Z', AdrActCnt: '5' },
  ], ['activeAddresses']);
  assert.equal(out.activeAddresses!.length, 1);
  assert.equal(out.activeAddresses![0]!.value, 5);
});

test('metric id reverse lookup is complete', () => {
  assert.equal(CM_METRIC_BY_ID.AdrActCnt, 'activeAddresses');
  assert.equal(CM_METRIC_BY_ID.TxTfrValAdjUSD, 'transferValueUsd');
});

/* ----------------------------- GeckoTerminal ------------------------------ */

test('DEX pools aggregate liquidity, volume and the buy ratio', () => {
  const r = mapActivity({
    data: [
      {
        id: 'p1',
        attributes: {
          name: 'WETH / USDC', reserve_in_usd: '1000000',
          volume_usd: { h24: '5000000' },
          price_change_percentage: { h24: '2.5' },
          transactions: { h24: { buys: 700, sells: 300, buyers: 400, sellers: 200 } },
        },
        relationships: { dex: { data: { id: 'uniswap_v3' } }, network: { data: { id: 'eth' } } },
      },
      {
        id: 'p2',
        attributes: {
          name: 'PEPE / WETH', reserve_in_usd: '250000',
          volume_usd: { h24: '1000000' },
          transactions: { h24: { buys: 300, sells: 700 } },
        },
      },
      // Zero-reserve pool: not a real venue, must not dilute the aggregate.
      { id: 'p3', attributes: { name: 'DEAD', reserve_in_usd: '0' } },
    ],
  }, 'eth', 42);

  assert.ok(r);
  assert.equal(r!.pools.length, 2);
  assert.equal(r!.totalLiquidityUsd, 1_250_000);
  assert.equal(r!.totalVolume24h, 6_000_000);
  assert.equal(r!.totalBuys24h, 1000);
  assert.equal(r!.totalSells24h, 1000);
  assert.equal(r!.buyRatio, 0.5, 'balanced across both pools');
  assert.equal(r!.pools[0]!.name, 'WETH / USDC', 'sorted by liquidity');
  assert.equal(r!.pools[0]!.dex, 'uniswap_v3');
  assert.equal(r!.observedAt, 42);
});

test('DEX buy ratio is null when nothing traded, not 0', () => {
  const r = mapActivity({
    data: [{ id: 'p', attributes: { name: 'X', reserve_in_usd: '1000', transactions: {} } }],
  }, 'eth');
  assert.equal(r!.buyRatio, null, 'no trades is unknown pressure, not sell pressure');
});

test('pool mapper tolerates a missing attributes block', () => {
  assert.equal(mapPool({}, 'eth'), null);
  assert.equal(mapActivity({ data: [] }, 'eth'), null);
});

/* --------------------------- provider result type -------------------------- */

test('a missing key produces not_configured, never data', () => {
  const r = notConfigured('glassnode', 'GLASSNODE_API_KEY');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_configured');
  assert.match(r.message, /Glassnode/);
  assert.match(r.message, /GLASSNODE_API_KEY/);
  assert.equal('data' in r, false, 'a failure carries no data field at all');
});

test('auth and rate-limit failures are classified distinctly', () => {
  const unauthorized = fromError('cryptoquant', Object.assign(new Error('x'), { status: 403 }));
  assert.equal(unauthorized.reason, 'unauthorized');
  assert.match(unauthorized.message, /plan/);

  assert.equal(fromError('coingecko', Object.assign(new Error('x'), { status: 429 })).reason, 'rate_limited');
  assert.equal(fromError('defillama', new Error('socket hang up')).reason, 'unavailable');
});

test('a provider failure message never leaks the key', () => {
  const r = fail('glassnode', 'unauthorized', 'Glassnode: key rejected');
  assert.equal(r.message.includes('api_key='), false);
});

test('ok() stamps provenance and defaults observedAt to fetch time', () => {
  const r = ok('defillama', 'aggregated_api', { x: 1 });
  assert.equal(r.ok, true);
  assert.equal(r.source, 'defillama');
  assert.equal(r.kind, 'aggregated_api');
  assert.equal(r.observedAt, r.fetchedAt);
  assert.equal(label('defillama'), 'DeFiLlama');
});

/* ------------------------------- confidence -------------------------------- */

test('confidence starts at the source base and decays with age', () => {
  const now = 1_000_000_000;
  const fresh = confidenceFor('cex_realtime', now, now);
  assert.equal(fresh.value, SOURCE_CONFIDENCE.cex_realtime);
  assert.equal(fresh.stale, false);

  const aging = confidenceFor('cex_realtime', now - 60_000, now);
  assert.ok(aging.value < fresh.value, 'a minute-old tick is worth less than a live one');
  assert.equal(aging.stale, false);

  const stale = confidenceFor('cex_realtime', now - 10 * 60_000, now);
  assert.equal(stale.stale, true);
  assert.ok(stale.value < 50, 'stale data is still reported, but clearly discounted');
});

test('an on-chain daily metric is not "stale" after a few minutes', () => {
  const now = 1_000_000_000;
  // Daily on-chain data being an hour old is completely normal.
  const c = confidenceFor('onchain_provider', now - 30 * 60_000, now);
  assert.equal(c.stale, false);
  assert.equal(c.value, SOURCE_CONFIDENCE.onchain_provider);
});

test('composite confidence is dragged down by its weakest input', () => {
  const allStrong = combineConfidence([{ value: 90 }, { value: 90 }, { value: 90 }]);
  const oneWeak = combineConfidence([{ value: 90 }, { value: 90 }, { value: 30 }]);
  assert.ok(oneWeak < allStrong - 15, 'a composite is only as good as its worst input');
});

test('missing inputs reduce confidence via coverage, not by inventing values', () => {
  const full = combineConfidence([{ value: 90 }, { value: 90 }, { value: 90 }], 3);
  const partial = combineConfidence([{ value: 90 }], 3);
  assert.ok(partial < full / 2, '1-of-3 coverage cannot look as certain as 3-of-3');
  assert.equal(combineConfidence([], 3), 0);
});

test('confidence labels bucket sensibly', () => {
  assert.equal(confidenceLabel(85), 'high');
  assert.equal(confidenceLabel(65), 'medium');
  assert.equal(confidenceLabel(40), 'low');
  assert.equal(confidenceLabel(10), 'insufficient');
});
