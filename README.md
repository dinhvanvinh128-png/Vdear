# VDEAR — Crypto Market Intelligence

A data-driven crypto intelligence platform. Not a price dashboard: VDEAR
aggregates spot flow, market breadth, stablecoin liquidity, on-chain activity and
whale flow into scored, explained judgements about where money is moving.

```
DATA  →  EVIDENCE  →  SCORE  →  REGIME  →  EXPLANATION
```

**Runs with zero API keys.** Binance · OKX · Bybit · Bitget · CoinGecko ·
DeFiLlama · GeckoTerminal · Coin Metrics all work unauthenticated. CoinGlass,
Glassnode, CryptoQuant and Artemis are optional enhancements.

> Informational analysis, not financial advice. VDEAR reports probability and
> confidence — never certainty.

---

## What it produces

```
MARKET      BULL ACCUMULATION        MONEY FLOW   INFLOW 76/100  (85% coverage)
LIQUIDITY   EXPANDING 71/100         BREADTH      67/100
ON-CHAIN    72/100                   WHALE        75/100

WHY                                  RISKS
· Spot flow is net positive          · Funding elevated at 42% annualised —
· Price flat while CVD rises           long positioning is crowded
· Stablecoin supply expanding 1.8%   · Open interest up 18% in 24h
· Coins leaving exchanges            · Only 85% of scoring inputs available

WHAT THIS READING CANNOT SEE
· Whale Flow — exchange flow needs CryptoQuant or Glassnode, not configured
```

---

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev            # http://localhost:3000

npm test               # 262 tests — no node_modules required
```

---

## The design in five rules

**1. A missing input is never replaced by a value.** When a component cannot be
computed it is dropped and the remaining weights renormalise. Three components at
80 with five defaulted to 50 would read 66.5 — a confident-looking number
invented from nothing. VDEAR reports 80 at 55% coverage with low confidence
instead. *A missing input costs confidence, never the score.*

**2. Provenance travels with the data.** Every payload carries its sources,
failures and freshness. Every score carries coverage and confidence, all the way
to the screen.

**3. Disagreeing sources are reconciled openly.** Venues are compared against the
median; an outlier is excluded from the index **and reported**. With only two
venues disagreeing, neither is blamed — the anomaly is flagged and confidence
drops.

**4. Rules decide; the analyst only explains.** The analyst receives computed
scores and returns prose. A test enumerates every number reachable from its input
and asserts no other number appears in its output. A language guard throws on
"guaranteed", "chắc chắn", "win rate" and similar.

**5. Free-first.** Premium keys add depth. Without them the feature says
"not configured" — it is never estimated in their place.

---

## Notable details

- **Only Binance publishes a taker-buy split**, so exact long-horizon CVD comes
  from there; the other venues contribute short-horizon fill data and are listed
  as `excluded` rather than given an assumed 50/50 split.
- **ADX is a gate, not a component** — without it a 2%-a-year drift scores as a
  healthy uptrend.
- **Funding is a tent curve** — mildly positive confirms an advance; past ~30%
  annualised, crowded leverage *subtracts* from confirmation.
- **A phase needs a divergence** — when price and flow agree that is a trend, not
  accumulation.
- **The database is optional** and only adds history.

---

## Pages

**Intelligence** — `/` · `/money-flow` · `/breadth` · `/liquidity` · `/whales` ·
`/onchain` · `/sectors` · `/alerts`
**Market** — `/markets` · `/coins` · `/coin/[symbol]` · `/heatmap`
**Derivatives** — `/futures` · `/funding` · `/open-interest` · `/long-short` ·
`/liquidations` (+ map, heatmap)
**Tools** — `/watchlist` · `/portfolio` · `/price-alerts` · `/news` · `/status`

---

## Stack

Next.js 14 (App Router) · TypeScript (strict) · Tailwind · Recharts ·
Lightweight Charts · Supabase (optional) · Vercel.

262 tests run on Node's built-in test runner with **zero dependencies**, so the
maths behind every published score stays verifiable even where the npm registry
is unreachable.

---

## Documentation

| Doc | Contents |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | pipeline, layer rules, engineering decisions |
| [SCORING_SYSTEM.md](./SCORING_SYSTEM.md) | every formula, weight and threshold |
| [DATA_SOURCES.md](./DATA_SOURCES.md) | every source, key requirement, confidence — and what is genuinely unavailable for free |
| [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) | every route, parameter and response |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | optional Postgres schema and retention |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Vercel, env vars, cron, post-deploy checks |
