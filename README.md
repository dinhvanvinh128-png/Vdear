# VDEAR Crypto — Real-Time Crypto Market Intelligence

A multi-exchange crypto market intelligence dashboard: prices, futures, funding,
open interest, long/short, liquidations and heatmaps aggregated from **Binance,
OKX, Bybit and Bitget** — with a pluggable **CoinGlass** layer for liquidation
data and Supabase-backed accounts.

Built with **Next.js (App Router) · TypeScript · Tailwind CSS · Lightweight
Charts · Recharts · Supabase**. Deploys to **Vercel**.

> VDEAR provides market data and analytics for informational purposes only —
> **not financial advice.**

---

## Architecture

```
Exchange public APIs (Binance · OKX · Bybit · Bitget)
        │   one adapter per exchange — lib/exchanges/<name>
        ▼
Normalization layer (lib/aggregate.ts) → one canonical VDEAR model (lib/types.ts)
        │   VDEAR index (equal / volume / exchange weighted), spread, provenance
        ▼
Cache + single-flight (lib/cache.ts)   ← short TTLs, fail-soft (serve stale)
        ▼
Service layer (lib/services/*)          ← market / chart / derivatives / health
        ▼
API routes (app/api/*)                  ← thin, typed, fail-soft wrappers
        ▼
React UI (app/*, components/*)          ← every payload shows freshness + sources
```

Design rules that make it extensible and robust:

- **One adapter per exchange.** Add Coinbase/Kraken/Gate/Hyperliquid/Deribit by
  implementing `ExchangeAdapter` (`lib/exchanges/types.ts`) and adding one line
  to `lib/exchanges/registry.ts`. Nothing else changes.
- **Never crash on a dead source.** Every fan-out uses `Promise.allSettled`; a
  failing exchange becomes a red dot on `/status` and an "N/A", not an error.
  The cache serves stale data if an upstream momentarily fails.
- **No secrets in the client.** Public market data needs no keys. Service-role /
  CoinGlass / provider keys are read only in server code.
- **No fabricated data.** Where a real source isn't available (e.g. liquidation
  totals without CoinGlass), the UI says so and shows a clearly-labelled
  *estimate* derived from open interest — never invented numbers.

---

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in what you have (all optional to start)
npm run dev                  # http://localhost:3000
```

Public market data works with **zero configuration** — no API keys required.
Add env vars to unlock accounts (Supabase) and richer liquidation data
(CoinGlass). See `.env.example` for the full list and which are public vs secret.

### Supabase (accounts, watchlist, portfolio, alerts)

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor (creates tables + RLS).
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. (Optional) `SUPABASE_SERVICE_ROLE_KEY` for privileged server tasks — secret.

### CoinGlass (optional)

Set `COINGLASS_API_KEY` (server-only). Liquidation map/heatmap then use live
CoinGlass data; otherwise they fall back to exchange-derived estimates. We do
**not** scrape CoinGlass or copy its UI — integration is via its official v4 API
only (`lib/coinglass`):

- `GET /api/futures/liquidation/map` → Liquidation Map
- `GET /api/futures/liquidation/heatmap/model3` → pair Liquidation Heatmap

> ⚠️ Both endpoints require a CoinGlass **Professional or Enterprise** plan
> (Hobbyist/Startup/Standard do not include them). With no key — or a lower plan
> — the map/heatmap show a clearly-labelled *estimate* derived from open
> interest, plus a message explaining why. Optionally set `COINGLASS_EXCHANGE`
> (default `Binance`).

---

## Build phases & status

| Phase | Scope | Status |
|------|-------|--------|
| 1 | Next.js + TS + Tailwind + Supabase setup | ✅ |
| 2 | Exchange connectors (Binance/OKX/Bybit/Bitget) | ✅ |
| 3 | Dashboard: price, volume, trending, gainers/losers | ✅ |
| 4 | Coin detail: chart, multi-exchange comparison | ✅ (order book UI: partial) |
| 5 | Futures: funding, open interest, long/short | ✅ |
| 6 | Liquidations: map, heatmap, exposure | ✅ (estimated w/o CoinGlass) |
| 7 | CoinGlass integration (abstraction + key server-side) | ✅ abstraction; live path on key |
| 8 | Accounts: login, watchlist, portfolio, alerts | ✅ (alerts: browser notifications) |
| 9 | Whale, news, fear & greed, market heatmap | ✅ (news needs provider key) |
| 10 | Prod: security, caching, WebSocket, SEO, mobile | ⏳ REST+cache+SEO done; WS streaming is the next upgrade |

**Known follow-ups (Phase 10):** swap the in-memory cache for Upstash/Redis on
serverless; add public WebSocket subscriptions (per each adapter's `wsPublic`)
for sub-second ticker/trade/liquidation streams; wire a licensed news provider;
admin dashboard beyond `/status`.

---

## Project structure

```
app/            App Router pages + /api routes
components/      UI (layout, tables, charts, coin, liquidation views)
components/ui/   shadcn-style primitives (card, button, badge)
hooks/          useApi (polling), useUser, useFavorites
lib/
  exchanges/    adapter interface + binance/okx/bybit/bitget + registry
  services/     market, chart, derivatives, health
  coinglass/    CoinGlass abstraction (server-only)
  aggregate.ts  fan-out + VDEAR index + envelope
  cache.ts      TTL cache + single-flight
  types.ts      canonical data model
supabase/       schema.sql (tables + RLS)
legacy-static/  the previous static site, preserved
```

> A note on data limits: exchange **REST** APIs don't publish historical
> liquidation totals — those need a WebSocket liquidation stream or a provider
> like CoinGlass. VDEAR is honest about this: it shows OI-based exposure and
> labelled estimates until such a source is configured.
