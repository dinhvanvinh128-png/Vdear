# VDEAR — Scoring System

Every weight, threshold and band in this document lives in exactly one file:
**`lib/scoring/config.ts`**. Changing a number there changes the product
everywhere — engine, API and UI — with no other edit. `assertWeightsValid()`
fails loudly if a weight set stops summing correctly.

All scores are **0–100, where 50 is neutral**.

---

## The rule that shapes everything: renormalisation

When a component cannot be computed it is **dropped and the remaining weights
are renormalised**. It is never defaulted to 50.

Worked example — three components available at 80, five unavailable:

| Approach | Composite | What it claims |
|---|---|---|
| Default missing to 50 | **66.5** | "the market is mildly positive" — invented from nothing |
| **Renormalise (VDEAR)** | **80**, coverage 55%, confidence 28 | "the evidence we have is strong, and we have a little over half of it" |

**A missing input costs CONFIDENCE, never the SCORE.** Each unavailable
component carries a human-readable reason through the API to the UI.

Two guards stop a thin picture overstating itself:

- **Direction** is forced to `NEUTRAL` below 35% coverage, however extreme the
  number — two of eight components agreeing is not evidence of a market-wide flow.
- **Extreme regimes** are softened one step below 60% coverage.

---

## Money Flow Score

The headline composite. Weights are exactly as specified:

| Component | Weight | Source |
|---|--:|---|
| Spot Flow | **20** | `engines/spotFlow` — CVD, buy/sell pressure |
| Trend | **20** | `scoring/trend` — multi-timeframe |
| Market Breadth | **15** | `engines/breadth` |
| Stablecoin Liquidity | **15** | `engines/stablecoin` |
| On-chain | **10** | `engines/onchain` |
| Whale Flow | **10** | `engines/whale` |
| DeFi Liquidity | **5** | `engines/defi` |
| Derivatives Confirmation | **5** | `engines/derivatives` |
| | **100** | |

```
score = Σ(componentᵢ × weightᵢ) / Σ(weightᵢ)     — over AVAILABLE components only
coverage = Σ(available weights) / 100
```

Direction: `≥60 INFLOW` · `≤40 OUTFLOW` · else `NEUTRAL` (forced NEUTRAL under
35% coverage).

---

## Spot Flow — the core

**CVD** is computed from taker-split candles, where sell volume is derived
exactly rather than modelled:

```
buy  = takerBuyQuote
sell = quoteVolume − takerBuyQuote        ← exact, not an assumption
delta = buy − sell
cvd   = Σ delta
```

A candle without a split is **skipped, not halved**. A venue that publishes no
split is listed in `excluded` — never given an assumed 50/50 reading.

Timeframes: 5m · 15m · 1H · 4H · 1D.

**Score** = 60% pressure + 40% trend:

- *Pressure*: `buyShare` mapped around 0.5 ± 0.25 → 0–100.
- *Trend*: change in cumulative delta over the last quarter of the window,
  normalised by that window's turnover so it is comparable across assets.

Both matter, because strong buying that is decelerating is a different market
from strong buying that is accelerating.

### When there is no taker split — the MFI fallback

Only Binance publishes `takerBuyQuoteVolume`, so for most pairs the exact
buy/sell breakdown does not exist anywhere. Rather than leaving the heaviest
component permanently unmeasured, Spot Flow falls back to the **Money Flow
Index**, computed from OHLCV alone:

```
typical  = (high + low + close) / 3
raw      = typical × volume
MFI      = 100 × Σ raw(typical↑) / (Σ raw(typical↑) + Σ raw(typical↓))
```

Three rules govern the fallback:

1. **CVD always wins.** MFI runs only when no venue supplied a split. It is the
   weaker instrument: a bar closing up counts entirely as inflow even if most of
   its volume was aggressive selling into a bid-driven rally.
2. **It is never disguised as CVD.** `SpotFlow.method` records which instrument
   produced the score, the panel changes its title and stats accordingly, and the
   `cvd` / `volumeDelta` fields stay `null` — they mean "exact taker split" and
   nothing else may be written into them.
3. **It costs confidence.** An MFI-derived reading enters the data-quality report
   at 85 (derived) instead of 95 (direct CEX measurement), so the composite's
   confidence reflects which instrument was actually used.

A bar whose typical price is unchanged is counted as neither inflow nor outflow,
and a window with no directional volume returns `null` — never a neutral 50.

If neither instrument is available (a brand-new listing with no history), the
component is **dropped and the remaining weights renormalised**. `score` is
`null`, never 50.

**Volume anomaly** is a z-score against the prior 30 bars, not a fixed
threshold: `spike ≥2.5` · `expansion ≥1.0` · `contraction ≤−1.0` ·
`drought ≤−2.0`. A fixed threshold cannot work — "$1B of volume" means something
different for BTC than a mid-cap, and different in a bull market than a dead one.
Insufficient history yields `null`, not `normal`.

---

## Trend Score

Timeframe weights: **1D 40% · 4H 30% · 1H 20% · 15m 10%** — the daily decides
the regime, the 15m only decides whether this is a reasonable moment inside it.

Within each timeframe: **EMA alignment 40% · structure 25% · momentum 20% ·
volume 15%**.

- **EMA alignment** scores *distance*, not which side of the line: a 0.1% cross
  must not score like a 30% trend. Stacked EMAs (20>50>200) earn a bonus.
- **Structure** from HH/HL/LH/LL swing points.
- **Momentum**: RSI as *position* (25→75 mapped to 0→100), not as an
  overbought/oversold trigger — treating RSI 65 as a sell signal in a trend is
  how trend scores get whipsawed.
- **Volume**: participation, folded around neutral in the direction of price.

### ADX is a gate, not a component

Below `ADX 20` the score is pulled toward neutral proportionally:

```
score = 50 + (score − 50) × (adx / 20)
```

A market can sit above every moving average and go nowhere. Without this gate a
2%-a-year drift reads as a healthy uptrend — the single most common way a trend
score misleads.

Timeframes with too little history are **reported in `missing`**, and the
remaining weights renormalise.

---

## Liquidity Score

| Component | Weight |
|---|--:|
| Order book depth (±1%) | 30% |
| Spread | 20% |
| CEX volume | 20% |
| Stablecoin liquidity | 15% |
| DEX liquidity | 15% |

Depth and volume are **log-scaled**: the difference between $10k and $110k of
depth is enormous, while $5m vs $5.1m is nothing. Spread is inverted, 0.01% → 100
and 0.5% → 0.

**Direction** reads *change*, not level — a deep market getting thinner is
contracting liquidity even while it still scores well on depth, and that is
exactly the condition worth warning about.

### Order book imbalance

`bidDepth / (bidDepth + askDepth)` measured in **quote currency** (10 BTC of bids
at $100k is not the same wall as at $50k) across four bands: ±0.25 / 0.5 / 1 / 2%.

Near bands are weighted heaviest (0.4 / 0.3 / 0.2 / 0.1) — depth 0.25% away will
be consumed by the next move; depth 2% away may never be reached. An **empty band
reports `null`, not "balanced"**.

---

## Market Breadth

Over the full USDT universe: % advancing, % above EMA20/50/200, advance/decline,
new highs/lows, advancing vs declining volume.

Weights: advancing 25% · volume ratio 20% · EMA200 20% · EMA20 15% · EMA50 15% ·
highs-vs-lows 5%.

**An asset without enough history for a given average is excluded from that
ratio, not counted as below it.** Every ratio reports its own sample size, so
"68% above EMA200" always means 68% *of the assets that could be judged*. A ratio
with no sample is dropped and the weights renormalise.

---

## Stablecoin Liquidity

Supply expansion vs contraction, judged on **7d (60%) and 30d (40%)** rather than
1d — daily mint/burn is operational noise. A **0.5% noise floor** over 7d
separates a real liquidity trend from routine activity. ±2% over 7d is treated as
full scale; total supply is enormous and slow, so a 2% weekly change is already a
significant capital rotation.

A wound-down stablecoin (0 circulating) is excluded so a redemption does not read
as a market-wide drain.

---

## On-chain

Active/new addresses, tx count, adjusted transfer value, fees — each z-scored
against **its own 30-day baseline**, blended with 30d change. A z of ±2 is full
scale.

Weights: activeAddresses 30% · newAddresses 20% · txCount 20% ·
transferValueUsd 20% · feesUsd 10%.

Metrics no configured provider can serve are listed in `missing`, never defaulted.

---

## Whale Flow

Two explicitly separated tiers (see `DATA_SOURCES.md`):

- **Tier 1 — CEX fills** (free, exact): buy share among whale-sized fills,
  weight 0.4.
- **Tier 2 — exchange flow** (key-gated): netflow z-score **inverted** (coins
  leaving exchanges is accumulation, arriving is supply to be sold), weight 0.6;
  30d reserve change also inverted, weight 0.4.

Flow outweighs fills when both are present — it is the slower,
higher-conviction signal.

---

## Derivatives Confirmation

Capped at 5% of Money Flow and **structurally unable to set direction**. It
answers one question: does positioning confirm what spot flow says?

Weights: OI change 30% · funding 25% · long/short 20% · net liquidations 15% ·
regime bias 10%.

### Funding and positioning are TENT curves, not linear

```
funding = 0      → 50   neutral
funding = +30%   → 75   peak confirmation
funding = +60%   → 50   crowding cancels the momentum
funding ≥ +90%   → 25   crowded leverage actively SUBTRACTS
```

Mildly positive funding means longs are paying to hold an advancing market:
healthy. Extremely positive funding means the same trade is crowded and expensive
to hold, which is fragility, not strength. Long/short share behaves the same way,
peaking at 70/30.

Positioning regimes: `long_crowding` · `short_squeeze` (OI↑ price↑ funding<0 —
the highest-quality confirmation there is) · `short_build` · `long_unwind` ·
`deleveraging` · `balanced`.

---

## Accumulation / Distribution

Weights: CVD-vs-price 30% · whale flow 20% · exchange flow 20% ·
stablecoin 15% · breadth 15%.

**A phase requires an actual DIVERGENCE between price and flow**, not merely a
directional bias. When price and flow agree there is nothing to detect — that is
simply a trend. (An earlier gate used bias alone and labelled a healthy advance
with rising CVD as ACCUMULATION.)

Divergences detected:

| Price | CVD | Reading |
|---|---|---|
| flat | rising | buying absorbed quietly → **ACCUMULATION** |
| flat | falling | selling absorbed quietly |
| rising | falling | advance not backed by spot buying → **DISTRIBUTION** |
| falling | rising | sellers being absorbed |

Plus: price up while breadth is weak → the advance is narrow.

`SIDEWAYS_PRICE_PCT = 3` defines "flat"; `ACC_DIST_THRESHOLD = 60` is the bias a
phase must clear.

---

## Market Regime

The composite picks a **starting band**; structural evidence then overrides it.
Score alone never decides a regime.

| Band | Score |
|---|---|
| STRONG_BULL | ≥80 |
| BULL | ≥65 |
| NEUTRAL | ≥45 |
| BEAR | ≥30 |
| STRONG_BEAR | ≥15 |
| CAPITULATION | <15 |

Overrides — this is where the interesting states come from:

| Override | Condition | Why it matters |
|---|---|---|
| **DISTRIBUTION** | bullish band + distribution phase ≥40 | A top reads BULL on the number alone |
| **BULL_ACCUMULATION** | mid band + accumulation phase ≥40 | A base looks identical to NEUTRAL on the number |
| **RANGE** | mid band + ADX < 20 | A trendless market is not a market "waiting to resolve" |
| **CAPITULATION** | requires volume z ≥2.5 **and** spot flow ≤20 | A bad score alone is a downtrend, not a capitulation |
| **Softening** | coverage < 60% | An extreme claim needs a broad evidence base |

**Conviction** = agreement between independent inputs (45%) + decisiveness of the
composite (30%) + coverage (25%).

---

## Signal

| State | Score |
|---|---|
| 🟢 HIGH_CONFIDENCE_BULLISH | ≥78 |
| 🟢 BULLISH | ≥60 |
| 🟡 NEUTRAL | ≥45 |
| 🟠 CAUTION | ≥35 |
| 🔴 BEARISH | ≥22 |
| 🔴 HIGH_CONFIDENCE_BEARISH | <22 |

Rules decide; the analyst only explains. Three guards apply:

1. **A high-confidence state requires high-confidence DATA.** Below 70 data
   confidence it is downgraded to the plain state. A 90/100 built on a quarter of
   the inputs is not a high-confidence reading, however good the number looks.
2. **Two or more contradictions downgrade a bullish state to CAUTION.** A score
   that looks good with contradicting evidence behind it is precisely when a user
   is most likely to be hurt.
3. **A distribution phase never presents as bullish**, whatever the score.

Every rule that fired is recorded in `rulesFired`, so a signal is auditable.

**Signal confidence** = data confidence 40% + regime conviction 30% +
decisiveness 30%, minus 8 per contradiction.

Contradictions detected include: trend positive while spot flow is negative;
trend negative while spot flow is positive (absorption); a trend carried by
narrow breadth; the composite disagreeing with the flow phase; plus every
derivatives leverage warning.

---

## Language guard

`lib/scoring/language.ts` enforces the no-guarantee rule **in code**, not in
style guidance. `assertCompliant` throws on "chắc chắn", "guaranteed",
"win rate", "100% sure", "risk-free", "can't lose", "must buy/sell",
"financial advice", "moon" and similar. The analyst runs its own output through
it before returning, and a unit test fails the build on a violation.

A system that outputs a probability and a confidence, then describes it in the
language of certainty, has misrepresented its own result.

---

## Alerts

| Alert | Trigger |
|---|---|
| `volume_anomaly` | volume z ≥ 2.5 |
| `cvd_spike` | \|delta\| ≥ 5% of window turnover |
| `whale_transaction` | any fill ≥ $1M |
| `exchange_inflow/outflow_spike` | netflow \|z\| ≥ 2.0 |
| `stablecoin_expansion/contraction` | \|7d change\| ≥ 1.5% |
| `breadth_breakout` / `breakdown` | breadth ≥70 / ≤30 |
| `accumulation` / `distribution_detected` | phase is not NEUTRAL |
| `regime_change` | regime differs from the previous run |

Each carries asset, timestamp, severity, reason, source and confidence, plus an
**hour-bucketed dedupe key** so a persisting condition is recorded once rather
than on every poll. Alerts derive from computed engine output only, so an alert
can never assert something the scores do not — and **no inputs produces no
alerts**, never a "0 detected" one.
