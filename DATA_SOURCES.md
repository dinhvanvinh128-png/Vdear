# VDEAR — Data Sources

Every source VDEAR uses, what it provides, whether it needs a key, and how much
the confidence layer trusts it.

**The platform is fully functional with zero API keys.** Everything in the first
two tables works unauthenticated. The premium sources are enhancements; without
a key their metrics report `not_configured` and the affected score renormalises
without them — nothing is estimated in their place.

Live status for every source is on **`/status`**.

---

## Confidence tiers

`lib/quality/confidence.ts` assigns a base confidence per source kind, then
decays it with age. A metric older than 8× its freshness window is marked stale
(still shown, clearly labelled, heavily discounted).

| Source kind | Base | Fresh window | Used for |
|---|---|---|---|
| `cex_realtime` | 95 | 15s | direct exchange REST/WS |
| `onchain_direct` | 95 | 10m | node RPC / first-party chain indexer |
| `cex_aggregated` | 90 | 30s | several venues merged by us |
| `onchain_provider` | 88 | 60m | Coin Metrics / Glassnode / CryptoQuant |
| `aggregated_api` | 85 | 5m | CoinGecko / DeFiLlama |
| `derived` | 80 | 60s | computed by us from the above |
| `third_party` | 75 | 15m | everything else |

A composite's confidence is not a plain average: it blends the weighted mean
with the **minimum** and scales by **coverage**, so ten inputs of which two
answered can never look as certain as ten of which ten answered.

---

## Exchanges — no key required

All four use public market-data endpoints only. No credential is ever sent, in
REST or WebSocket.

| Venue | Spot | Futures | Funding | OI | L/S | Book | Trades | Klines | **Taker split** |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Binance | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **✅** |
| OKX | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Bybit | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Bitget | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ |

### The taker-split column is the important one

Exact CVD needs to know which side was the aggressor. **Only Binance publishes
that per candle** (kline index 10, `takerBuyQuoteVolume`). The others do not,
so:

- long-horizon CVD (5m…1D) comes from Binance's taker-split candles;
- short-horizon flow (minutes) comes from individual fills on all four venues,
  and reports its own `windowMs` so it cannot be mistaken for the former;
- a venue publishing neither is listed in `excluded` and **is never given an
  assumed 50/50 split**.

Docs: [Binance](https://binance-docs.github.io/apidocs/) ·
[OKX](https://www.okx.com/docs-v5/) ·
[Bybit](https://bybit-exchange.github.io/docs/v5/intro) ·
[Bitget](https://www.bitget.com/api-doc/common/intro)

---

## Core providers — no key required

| Provider | Provides | Key | Tier | Confidence |
|---|---|---|---|---|
| **CoinGecko** | global market cap, BTC/ETH dominance, market-cap ranking, **category taxonomy** (sector rotation) | optional (raises rate limit) | freemium | 85 |
| **DeFiLlama** | stablecoin supply + 1d/7d/30d change + chain split; chain TVL and deltas; DEX volume | optional (Pro host) | freemium | 85 |
| **GeckoTerminal** | DEX pool liquidity, 24h volume, buys/sells, buyers/sellers | none | free | 95 |
| **Coin Metrics** | active & new addresses, tx count, adjusted transfer value, fees, supply | optional (Pro catalogue) | freemium | 88 |
| **Fear & Greed** | sentiment index (context only — not a scored input) | none | free | 75 |

Endpoints used:

- `GET https://api.coingecko.com/api/v3/{global,coins/markets,coins/categories}`
- `GET https://stablecoins.llama.fi/stablecoins?includePrices=false`
- `GET https://api.llama.fi/v2/{chains,historicalChainTvl}` · `/overview/dexs`
- `GET https://api.geckoterminal.com/api/v2/networks/{network}/pools`
  (the `Accept: application/json;version=20230302` header is required)
- `GET https://community-api.coinmetrics.io/v4/timeseries/asset-metrics`
- `GET https://api.alternative.me/fng/`

CoinGecko's free tier is the tightest budget VDEAR depends on, so it has the
smallest token bucket in `lib/net/rateLimiter.ts` and the longest cache TTL.

---

## Premium providers — optional

Absent a key, each reports `not_configured` and the score renormalises.

| Provider | Provides | Env var | Notes |
|---|---|---|---|
| **CoinGlass** | liquidation map, pair heatmap, liquidation history | `COINGLASS_API_KEY` | Map and heatmap need a **Professional/Enterprise** plan. On a lower plan the UI shows a clearly-labelled OI-derived *estimate* plus the reason. |
| **Glassnode** | MVRV, MVRV Z, SOPR/aSOPR, realized cap, exchange balances, exchange net flow, LTH/STH supply | `GLASSNODE_API_KEY` | Metric availability is plan-dependent; a 401/403 is surfaced as `unauthorized` naming the plan as a possible cause. |
| **CryptoQuant** | exchange inflow / outflow / netflow / reserve | `CRYPTOQUANT_API_KEY` | The best source for true exchange flow. |
| **Artemis** | daily active users, transactions, fees, revenue, ecosystem TVL | `ARTEMIS_API_KEY` | ⚠️ **Schema unverified** — see below. |

### ⚠️ Artemis

Unlike every other connector here, the Artemis response shape could **not** be
verified against a live call during development. The request follows their
public documentation and the parser is written defensively: it accepts several
plausible field names and returns `no_data` rather than a wrong number if none
match.

Because of that, `ARTEMIS_API_BASE` is overridable from the environment — if
your account's schema differs, it is a config change, not a code change.

---

## What is genuinely NOT available for free

Stated plainly rather than papered over.

### Per-transaction whale classification

The spec asks for large transfers classified as Exchange→Wallet,
Wallet→Exchange and Wallet→Wallet. That requires a **labelled address database**
(which exchange owns which deposit address). No free API publishes one.

VDEAR therefore reports whale activity in two clearly separated tiers:

| Tier | What it is | Availability |
|---|---|---|
| **1 — CEX whale fills** | Real executed trades above a USD threshold, taker side known, bucketed at $100K/$500K/$1M/$5M/$10M+ | **Free, always on, exact** |
| **2 — Exchange flow** | Actual inflow/outflow/netflow and exchange reserve | Needs CryptoQuant or Glassnode |

With no key, tier 2 is reported **unavailable with the reason** — it is *not*
approximated from tier 1, because trades on an exchange say nothing about coins
moving to or from it.

### Historical liquidation totals

Exchange REST APIs do not publish them. They require a liquidation WebSocket
stream or a provider like CoinGlass. Without one, VDEAR shows OI-derived
exposure clearly labelled `estimated`.

### 24h-ago open interest

Needs a stored series. Without the database configured, `oiChange24hPct` is
`null` rather than being derived from an invented baseline.

---

## Reliability

Every provider call goes through `lib/net/request.ts`:

```
rate limit (token bucket, per host)
  → circuit breaker (5 consecutive failures → open 30s → half-open probe)
    → retry (exponential backoff + full jitter; 408/425/429/5xx and socket
       errors only — a 4xx never becomes valid by retrying)
      → getJson (hard timeout, query strings stripped from error text)
```

An open circuit means a dead upstream costs 0ms instead of N×8s of timeouts on
every page load. Circuit state is visible on `/status`.

Glassnode and Artemis authenticate via a **query parameter**, so a URL in a log
would be a leaked credential. Two defences: `safeUrl` strips query strings from
all error text, and `redactSecrets` (`lib/api/sanitize.ts`) redacts
credential-shaped parameters before anything is logged. Both are unit-tested.
