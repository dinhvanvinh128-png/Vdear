# VDEAR — Database Schema

**The database is optional.** Every engine computes on demand from REST plus
cache and works with none configured. Postgres only ever ADDS history: score
series, breadth over time, flow across 7d/30d, and alert de-duplication across
restarts. It is never on the critical path for rendering.

`lib/db/client.ts` returns `null` when unconfigured and every repository is
null-safe — reads resolve to an empty series, writes to a no-op — so callers
never branch on whether history exists.

## Setup

```bash
# 1. user tables (watchlist, portfolio, price alerts) — unchanged
psql "$DATABASE_URL" -f supabase/schema.sql

# 2. market intelligence tables
psql "$DATABASE_URL" -f supabase/migrations/0002_market_intelligence.sql
```

Or paste each into Supabase → SQL Editor. Both are safe to re-run.

Then set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (reads) and
`SUPABASE_SERVICE_ROLE_KEY` (cron writes; **server-only**).

---

## Tables

### Reference
| Table | Notes |
|---|---|
| `assets` | base symbol, CoinGecko id, sector, stablecoin flag |
| `exchanges` | venue code, market type, **`has_taker_volume`** |

### Raw market data
| Table | Notes |
|---|---|
| `candles` | OHLCV + `quote_volume`, `taker_buy_quote`, `trade_count` |
| `trades` | individual fills; partial index on `usd_value >= 100000` for whale queries |
| `orderbook_snapshots` | mid, spread, banded depth at ±0.25/0.5/1/2% |

### Computed flow
`spot_flow` · `cvd` · `volume_delta` — per symbol, timeframe and bucket.

### Market-wide
`market_breadth` · `stablecoin_metrics` · `defi_metrics` · `onchain_metrics`

### Flow and positioning
`whale_transactions` · `exchange_flows` · `derivatives_metrics`

### Output and operations
`market_scores` · `alerts` · `api_health` · `data_quality` · `retention_policy`

---

## Schema decisions that carry meaning

These are not bookkeeping choices — each encodes a rule from the scoring model.

**`candles.taker_buy_quote` is NULLABLE.** Only Binance publishes a taker split.
A guessed 50/50 value must never be written, because CVD derives sell volume as
`quote_volume − taker_buy_quote` and a fabricated split would corrupt it
silently.

**`market_breadth` stores a sample size per EMA ratio**
(`ema20_sample`, `ema50_sample`, `ema200_sample`). An asset without 200 days of
history is excluded from that ratio rather than counted below it, so the ratio is
uninterpretable without its denominator.

**`onchain_metrics.source` records which provider answered.** The on-chain
resolver walks a fallback chain, and a value from CryptoQuant carries different
confidence from the same value via Coin Metrics.

**`whale_transactions` separates `kind` from `direction`.** `cex_fill` is a real
executed trade (free, always available). `chain_transfer` with a `direction` of
`exchange_to_wallet` / `wallet_to_exchange` / `wallet_to_wallet` requires a
labelled-address provider — so `direction` is nullable and **must never be
inferred from a CEX fill**.

**`market_scores` stores `coverage` and `data_confidence` alongside every
score.** A score without them is not interpretable; storing the number alone
would lose exactly the context that makes it honest.

**`alerts.dedupe_key` is UNIQUE.** An hour-bucketed key means a persisting
condition is stored once instead of on every poll, and a restart cannot re-fire
yesterday's alerts.

---

## Retention

Driven by the `retention_policy` **table**, not hard-coded — so tuning retention
is a data change, not a deploy.

| Data | Kept |
|---|---|
| Raw trades | 24 h |
| Order book snapshots | 48 h |
| 1m / 5m candles and flow | 7 days |
| 15m / 1h candles and flow | 90 days |
| 4h / 1d candles and flow | indefinite |
| Scores, breadth, stablecoin, DeFi, on-chain, exchange flows | indefinite |
| Whale transactions, derivatives metrics, data quality | 90 days |
| Alerts | 1 year |
| API health | 7 days |

`prune_market_data()` reads that policy and returns rows removed per table. The
prune cron calls it daily at 04:00 UTC.

---

## Row Level Security

Market data is public information: `SELECT` is open on every table. Writes
require the **service role**, which only the server-side cron routes hold. The
existing user tables (`watchlist`, `portfolio_assets`, `price_alerts`) keep their
own `auth.uid()`-scoped policies and are untouched by this migration.
