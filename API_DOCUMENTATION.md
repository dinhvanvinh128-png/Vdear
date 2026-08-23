# VDEAR — API Reference

All routes are `GET`, return JSON, run on the Node runtime and are
`force-dynamic`. Every input is validated with zod (`lib/api/guard.ts`); an
invalid parameter returns `400` with a message naming the field.

Base URL: your deployment origin. Rate limit: **120 requests/minute per IP**.

---

## The Envelope

Every data route returns provenance alongside the payload:

```jsonc
{
  "data": { /* … */ },
  "meta": {
    "kind": "live",              // live | estimated | unavailable | demo
    "sources": ["binance", "okx"],
    "errors": [{ "exchange": "bybit", "message": "timeout after 8000ms" }],
    "generatedAt": 1700000000000,
    "cached": false
  }
}
```

`sources` is what actually contributed. `errors` is what was tried and failed.
Both are always present — a partial answer is never presented as complete.

## Errors

| Status | Meaning |
|---|---|
| `400` | Invalid input; the message names the field |
| `401` | Cron route called without a valid `CRON_SECRET` bearer |
| `429` | Rate limited |
| `503` | Upstream data temporarily unavailable |

Internal error detail is never echoed on a `5xx`, and credential-shaped query
parameters are redacted before anything is logged.

---

## Intelligence

### `GET /api/scores/{symbol}`

The full pipeline for one asset: every sub-score, regime, signal,
accumulation phase, data quality and the analyst narrative.

| Param | Type | Default |
|---|---|---|
| `market` | `spot` \| `futures` | `spot` |

<details><summary>Response shape (abridged)</summary>

```jsonc
{
  "data": {
    "symbol": "BTC",
    "price": 100000,
    "priceChange24h": 2.35,

    "moneyFlow": {
      "score": 76,
      "direction": "INFLOW",
      "coverage": 0.85,          // share of scoring weight available
      "confidence": 82,
      "components": [
        { "component": "spotFlow", "label": "Spot Flow", "score": 76,
          "weight": 20, "effectiveWeight": 23.5, "confidence": 95 },
        { "component": "whaleFlow", "label": "Whale Flow", "score": null,
          "weight": 10, "effectiveWeight": 0, "confidence": 0,
          "unavailableReason": "Exchange flow needs CryptoQuant or Glassnode — not configured." }
      ]
    },

    "regime":  { "regime": "BULL_ACCUMULATION", "baseRegime": "NEUTRAL",
                 "overrideReason": "Price is not leading, but flow is…",
                 "conviction": 71 },
    "signal":  { "state": "BULLISH", "confidence": 74, "rawState": "HIGH_CONFIDENCE_BULLISH",
                 "downgradeReason": "Data confidence is 62/100…",
                 "rulesFired": ["composite 76.0 -> Bullish", "guard: …"],
                 "contradictions": ["…"] },
    "accDist": { "phase": "ACCUMULATION", "strength": 58, "bias": 79,
                 "divergences": ["Price is flat while cumulative delta rises…"] },

    "analyst": { "summary": "…", "why": ["…"], "risks": ["…"],
                 "contradictions": ["…"], "blindSpots": ["…"],
                 "scenarios": [{ "name": "Continuation", "kind": "primary",
                                 "description": "…", "confirmation": "…" }] },

    "trend": { "score": 82, "rangebound": false, "covered": ["1d","4h"], "missing": ["15m"] },
    "spotFlow": { "score": 76, "cvd": 1.2e8, "buyPressure": 0.58,
                  "sources": ["binance"], "excluded": ["okx","bybit","bitget"] },
    "breadth": { "score": 71, "universe": 312, "aboveEma200": { "pct": 64, "sample": 58 } },
    "liquidity": { "score": 69, "direction": "expanding" },
    "onChain": { "score": 72, "sources": ["coinmetrics"], "missing": [] },
    "whale": { "score": 75, "tiers": ["cex_fills"], "exchangeFlowNote": "…" },
    "derivatives": { "score": 55, "regime": "long_crowding", "warnings": ["…"] },

    "quality": { "confidence": 82, "anomalies": [], "unavailable": [{ "source": "…", "reason": "…" }] },
    "unavailable": [{ "source": "Glassnode", "reason": "not configured" }]
  },
  "meta": { /* … */ }
}
```
</details>

### `GET /api/money-flow`

Composite for several assets at once.

| Param | Type | Default |
|---|---|---|
| `symbols` | comma list, max 6 | `BTC,ETH,SOL` |

### `GET /api/regime` · `GET /api/signals/{symbol}` · `GET /api/analyst/{symbol}`

Focused slices of the same pipeline — regime + phase, signal + fired rules, and
the narrative respectively.

---

## Flow and market structure

### `GET /api/spot-flow/{symbol}`

| Param | Type | Default | Notes |
|---|---|---|---|
| `timeframe` | `5m`\|`15m`\|`1h`\|`4h`\|`1d` | `1h` | |
| `market` | `spot` \| `futures` | `spot` | |
| `all` | `true` \| `false` | `false` | every timeframe at once |
| `trades` | `true` \| `false` | `false` | short-horizon fill-derived flow instead |

`data.excluded` lists venues that publish no taker-buy split. They are omitted
rather than assumed balanced. With `trades=true`, `windowMs` states how much time
the sample actually covers — usually minutes.

### `GET /api/breadth`

Full-universe breadth. Every ratio carries `{ pct, count, sample }`; `pct: null`
means no asset had enough history to be judged.

### `GET /api/liquidity/{symbol}`

Order book depth at ±0.25/0.5/1/2% (quote currency), spread, and the composite
liquidity score. `bands[].imbalance: null` means nothing is resting in that band.

---

## Market-wide

| Route | Returns |
|---|---|
| `GET /api/stablecoins` | supply, 1d/7d/30d change, chain split, direction |
| `GET /api/defi` | TVL + deltas, DEX volume, pool activity |
| `GET /api/sectors` | sector rotation across the ten buckets, with `leaders`/`laggards` and `unclassified` |
| `GET /api/onchain/{symbol}` | per-metric values, z-scores, the provider that answered, and `attempts` showing the full resolution chain |
| `GET /api/whales` | `symbol`, `minUsd` (≥1000). Tier 1 buckets always; tier 2 flow when configured, else `exchangeFlowNote` explains why not |
| `GET /api/alerts` | `symbol`, `limit`. Live-detected alerts + stored history + a `persistence` note |
| `GET /api/quality` | cross-venue anomalies and provider status |
| `GET /api/health` | exchanges, providers, cache and circuit-breaker state |

---

## Existing market & derivatives routes

Unchanged and still supported: `/api/market`, `/api/coins`, `/api/futures`,
`/api/ticker/{symbol}`, `/api/klines/{symbol}`, `/api/trades/{symbol}`,
`/api/orderbook/{symbol}`, `/api/funding`, `/api/open-interest`,
`/api/open-interest/history`, `/api/longshort/{symbol}`, `/api/liquidations`,
`/api/liquidations/map`, `/api/liquidations/heatmap`, `/api/heatmap`,
`/api/tickerbar`, `/api/fear-greed`, `/api/news`.

Common params: `market=spot|futures`, `exchange=all|binance,okx,…`,
`index=volume|equal|exchange`, `limit`.

---

## Cron

Require `Authorization: Bearer $CRON_SECRET`. Without a database configured each
returns `{ "skipped": true, "reason": "…" }` rather than failing.

| Route | Schedule | Does |
|---|---|---|
| `/api/cron/ingest` | `*/15 * * * *` | store CVD series + a health snapshot |
| `/api/cron/scores` | `0 * * * *` | store the score snapshot per tracked asset |
| `/api/cron/alerts` | `*/15 * * * *` | detect and persist new alerts (dedupe-keyed) |
| `/api/cron/prune` | `0 4 * * *` | apply the retention policy |

---

## Reading a response correctly

1. **Check `coverage` before `score`.** A 90 at 25% coverage is a different
   claim from a 90 at 100%.
2. **Check `meta.errors` and `data.unavailable`.** They name what was missing.
3. **`null` means unknown, never zero.** A `null` buy pressure means nothing
   traded; a `null` imbalance means the band was empty.
4. **Read `quality.anomalies`.** A non-empty entry means a venue was excluded
   from the index for quoting outside the median.
