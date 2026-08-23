# VDEAR — Deployment

## Local

```bash
npm install
cp .env.example .env.local     # everything is optional to start
npm run dev                    # http://localhost:3000
```

**No API keys are required.** Binance, OKX, Bybit, Bitget, CoinGecko, DeFiLlama,
GeckoTerminal and Coin Metrics all work unauthenticated. Open `/status` — every
core provider should be green and every premium provider should read
*"not configured"*, which is an expected state, not a fault.

## Verify

```bash
npm run test:types   # typecheck the engine layer (no install needed)
npm test             # 262 tests via Node's built-in runner (no install needed)
npm run typecheck    # full app typecheck (needs node_modules)
npm run lint
npm run build
```

The first two run with **zero dependencies** — deliberately, so the maths behind
every score stays verifiable even where the npm registry is unreachable. CI runs
them in a separate job from the app build for the same reason.

---

## Vercel

1. Import the repository; the framework is detected automatically.
2. Set environment variables (below).
3. Deploy.

`vercel.json` already declares the cron schedules and security headers. Cron
requires the Vercel Pro plan; without it the routes still work when called
manually with the bearer token, and the app runs normally without history.

### Environment variables

Nothing here is required to run. Add only what you want to unlock.

| Variable | Effect if unset |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | canonical/OG/sitemap URLs fall back to Vercel's own domain — see below. Correct without it |
| `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no accounts, no history — scores still compute live |
| `SUPABASE_SERVICE_ROLE_KEY` | cron cannot write; routes return `skipped` with a reason. **Server-only** |
| `CRON_SECRET` | cron routes refuse to run rather than being publicly triggerable |
| `COINGECKO_API_KEY` | free tier, tighter rate limit |
| `DEFI_LLAMA_API_KEY` | free endpoints, tighter rate limit |
| `COINMETRICS_API_KEY` | community tier (sufficient for the on-chain score) |
| `COINGLASS_API_KEY` | liquidation map/heatmap show a labelled OI-derived estimate |
| `GLASSNODE_API_KEY` | MVRV/SOPR report `not configured` |
| `CRYPTOQUANT_API_KEY` | exchange flow reports `not configured`; whale score uses tier 1 only |
| `ARTEMIS_API_KEY` | network fundamentals report `not configured` |
| `NEWS_API_KEY` | `/news` reports `not configured` |

> **Never** prefix a private key with `NEXT_PUBLIC_` — that exposes it to the
> browser. Only the Supabase URL and anon key belong under that prefix.

### Site URL resolution

`lib/site.ts` is the single source of truth for `metadataBase`, `robots.ts` and
`sitemap.ts`, so canonical tags, OpenGraph URLs and the sitemap can never point
at different hosts. It resolves in this order:

```
NEXT_PUBLIC_SITE_URL             an explicit choice always wins
VERCEL_PROJECT_PRODUCTION_URL    the stable production domain Vercel assigns
VERCEL_URL                       this specific deployment (preview builds)
http://localhost:3000            local development
```

Both `VERCEL_*` values are injected automatically, so **a fresh import with no
configuration is already correct** — set `NEXT_PUBLIC_SITE_URL` only when you
attach a custom domain. No real host is hard-coded anywhere: a placeholder would
be worse than localhost, because it reads as valid in a canonical tag while
pointing at a site that may not exist.

### Database (optional)

```bash
psql "$DATABASE_URL" -f supabase/schema.sql
psql "$DATABASE_URL" -f supabase/migrations/0002_market_intelligence.sql
```

See `DATABASE_SCHEMA.md`. Both files are safe to re-run.

### Cron

Already in `vercel.json`:

| Route | Schedule |
|---|---|
| `/api/cron/ingest` | every 15 min |
| `/api/cron/scores` | hourly |
| `/api/cron/alerts` | every 15 min |
| `/api/cron/prune` | daily 04:00 UTC |

Test one manually:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/cron/scores
```

---

## Post-deploy checklist

```bash
# 1. Every core provider online, premium ones "not configured"
open https://your-app.vercel.app/status

# 2. A real score with real provenance
curl -s https://your-app.vercel.app/api/scores/BTC \
  | jq '{sources: .meta.sources, coverage: .data.moneyFlow.coverage,
         confidence: .data.quality.confidence, regime: .data.regime.regime}'

# 3. Cross-venue agreement
curl -s https://your-app.vercel.app/api/quality | jq '.data.anomalies'
```

**A good result is not "no errors" — it is honest numbers.** Expect
`coverage < 1` when premium providers are unconfigured, and expect the missing
components to be named in `data.moneyFlow.components[].unavailableReason`. That
is the system working correctly.

### Negative test — worth running once

Block a venue (`/etc/hosts` locally, or revoke a key) and reload. Expected:

- the dashboard still renders;
- that source turns red on `/status`;
- the affected component shows as unavailable **with a reason**;
- `coverage` and `confidence` drop;
- the score renormalises rather than moving toward 50.

If a missing source ever produces a silently plausible number instead, that is a
bug — the whole design exists to prevent it.

---

## Operations

- **Rate limits** — per-host token buckets sit below each provider's documented
  ceiling. CoinGecko's free tier is the tightest and has the longest cache TTL.
- **Circuit breakers** — five consecutive failures open a host for 30s, so a
  dead upstream costs 0ms instead of repeated timeouts. State is on `/status`.
- **Cache** — in-memory TTL + single-flight, per warm instance. To make it
  shared, swap the store in `lib/cache.ts` for Upstash Redis; call sites do not
  change.
- **Scaling reads** — `/api/scores/{symbol}` runs the full pipeline. It is cached
  for 30s; raise `INTELLIGENCE_TTL` in `lib/services/intelligence.ts` before
  raising rate limits.

## Security

- Keys are read only in server code; nothing private is `NEXT_PUBLIC_`.
- Every route input is zod-validated; symbols are pattern-checked before being
  interpolated into upstream URLs.
- Credential-shaped query parameters are redacted before logging — Glassnode and
  Artemis authenticate via a query parameter, so a logged URL would be a logged
  secret.
- Internal rate limit: 120 req/min per IP. Cron is bearer-gated.
- Security headers are set in `vercel.json`; API responses allow only short
  shared caching.
