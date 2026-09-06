# Tái cấu trúc hạ tầng dữ liệu — đề xuất

**Tài liệu này để duyệt, chưa code gì.**

Về giá: tôi không mở được trang bảng giá của nhà cung cấp nào từ môi trường
phát triển (mọi host ngoài đều bị chặn). Con số dưới đây là **mức giá niêm yết
tôi biết tới thời điểm gần nhất**, dùng để so sánh phương án — **phải kiểm lại
trước khi đăng ký**. Cấu trúc chi phí (cái gì tăng theo người dùng, cái gì
không) thì không phụ thuộc giá cụ thể, và đó mới là phần đáng đọc.

---

## 1. Vấn đề thật, nói cho gọn

Hiện tại trình duyệt tự gọi 4 sàn rồi tự tính. Mỗi người mở trang là một lượt
quét. Điều đó có ba hệ quả không sửa được bằng cách tối ưu client:

1. **Hạn mức là của NGƯỜI DÙNG, không phải của mình.** Binance chặn 1000
   request/5 phút theo IP. Người dùng mở nhiều tab là tự khoá IP của họ, và
   trang trắng ở phía họ chứ không phải phía mình. (`api/oi-scan.js` đã phải
   sinh ra vì đúng lý do này.)
2. **Tính lặp lại vô ích.** RSI của BTC khung 4H giống hệt nhau với 10.000
   người. Tính 10.000 lần là đốt pin máy người dùng để ra cùng một con số.
3. **Không có lịch sử.** Percentile, backtest, shadow mode, winrate theo chế độ
   — tất cả đều cần một chuỗi thời gian được lưu. Trình duyệt không lưu được.

---

## 2. Kiến trúc đề xuất

```
                    ┌───────────────────────────────────────┐
   4 sàn  ─REST/WS─►│  INGEST WORKER  (Fly.io, luôn chạy)   │
                    │  · nến 1m, OI, funding, aggTrade      │
                    │  · health check /healthz              │
                    └───────────┬───────────────────────────┘
                                │ COPY theo lô
                    ┌───────────▼───────────────────────────┐
                    │  TimescaleDB (Postgres + hypertable)  │
                    │  · candles_1m  → continuous aggregate │
                    │    5m/15m/1h/4h/1d                    │
                    │  · oi_1h, funding_8h, trades_1m       │
                    │  · signals (có version)               │
                    └───────────┬───────────────────────────┘
                                │
                    ┌───────────▼───────────────────────────┐
                    │  COMPUTE WORKER (cùng máy, khác tiến  │
                    │  trình): RSI·ATR·ADX·S&R·CVD·regime   │
                    │  chạy khi có nến ĐÓNG, cập nhật đệ quy│
                    └───────────┬───────────────────────────┘
                                │ SET + TTL
                    ┌───────────▼───────────────────────────┐
                    │  Redis (Upstash)  — chỉ là CACHE      │
                    │  mất sạch cũng dựng lại được từ DB    │
                    └───────────┬───────────────────────────┘
                                │
                    ┌───────────▼───────────────────────────┐
                    │  API (Vercel functions)  ĐỌC, KHÔNG   │
                    │  TÍNH. s-maxage cho CDN.              │
                    └───────────┬───────────────────────────┘
                                ▼
                         legacy-static/ (web)
```

**Ranh giới không được vượt** (mở rộng "layer rule" của `ARCHITECTURE.md`):
ingest không tính; compute không gọi sàn; API không tính; web không tính.
Mỗi tầng vi phạm một lần là lần sau không ai biết con số đến từ đâu.

### 2.1 Vì sao Fly.io chứ không phải Vercel

Vercel serverless không giữ được WebSocket lâu (hàm bị kết thúc sau mỗi
request). Spec 1 cần WS chạy liên tục. Fly.io/Railway giữ tiến trình sống được.
Giữ Vercel cho web + API vì đã chạy sẵn và CDN của nó là thứ đang gánh hạn mức.

### 2.2 Lược đồ TimescaleDB (bản rút gọn)

```sql
create table candles_1m (
  ts        timestamptz not null,
  exchange  text        not null,
  symbol    text        not null,
  open double precision, high double precision,
  low  double precision, close double precision,
  volume double precision, quote_volume double precision,
  trades int,
  primary key (exchange, symbol, ts)
);
select create_hypertable('candles_1m', 'ts', chunk_time_interval => interval '1 day');

-- Khung lớn KHÔNG lưu riêng: continuous aggregate tự dựng và tự làm mới.
create materialized view candles_1h with (timescaledb.continuous) as
select time_bucket('1 hour', ts) as ts, exchange, symbol,
       first(open, ts) as open, max(high) as high,
       min(low) as low, last(close, ts) as close,
       sum(volume) as volume, sum(quote_volume) as quote_volume
from candles_1m group by 1,2,3;

select add_retention_policy('candles_1m', interval '90 days');
select add_retention_policy('candles_1h', interval '3 years');
```

Nén: `add_compression_policy('candles_1m', interval '7 days')` — Timescale nén
time-series cỡ 10–20×, và đây là khoản tiết kiệm dung lượng lớn nhất.

**Ước lượng dung lượng** (600 coin × 4 sàn × 1440 nến/ngày ≈ 3.5 M dòng/ngày,
~80 B/dòng sau nén ≈ **280 MB/ngày**, ~8 GB/tháng). Giữ 90 ngày nến 1m ≈
**25 GB**. Nếu chỉ ingest Binance thì chia 4.

### 2.3 Cập nhật tăng dần (mục 4 của spec)

Tính lại 500 nến mỗi phút × 600 coin × 10 khung là 3 triệu phép tính/phút cho
một kết quả gần như không đổi. Công thức đệ quy:

```
EMA:  e_t = α·p_t + (1−α)·e_{t−1},        α = 2/(n+1)
RSI (Wilder):  avgGain_t = (avgGain_{t−1}·(n−1) + gain_t) / n
               avgLoss_t = (avgLoss_{t−1}·(n−1) + loss_t) / n
ATR (Wilder):  atr_t = (atr_{t−1}·(n−1) + tr_t) / n
```

Trạng thái cần giữ cho mỗi (symbol, khung): `avgGain, avgLoss, atr, ema20,
ema50, +DM, −DM, adx`. Khoảng 8 số × 600 coin × 10 khung = 48.000 số ≈ **400 KB**
— vừa trong RAM, và ghi vào Redis để khởi động lại không phải warm-up lại.

**Chốt chặn bắt buộc:** đệ quy trôi sai số theo thời gian và không tự phát hiện
được. Nên mỗi 24 h phải **tính lại đầy đủ** một lần và so với giá trị đệ quy;
lệch quá 1e-6 tương đối thì log cảnh báo và lấy giá trị tính đầy đủ. Không có
chốt này thì sau vài tháng RSI sai mà không ai biết.

### 2.4 Redis chỉ là cache

Khoá: `v1:ind:{exchange}:{symbol}:{tf}` → JSON gồm giá trị + `computedAt` +
`candleCloseTs`. TTL = 2 × độ dài khung (nến 4H → TTL 8 h). Mất Redis thì API
đọc thẳng DB (chậm hơn, vẫn đúng) và worker nạp lại — **không được để Redis
thành nguồn sự thật duy nhất**.

### 2.5 API

`GET /api/v2/indicators?symbol=BTC&tf=4h` trả:

```json
{ "data": {...}, "generatedAt": "...", "candleCloseTs": 1757000000000,
  "ageSeconds": 42, "stale": false, "sources": ["binance"], "version": "sig-3" }
```

`ageSeconds` và `stale` là bắt buộc — web phải biết mình đang xem số cũ hay
mới, đúng nguyên tắc provenance của `ARCHITECTURE.md`. Rate limit theo IP bằng
Upstash Ratelimit (sliding window, 120 req/phút/IP).

### 2.6 Phiên bản tín hiệu và shadow mode (mục 6 của spec)

```sql
create table signals (
  ts timestamptz not null, symbol text, tf text,
  version text not null,          -- 'sig-3' | 'sig-4-shadow'
  side text, score double precision, confluence int,
  entry double precision, tp double precision, sl double precision,
  regime text,
  outcome text,                   -- điền sau: 'tp' | 'sl' | 'open' | 'expired'
  outcome_ts timestamptz, r double precision,
  primary key (symbol, tf, ts, version)
);
select create_hypertable('signals', 'ts');
```

Compute worker chạy **cả hai** version mỗi lần có nến đóng và ghi cả hai vào
bảng. API chỉ phục vụ version được đánh dấu `active` trong config. Sau 2 tuần
có trang `/stats/shadow` so winrate, tổng R, số tín hiệu của hai bản trên **cùng
một tập nến** — so trên hai khoảng thời gian khác nhau là so hai thị trường
khác nhau, không phải so hai thuật toán.

Đổi version là đổi một dòng config, không phải deploy lại logic.

### 2.7 Quan trắc (mục 7)

Bảng `ops_metrics` (hypertable) ghi mỗi phút: `signals_generated`,
`lag_seconds` theo sàn, `api_error_rate`, `job_duration_ms`, `ws_reconnects`.

Cảnh báo Telegram (Bot API, không cần thư viện — một `fetch` POST):

| điều kiện | mức |
|---|---|
| worker không heartbeat > 2 phút | đỏ |
| một sàn không có dữ liệu mới > 5 phút | đỏ |
| lag > 60 s liên tục 10 phút | vàng |
| tỉ lệ lỗi API > 5% trong 15 phút | vàng |
| số tín hiệu/ngày lệch > 3σ so với 30 ngày | vàng |

Cảnh báo phải có **chống dội**: một sự cố gửi một tin, không phải một tin mỗi
phút — nếu không thì ai cũng tắt thông báo và cảnh báo thành vô dụng.

---

## 3. Chi phí hàng tháng

Giả định: **600 coin, chỉ ingest Binance cho nến 1m** (3 sàn còn lại lấy ticker
mỗi 30 s để đối chiếu chéo, không lưu nến 1m — chi phí lưu trữ giảm 4 lần mà
vẫn giữ được kiểm tra lệch giá của `lib/quality`).

### Mức 1 — 100 người dùng

| khoản | cấu hình | USD/tháng |
|---|---|---|
| Ingest + compute worker | Fly.io shared-cpu-2x, 2 GB | 18 |
| TimescaleDB | Fly Postgres 2 GB RAM + volume 40 GB | 22 |
| Redis | Upstash pay-as-you-go (~2 M lệnh) | 4 |
| Web + API | Vercel Hobby | 0 |
| **Tổng** | | **≈ 44** |

### Mức 2 — 1.000 người dùng

| khoản | cấu hình | USD/tháng |
|---|---|---|
| Worker | shared-cpu-4x, 4 GB | 32 |
| TimescaleDB | 4 GB RAM + volume 100 GB | 55 |
| Redis | ~20 M lệnh | 20 |
| Web + API | Vercel Pro | 20 |
| **Tổng** | | **≈ 127** |

### Mức 3 — 10.000 người dùng

| khoản | cấu hình | USD/tháng |
|---|---|---|
| Worker | 2 máy (1 ingest, 1 compute), 4 GB mỗi máy | 64 |
| TimescaleDB | 8 GB RAM + volume 250 GB + 1 replica đọc | 150 |
| Redis | ~150 M lệnh | 90 |
| Web + API | Vercel Pro + băng thông vượt gói | 60 |
| Quan trắc | Grafana Cloud free / self-host | 0 |
| **Tổng** | | **≈ 364** |

### Điều quan trọng nhất trong ba bảng trên

**Chi phí nạp và tính KHÔNG tăng theo số người dùng.** 600 coin × 10 khung tốn
y hệt nhau dù có 100 hay 10.000 người xem. Phần tăng theo người dùng chỉ là
Redis đọc + băng thông API.

Nghĩa là **đòn bẩy chi phí lớn nhất là tỉ lệ trúng cache CDN**, không phải chọn
máy to hơn. Với `s-maxage=60`, 10.000 người dùng chỉ tạo ra ~60 lần gọi hàm mỗi
phút cho mỗi endpoint — mức 3 hoàn toàn có thể rẻ hơn bảng trên nếu cache đặt
đúng. Ngược lại, để lọt một endpoint `no-store` là chi phí nhảy gấp mấy lần.

Ba khoản dễ vỡ ngân sách mà bảng trên **chưa** tính, nói trước:

* **Egress của DB** nếu đặt DB khác nhà cung cấp với worker → luôn đặt cùng vùng.
* **Timescale Cloud** đắt hơn Fly Postgres tự quản 2–3 lần, đổi lại có backup và
  vá lỗi tự động. Ở mức 3 nên đổi sang bản có quản lý; ở mức 1 thì không.
* **Lưu trade-level của spec 1** (~860 MB/ngày cho 600 coin trước nén) — nếu
  làm, chỉ giữ trade-level cho ~50 coin thanh khoản cao nhất, và profile đã gộp
  cho phần còn lại. Chi tiết ở `docs/TRADE-DATA-ARCHITECTURE.md` §2.4.

---

## 4. Kế hoạch di trú — web không được gián đoạn

Nguyên tắc: **mỗi giai đoạn tự nó chạy được và tự nó lùi được.** Không có giai
đoạn nào mà web phải chờ giai đoạn sau mới hoạt động lại.

| GĐ | làm gì | web đổi gì | lùi thế nào |
|---|---|---|---|
| **0** | Dựng worker + DB, chỉ NẠP và ĐO. Không endpoint nào. | không đổi gì | tắt worker |
| **1** | `/api/v2/*` đọc Redis. Web vẫn tự tính, nhưng gọi thêm v2 và **ghi log chênh lệch** (không hiển thị). | không đổi gì mắt thường thấy | bỏ lời gọi v2 |
| **2** | Sau 1 tuần log khớp: chuyển **bảng Biến động 24h** sang v2 (nặng nhất, lợi nhất). | 1 panel | cờ `USE_V2_MOVERS=0` |
| **3** | Chuyển chỉ báo trang coin (RSI/ATR/S&R). | 1 trang | cờ riêng |
| **4** | Chuyển Futures Radar + regime. | 1 panel | cờ riêng |
| **5** | Trade-level (spec 1) sau cờ, chỉ trang coin, chỉ ~50 coin. | 1 panel mới | cờ riêng |
| **6** | Gỡ đường tính ở client sau khi mỗi cờ đã bật 2 tuần không sự cố. | không đổi | git revert |

Mỗi cờ là một biến trong `legacy-static/env.js` (giá trị công khai, không phải
secret), đọc lúc chạy — đổi cờ không cần deploy lại.

**Giai đoạn 1 là giai đoạn quan trọng nhất và hay bị bỏ qua nhất.** Nó là lần
duy nhất ta có cả hai kết quả cùng lúc để so. Bỏ qua nó thì mọi sai lệch sau
này đều được phát hiện bởi người dùng.

---

## 5. Những gì tôi KHÔNG đề xuất, và vì sao

* **Kafka / message queue**: 172 bản tin/giây không cần. Thêm một thành phần
  nữa phải trông coi để giải quyết vấn đề chưa có.
* **Kubernetes**: hai tiến trình thì không cần điều phối viên.
* **ClickHouse**: nhanh hơn Timescale cho quét lớn, nhưng Timescale là Postgres
  — dùng lại được kiến thức, công cụ, và chính Supabase đang có.
* **Tự viết cache thay Redis**: mất khi khởi động lại, và không chia sẻ được
  giữa hai tiến trình.

---

## 6. Rủi ro cần biết trước khi duyệt

1. **Đây là bước từ trang tĩnh sang hệ thống có trạng thái.** Hiện giờ hỏng thì
   web vẫn tĩnh và vẫn hiện. Sau này worker chết là dữ liệu đứng — nên mục 2.7
   (quan trắc) không phải phần thêm cho đẹp, nó là điều kiện để đi tiếp.
2. **Chi phí là cam kết hàng tháng**, khác hẳn hiện tại (0 đồng).
3. **Tôi không kiểm chứng được giá và không kiểm chứng được thông lượng thật**
   từ môi trường này. Giai đoạn 0 tồn tại chính để thay mọi ước tính trong tài
   liệu này bằng số đo, trước khi tiêu tiền cho mức 2 hay mức 3.

**Chưa code gì. Chờ duyệt.**
