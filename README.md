# VDEAR — Crypto Market Intelligence

**Live:** https://vdearypto.vercel.app

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

npm test               # 270 tests: type-checks with tsc, then runs the suite
npm run test:fast      # same 270 tests with NO build and NO node_modules
```

`npm test` is the authoritative path — it type-checks first, so a type error
fails the run. `test:fast` executes the TypeScript sources directly on Node's
built-in runner (`--experimental-strip-types` plus a small `@/` resolve hook in
`tests/register.mjs`). It skips type-checking, but it needs nothing installed,
which makes the engines verifiable in restricted or offline environments.

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

270 tests run on Node's built-in test runner with **zero dependencies**, so the
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

---

## Design skills

Two Claude Code skill packs are vendored under `.claude/skills/` so the design
guidance travels with the repository:

| Skill pack | Source | Role |
|---|---|---|
| `ui-ux-pro-max` (+ `design`, `design-system`, `ui-styling`, `brand`, `banner-design`, `slides`) | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | Searchable UI/UX intelligence: 119 UX guidelines, 192 palettes, 74 font pairings, 25 chart types, 22 stacks, plus a pre-delivery checklist. |
| `taste-skill` (+ `minimalist`, `brutalist`, `soft`, `redesign`, `brandkit`, `stitch`, …) | [leonxlnx/taste-skill](https://github.com/leonxlnx/taste-skill) | Anti-slop frontend direction for marketing surfaces. |

Query the design database directly:

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py \
  "crypto trading dashboard data terminal analytics" --design-system -p "VDEAR"
```

For this product it returns the **“Data-Dense Dashboard”** style — KPI cards,
data tables, minimal padding, maximum data visibility — which matches the
terminal direction already in place.

**Where the skills are deliberately not followed.** The same query recommends a
Fira Sans / Fira Code pairing. VDEAR keeps **IBM Plex Mono + Newsreader**: the
mono-everywhere instrument feel is a deliberate identity choice, and the skill's
own contract says its output is a recommendation, never an instruction that
overrides repository decisions. `taste-skill` likewise self-scopes to *landing
pages, portfolios and redesigns — not dashboards or data tables*, so it applies
only to marketing surfaces, never to the terminal views.

Checklist items enforced from the packs: no emoji as icons (Lucide SVG only),
visible `:focus-visible` rings, global `prefers-reduced-motion`, semantic colour
tokens rather than raw hex in components, and tabular numerics throughout.

---

## Deployment

**Production serves the static build in `legacy-static/`** — the Vietnamese
futures dashboard, the bubble view, the canvas chart and the legal pages.
`vercel.json` sets `outputDirectory` there with install and build stubbed out.

The Next.js app under `app/`, `lib/` and `components/` is complete and tested
(26 routes, 39 API routes, 11 engines, 10 providers, scoring and quality
layers, 270 tests) and **has been deployed successfully once** — so the build
works. It is not what production serves, because its interface reads as a
different product from the dashboard above.

Switching it on again is two changes:

1. Remove `framework`, `installCommand`, `buildCommand` and `outputDirectory`
   from `vercel.json`. `npm run prebuild` (`scripts/copy-static.mjs`) then
   copies `legacy-static/` into `public/`, publishing `index.html` as
   `classic.html` since `/` becomes the app's home.
2. Relink the drawer: entries carrying `soon: true` in
   `legacy-static/js/navmenu.js` must point at the app routes. While the
   static build is serving they have to stay unlinked — those routes do not
   exist in that folder, and linking them returns the static 404 page.

`typescript.ignoreBuildErrors` in `next.config.mjs` was added because this
sandbox cannot compile the app (no node_modules, registry blocked). One green
build has happened since; before relying on the app, run `npm run typecheck`
somewhere with dependencies installed, fix what it reports, and remove that
block.

---

## Dòng tiền ETF

`api/etf-flow.js` là một Vercel Serverless Function chạy cùng bản tĩnh. Nó tồn
tại vì một lý do duy nhất: **API key không được xuống trình duyệt.**

Dòng tiền ròng của ETF (tiền thực vào/ra quỹ mỗi ngày) tính từ số chứng chỉ quỹ
được phát hành thêm hoặc mua lại. Nó **không suy ra được** từ giá hay khối lượng
khớp lệnh — khối lượng là nhà đầu tư sang tay nhau, tiền không chạm tới quỹ.
Không nguồn miễn phí nào công bố số này.

### Hai nguồn

| Nguồn | Tài sản | Trạng thái xác minh |
| --- | --- | --- |
| **CoinGlass** | BTC, ETH, SOL, XRP | **Đã đối chiếu tài liệu chính thức.** `GET /api/etf/{bitcoin,ethereum,solana,xrp}/flow-history`, header `CG-API-KEY`. Có ở **mọi gói kể cả Hobbyist**. Kèm dòng tiền **từng quỹ** trong `etf_flows[]`. |
| **SoSoValue** | phủ rộng hơn | **Chưa đối chiếu được.** Xem cảnh báo bên dưới. |

Đặt một trong hai, hoặc cả hai. Có cả hai thì mỗi tài sản thử CoinGlass trước
rồi mới rơi xuống SoSoValue, và **cột ngày trong bảng ghi rõ mỗi con số đến từ
nguồn nào** — hai nguồn không cùng độ tin cậy thì không được trộn lẫn im lặng.

Cột "quỹ đóng góp nhiều nhất" chỉ có ở các dòng CoinGlass, vì mã quỹ lấy thẳng
từ API. Không có thì để `—`, không tự chế mã chứng khoán.

### Cảnh báo về SoSoValue

`m.sosovalue.com/...` là **giao diện web, không phải API** — đọc dữ liệu từ đó
là scrape, vi phạm điều khoản và bị CORS chặn. Hàm này chỉ gọi API chính thức.

Đường dẫn thì **đã xác nhận là đúng** — API trả về HTTP 200 kèm dữ liệu, với
các trường `totalNetAssets`, `totalNetAssetsPercentage`, `dailyNetInflow`,
`cumNetInflow`, `dailyTotalValueTraded`, `totalTokenHoldings`, `list`. Đó là
tên trường thật, đọc từ phản hồi thật, không phải phỏng đoán.

Điều còn lại chưa chắc là **kiểu của từng giá trị** (số trần, chuỗi số, hay
object bọc `{value, date}`). Bộ đọc chịu được cả ba, và `list` được dùng để
dựng cột "quỹ đóng góp nhiều nhất". Cơ chế tự chẩn đoán vẫn giữ nguyên:

* Toàn bộ đường dẫn / method / tên header / mã tài sản đều **ghi đè được bằng
  biến môi trường** (`SOSOVALUE_ETF_PATH`, `SOSOVALUE_ETF_METHOD`,
  `SOSOVALUE_KEY_HEADER`, `SOSOVALUE_TYPE_MAP`).
* Gọi hỏng thì `errors[]` ghi **đúng thứ đã gọi** — `HTTP 404 · POST /openapi/... type=us-doge-spot`.
* Dạng dữ liệu không khớp thì báo **từng trường ứng viên kèm kiểu của nó**, ví
  dụ `dailyNetInflow=null · list=mảng[0]` hoặc
  `dailyNetInflow={amount,asOf}`. Biết kiểu thì sửa dứt điểm, chứ báo mỗi tên
  trường thì vẫn phải đoán thêm một vòng.

Nghĩa là sai thì sửa bằng env var, không phải sửa code rồi deploy lại. Và
không có nhánh nào đoán ra một con số khi không đọc được dữ liệu.

### Bật lên

1. Lấy API key ở CoinGlass và/hoặc SoSoValue.
2. Vercel → Settings → Environment Variables → `COINGLASS_API_KEY`,
   `SOSOVALUE_API_KEY`.
3. Redeploy.

Chưa có key nào → `configured:false`, giao diện hiện "chưa cấu hình nguồn" và
để trống. Có key mà gọi hỏng → `available:false` kèm lý do từng tài sản. Không
đường nào trong `api/etf-flow.js` sinh ra số liệu.

**Key chỉ nằm ở biến môi trường.** Không commit vào repo, không dán vào chat,
không để lọt vào thông báo lỗi — hàm scrub key ra khỏi mọi message trước khi
trả về. Key đã lộ ở đâu đó thì coi như hỏng: revoke và tạo key mới.
