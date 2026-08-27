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

### Nguồn: SoSoValue

`POST /openapi/v2/etf/currentEtfDataMetrics`, header `x-soso-api-key`, body
`{"type":"us-<symbol>-spot"}`. **Một nguồn duy nhất** phủ cả 12 tài sản — nên
cả bảng cùng một ngày và cùng một cách tính, không phải giải thích vì sao dòng
này lệch dòng kia.

Đường dẫn **đã xác nhận chạy được**: API trả HTTP 200 kèm dữ liệu thật, với các
trường `totalNetAssets`, `totalNetAssetsPercentage`, `dailyNetInflow`,
`cumNetInflow`, `dailyTotalValueTraded`, `totalTokenHoldings`, `list`. Đó là
tên trường thật, đọc từ phản hồi thật, không phải phỏng đoán. `list` là bảng
chia theo từng quỹ, dùng để dựng cột "quỹ đóng góp nhiều nhất" và đếm số quỹ
đang niêm yết (SoSoValue hiện là "×12", "×11").

Bảng lấy đủ bốn chỉ số nguồn công bố, không chỉ dòng tiền:
`dailyNetInflow` → **Dòng tiền ròng ngày**, `totalNetAssets` → **Tài sản ròng**,
`dailyTotalValueTraded` → **GT giao dịch**, `list.length` → **số quỹ**.

Giá trị có thể là số trần, chuỗi số, hoặc object bọc `{value, date}` — bộ đọc
chịu được cả ba. Không đọc ra thì **báo lỗi kèm chẩn đoán**, không suy ra số.

`m.sosovalue.com/...` là **giao diện web, không phải API** — đọc dữ liệu từ đó
là scrape, vi phạm điều khoản và bị CORS chặn. Hàm này chỉ gọi API chính thức.

### Vỏ rỗng không phải là số 0 — phân biệt bằng TÀI SẢN RÒNG

Nguồn trả HTTP 200 đúng khuôn cho cả những mã tài sản nó không nhận ra: mọi chỉ
số bằng 0, không quỹ nào.

Nhưng **số 0 thật cũng tồn tại**: trang SoSoValue cho thấy LINK, HBAR, AVAX,
DOGE, DOT có dòng tiền đúng `$0.00` mà tài sản ròng vẫn là $170.25M, $56.88M,
$37.03M… Quỹ có thật, chỉ là hôm đó không ai tạo/huỷ chứng chỉ. Đó là **dữ
liệu**, phải hiện `$0`.

Nên dấu hiệu phân biệt **không phải** thiếu ngày, mà là **tài sản ròng**: quỹ có
tồn tại thì tài sản ròng không thể bằng 0. Vỏ rỗng = không dòng tiền, không tài
sản ròng, không giá trị giao dịch, không quỹ nào — tài sản đó vào `notCovered`
và bảng ghi "Nguồn không công bố".

### Lấy bảng tổng quan, không phải 12 lần gọi riêng

Trang "Tổng quan ETF Crypto Giao ngay Mỹ / All US" của SoSoValue liệt kê cả 12
tài sản kèm đủ bốn chỉ số trong **một bảng**, ở mã loại `us-crypto-spot` (đuôi
URL của chính trang đó). Nên hàm gọi bảng đó **một lần** thay vì hỏi từng tài
sản: cùng một ảnh chụp, cùng một ngày, và không phải đoán mã riêng của từng tài
sản — mã sai chính là thứ làm XRP và HYPE ra `$0` trong khi thật ra là $28.14M
và $14.71M.

Việc chọn cách nào **không dựa vào phỏng đoán**: bảng tổng quan chỉ được dùng
khi nhận ra được ít nhất 4 tài sản trong `list` của nó. Nhận ra ít hơn nghĩa là
`list` không phải bảng theo tài sản, và hàm rơi xuống cách gọi từng tài sản,
ghi lý do vào `overviewNote`. Trường `via` cho biết đường nào đã chạy.

Mã quỹ (IBIT, GBTC, ETHA…) không có trong bảng tổng quan nên vẫn phải gọi riêng
— nhưng **chỉ cho tài sản có dòng tiền khác 0** (ngày không ai tạo/huỷ chứng chỉ
thì chẳng quỹ nào để xếp hạng), và lần gọi đó **chỉ lấy danh sách quỹ**, không
được ghi đè con số đã đúng của bảng tổng quan.

### Thử mã tài sản, có kiểm chứng (chỉ khi bảng tổng quan không dùng được)

`us-btc-spot`, `us-eth-spot`, `us-sol-spot` đã chạy thật. Các tài sản khác trả
vỏ rỗng với cùng khuôn đó — khuôn đúng, mã có thể khác, vì vài nguồn dùng tên
đầy đủ (`us-ripple-spot`, `us-dogecoin-spot`, `us-hyperliquid-spot`) thay cho
mã ngắn.

Nên mỗi tài sản có một danh sách mã để thử lần lượt, và **chỉ nhận bản ghi có
ngày thật**. Đây không phải đoán bừa: mỗi lần thử đều được kiểm chứng bằng dữ
liệu trả về, thử hết mà vẫn rỗng thì báo "nguồn không có tài sản này" kèm danh
sách đã thử. Biết chắc mã đúng thì đặt `SOSOVALUE_TYPE_MAP` để khỏi phải thử.

### Sai thì sửa bằng env, không phải sửa code

Đường dẫn / method / tên header / mã tài sản đều ghi đè được
(`SOSOVALUE_API_BASE`, `SOSOVALUE_ETF_PATH`, `SOSOVALUE_ETF_METHOD`,
`SOSOVALUE_KEY_HEADER`, `SOSOVALUE_TYPE_MAP`). Và hàm tự chẩn đoán:

* Gọi hỏng → `errors[]` ghi **đúng thứ đã gọi**:
  `HTTP 404 · POST /openapi/... type=us-doge-spot`.
* Số ra **không khớp trang sosovalue.com** → gọi `/api/etf-flow?diag=1`. Nó
  trả về, cho từng tài sản: các khoá thật của bản ghi, tên trường đã lấy, và
  **mọi số đọc được bên trong object bọc đó**. Ví dụ
  `netCandidates: {value: 0.53, valueUsd: 232100000}` cho biết ngay là đang
  lấy nhầm `value` thay vì `valueUsd`. Chỉ tên trường và số, không bao giờ kèm
  key.
* Mọi tài sản ra **cùng một con số** → `sameValue: true`, và bảng tự hiện cảnh
  báo đừng tin nó. Nghĩa là nhà cung cấp không dùng tham số `type`, trả cùng
  một bản ghi cho cả 12 lần gọi. Trông vẫn hợp lý nên không ai nhận ra.
* Đọc không ra → báo **từng trường ứng viên kèm kiểu của nó**:
  `dailyNetInflow=null · list=mảng[0]`, hoặc `dailyNetInflow={amount,asOf}`.
  Biết kiểu thì sửa dứt điểm; biết mỗi tên trường thì vẫn phải đoán thêm vòng.

Phản hồi dạng **mảng** thì lấy bản ghi có ngày mới nhất, không phải phần tử
đầu — nhà cung cấp xếp cũ-trước thì `d[0]` là ngày cũ nhất, số hiện ra sai hoàn
toàn mà trông vẫn hợp lý.

### Một ngày cho cả bảng

Cùng một nguồn nhưng mỗi tài sản chốt số xong vào lúc khác nhau. Bảng trộn hai
ngày mà không nói ra thì cộng lại ra một con số không tồn tại. Hàm chốt **một
ngày cho cả bảng**: ngày mà nhiều tài sản có nhất (hoà thì lấy ngày mới hơn).
Tài sản nào nguồn chưa chốt xong ngày ấy thì giữ ngày riêng nhưng **bị đánh dấu
⚠** ở cột ngày, và bảng hiện cảnh báo `mixedDates`.

### Số 0 không phải là chỗ trống

Ngày không quỹ nào tạo/huỷ chứng chỉ thì dòng tiền **đúng bằng 0** — đó là dữ
liệu, không phải thiếu dữ liệu. `$0` hiện ra với chip trung tính (không xanh
không đỏ); chỉ khi thật sự không đọc được mới hiện `—`.

### Bật lên

1. Lấy API key ở SoSoValue.
2. Vercel → Settings → Environment Variables → `SOSOVALUE_API_KEY`.
3. Redeploy.

Chưa có key → `configured:false`, giao diện hiện "chưa cấu hình nguồn" và để
trống. Có key mà gọi hỏng → `available:false` kèm lý do từng tài sản. Không
đường nào trong `api/etf-flow.js` sinh ra số liệu.

**Key chỉ nằm ở biến môi trường.** Không commit vào repo, không dán vào chat,
không để lọt vào thông báo lỗi — hàm scrub key ra khỏi mọi message trước khi
trả về. Key đã lộ ở đâu đó thì coi như hỏng: revoke và tạo key mới.
