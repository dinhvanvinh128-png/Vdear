# VDEAR — Architecture

VDEAR turns market data into an explained judgement. The pipeline is one
direction, and every stage is separately testable:

```
DATA  →  EVIDENCE  →  SCORE  →  REGIME  →  EXPLANATION
```

---

## The pipeline

```
CEX public REST/WS                    Providers (non-exchange)
Binance · OKX · Bybit · Bitget        CoinGecko · DeFiLlama · GeckoTerminal
lib/exchanges/<id>/                   Coin Metrics · CoinGlass · Glassnode
                                      CryptoQuant · Artemis
                                      lib/providers/<name>/
        └──────────────────┬──────────────────┘
                           ▼
        lib/net/          rate limit → circuit breaker → retry+jitter → timeout
                           ▼
        lib/aggregate.ts  fan-out (allSettled), VDEAR index, Envelope
                           ▼
        lib/quality/      cross-source anomaly · freshness · sourceConfidence
                           ▼
        lib/cache.ts      TTL + single-flight, serve-stale-on-failure
                           ▼
        lib/engines/      spotFlow · orderBook · breadth · stablecoin · defi
                          onchain · whale · derivatives · sector · alerts
                           ▼
        lib/scoring/      trend · liquidity · moneyFlow · accDist · regime · signal
                           ▼
        lib/analyst/      deterministic WHY / RISKS / scenarios
                           ▼
        lib/services/     composition (intelligence.ts is the composer)
                           ▼
        app/api/*         thin, validated, Envelope-returning routes
                           ▼
        app/* · components/*        Postgres (optional) ← app/api/cron/*
```

**Layer rule:** each layer may import only from the layers above it. Engines
never fetch; services never compute; routes never do either.

---

## The five rules everything else follows from

### 1. A missing input is never replaced by a value

This is the central design decision, implemented in
`lib/scoring/moneyFlow.ts`. When a component cannot be computed it is DROPPED
and the remaining weights are RENORMALISED — not defaulted to a neutral 50.

Three strong components at 80 with five defaulted to 50 produces 66.5: a
confident-looking mid number manufactured from missing data. Dropping them gives
80 with a stated 55% coverage and much lower confidence, which describes the
same situation honestly.

**A missing input costs CONFIDENCE, never the SCORE.** Every unavailable
component carries a human-readable reason all the way to the UI.

### 2. Provenance travels with the data

Every payload is an `Envelope<T>` (`lib/types.ts`) carrying `sources`, `errors`,
`generatedAt`, `cached` and `kind`. Every score carries `coverage` and
`confidence`. A score without them is not interpretable, so they are never
dropped on the way to the screen.

### 3. Disagreeing sources are reconciled openly

`lib/quality/crossSource.ts` compares venues against the MEDIAN (not the mean —
a bad print drags the mean toward itself and hides its own deviation) and keys
severity off the SPREAD BETWEEN VENUES (not deviation from the median — with two
venues the median lands between them and halves both deviations).

An outlier is excluded from the index and reported. Identifying *which* venue is
wrong needs a majority, so exclusion requires three or more responding venues;
with exactly two that disagree, neither is blamed, the anomaly is flagged and
confidence drops sharply.

### 4. Rules decide; the analyst only explains

`lib/analyst/` receives already-computed scores and can return only prose. There
is no path by which it can produce, change, or introduce a number. A test
enumerates every value reachable from its input and asserts no other number
appears in its output.

`lib/scoring/language.ts` enforces the no-guarantee rule in code: `assertCompliant`
throws on "chắc chắn", "guaranteed", "win rate", "risk-free" and similar, and
the analyst runs its own output through it before returning.

### 5. Free-first

The platform is fully functional with **zero API keys**. Binance, OKX, Bybit,
Bitget, CoinGecko, DeFiLlama, GeckoTerminal and Coin Metrics all work
unauthenticated. CoinGlass, Glassnode, CryptoQuant and Artemis are enhancements;
without a key their metrics report `not_configured` and the affected score
renormalises. Nothing is estimated in their place.

---

## Notable engineering decisions

### Only Binance publishes a taker-buy split

Splitting volume into aggressive buying and selling requires the TAKER side.
Binance publishes it per candle (kline index 10, `takerBuyQuoteVolume`); OKX,
Bybit and Bitget do not.

So `lib/engines/spotFlow.ts` works at two horizons:

| Horizon | Source | Coverage |
|---|---|---|
| Long (5m…1D CVD) | taker-split candles | Binance only, full kline history |
| Short (confirmation) | individual fills | all four venues, ~minutes |

`computeTradeFlow` returns `windowMs` so the short horizon can never be mistaken
for the long one. A venue publishing neither is listed in `excluded` — it is
never given an assumed 50/50 split, which would dilute a real signal with a
fabricated neutral reading.

### Derivatives confirm; they never decide

Capped at 5% of the Money Flow Score and structurally unable to set direction.
Funding and long/short are **tent curves, not linear**: mildly positive funding
confirms an advance, but past ~30% annualised the same trade is crowded and
expensive to hold, so confirmation turns DOWN and falls below neutral.

### The score picks a band; evidence picks the regime

`lib/scoring/regime.ts` uses the composite only as a starting point. Structural
evidence then overrides it — which is where the states a score alone cannot
express come from: RANGE (weak ADX, not NEUTRAL), BULL_ACCUMULATION (a base that
looks identical to NEUTRAL on the number), DISTRIBUTION (a top that reads BULL),
and CAPITULATION (which requires the volume spike and forced selling to match).

### ADX is a gate, not a component

A market can sit above every moving average and go nowhere. `lib/scoring/trend.ts`
pulls the score toward neutral when ADX says there is no trend; without that
gate a 2%-a-year drift reads as a healthy uptrend.

### Realtime: an honest compromise

The spec's diagram is Browser → Backend → Exchanges, which is what every
COMPUTED value does. It is not achievable for raw tick streams on Vercel:
serverless functions cannot hold a long-lived WebSocket fan-in.

`lib/realtime/` therefore subscribes the browser directly to **public, keyless**
venue streams for the **one symbol on screen**. This is not the "browser calls 20
APIs" pattern the spec warns against — it is one stream per venue for one symbol,
carrying no credentials, while every aggregate and score still comes from the
backend. `WS_RELAY_URL` is the hook for a future always-on worker.

### The database is optional

`lib/db/client.ts` returns `null` when unconfigured and every repository is
null-safe. Engines compute on demand; the database only ever ADDS history
(score series, breadth over time, alert de-duplication across restarts). It is
never on the critical path for rendering.

---

## Testing

The engine, scoring, quality, analyst, realtime and adapter layers are verified
by **262 tests that need no `node_modules`** — Node's built-in test runner, with
a standalone `tsconfig.test.json` and a 30-line alias resolver
(`scripts/resolve-aliases.mjs`).

That is deliberate: the maths behind every published score stays verifiable even
where the npm registry is unreachable, and CI runs the suite with no install at
all before the app build runs separately.

```bash
npm test          # typecheck + run the suite (no install required)
npm run test:types
npm run verify    # both
```

---

## Directory map

```
lib/
  net/          rate limiter · retry · circuit breaker · request()
  exchanges/    ExchangeAdapter + binance/okx/bybit/bitget + registry
  providers/    <name>/{client,types,mapper,health} + registry + onchain resolver
  indicators/   pure TA: ema · rsi · adx · atr · vwap · structure · zscore
  engines/      calculation over normalized inputs (no I/O)
  quality/      confidence · freshness · cross-source anomaly
  scoring/      config (ALL weights) · trend · liquidity · moneyFlow · accDist ·
                regime · signal · language guard
  analyst/      AnalystProvider + deterministic rule-based narrator
  services/     fetch + compose (intelligence.ts is the composer)
  realtime/     public venue WebSocket adapters + client
  db/           optional Postgres client + repositories
  api/          sanitize (pure) + guard (zod, rate limit, cron auth)
app/
  api/          thin validated routes + cron
  <route>/      pages
components/
  intelligence/ score gauges, breakdown, WHY/RISKS, CVD chart, badges
  ui/           card · button · badge primitives
supabase/       schema.sql (user tables) + migrations/ (market data)
tests/          262 tests, zero dependencies
legacy-static/  the previous static site, preserved untouched
```
