# Vdearypto — Crypto Intelligence Terminal: audit and plan

Audit run against the repository, not from memory. Every count below comes
from a command against the working tree.

## 1. The finding that changes the plan

**The upgrade is largely already written. It is not what production serves.**

| | Deployed (`legacy-static/`) | In the repo, unpublished (`app/`, `lib/`) |
|---|---|---|
| Pages | 9 static HTML | 26 Next.js routes |
| API routes | 0 (browser calls exchanges directly) | 39 |
| Engines | — | 11 (`spotFlow`, `breadth`, `whale`, `onchain`, `stablecoin`, `orderBook`, `sector`, `derivatives`, `defi`, `alerts`) |
| Providers | 4 exchanges, inline | 10 packages + registry (`binance`, `okx`, `bybit`, `bitget`, `coingecko`, `defillama`, `coinglass`, `coinmetrics`, `geckoterminal`, `artemis`, `glassnode`, `cryptoquant`) |
| Scoring | RSI/S&R confluence only | `moneyFlow`, `liquidity`, `trend`, `accDist`, `regime`, `signal`, weights in `lib/scoring/config.ts` |
| Data quality | none | `lib/quality/`: `confidence`, `crossSource`, `freshness` |
| Realtime | REST polling | `lib/realtime/` WebSocket client + venue adapters |
| AI analyst | — | `lib/analyst/` with a language guard |
| Database | none | `supabase/schema.sql` + migrations, `lib/db/repositories.ts` |
| Tests | — | 270, passing |
| Docs | — | ARCHITECTURE, DATA_SOURCES, SCORING_SYSTEM, API_DOCUMENTATION, DATABASE_SCHEMA, DEPLOYMENT |

`vercel.json` sets `outputDirectory: legacy-static` with install and build
stubbed out. Every push publishes the nine static pages; the Next.js app is
never built.

So the spec's sections 6–21 and 30–36 are mostly **done**. The gap is
deployment, not implementation.

## 2. Answers to the 13 audit questions

1. **Architecture.** Two products in one tree. Static: browser → 4 exchange
   REST APIs directly, no server. Next.js: providers → normalizer → quality →
   engines → scoring → API routes → React, which is the architecture §6 asks
   for.
2. **Futures modules.** Live in `legacy-static/js/`: `indicators.js`
   (RSI, S/R, price action, confluence), `chart.js`, `coin.js`
   (Entry/TP/SL/DCA, leverage), `dashboard.js` (4H scan). Mirrored in the
   Next app under `/futures`, `/funding`, `/open-interest`, `/long-short`,
   `/liquidations`.
3. **APIs.** Static: none of its own. Next: 39 routes, including
   `/api/spot-flow/[symbol]`, `/api/money-flow`, `/api/breadth`,
   `/api/onchain/[symbol]`, `/api/whales`, `/api/sectors`, `/api/quality`.
4. **Database.** None in production. `supabase/schema.sql` exists and
   `lib/db` is optional by design — the app runs without it.
5. **Routes.** 9 static pages vs 26 app routes.
6. **Reusable.** Everything in `lib/` and `components/`. Nothing needs a
   rewrite.
7. **Spot.** Engine, API route and page exist. Missing: order-book depth
   ingestion at scale and a `/spot` radar table as specified in §24.
8. **On-chain.** Engine, providers and page exist; premium metrics correctly
   report "not configured" rather than inventing numbers.
9. **Money flow.** Engine, weights and page exist.
10. **Refactor.** Only the static site, and only if it stays the product.
11. **Providers usable today with no key.** Binance, OKX, Bybit, Bitget,
    CoinGecko, DeFiLlama, GeckoTerminal, Coin Metrics Community.
12. **Risks.** (a) Switching production to Next.js changes hosting behaviour
    and needs a real build — npm is blocked in this sandbox, so the first
    build can only be verified on Vercel. (b) The static site's favourites
    and theme live in `localStorage` keys the Next app must keep. (c) Free
    endpoints rate-limit; without the cache layer the browser fan-out in the
    static site will hit limits as traffic grows.
13. **Phases.** Below.

## 3. Plan

**Phase 0 — attempted, and it revealed a second requirement.** Removing the
overrides from `vercel.json` was not enough: the Vercel project itself is
configured for a static output, so it kept building `legacy-static/` while the
drawer pointed at app routes, and every module link returned the static 404.
Reverted. The switch needs the dashboard change in README §Deployment as well,
which only the project owner can make.

**Phase 0 (revised) — decide what production serves.** This is a call for the owner,
not for me: keep the static site and port modules into it one at a time, or
switch `vercel.json` to build the Next.js app and get every module at once.
The second is faster but changes the whole surface in one deploy.

**Phase 1 (done in this commit).** Restructure the drawer to the terminal
layout of §27. Live pages link; modules that exist only in the unpublished
app appear as `sắp có` and are not clickable, so the structure is visible
without shipping dead links.

**If Phase 0 chooses the static site:**
2. Port the money-flow engine behind a small serverless route so keys stay
   server-side · 3. `/spot` radar table · 4. breadth · 5. liquidity ·
6. whale · 7. on-chain · 8. sectors · 9. market score and regime on the
   homepage.

**If Phase 0 chooses the Next.js app:**
2. Drop `outputDirectory`/`buildCommand` from `vercel.json`, deploy to a
   preview URL first · 3. Verify the build and the 39 routes against live
   data · 4. Carry over the static site's `vdear_*` localStorage keys ·
5. Point the domain at it. Phases 3–18 of the spec are then already met and
   the work becomes verification, not construction.

## 4. Rules I am holding to

No fabricated data; a missing metric says so. No API keys client-side. No
guessed endpoints. Futures functionality is not to regress — it is the one
part with live users.
