# Tầng dữ liệu giao dịch (trade-level) — kiến trúc đề xuất

Nền cho CVD và Volume Profile. **Tài liệu này để duyệt, chưa code gì.**

Mọi con số lưu lượng dưới đây là **ước tính suy ra từ giới hạn công bố của
Binance và từ cấu trúc bản tin**, không phải số đo. Môi trường phát triển chặn
mọi host bên ngoài nên tôi không mở được stream thật để đếm. Mục 3 nói rõ cách
thay ước tính bằng số đo trong ngày đầu chạy — và đó là việc bắt buộc trước khi
chốt bất kỳ tham số nào.

---

## 1. Nguồn và ngữ nghĩa

Stream: `wss://fstream.binance.com/stream?streams=<sym>@aggTrade/...`

Bản tin (đã đối chiếu tài liệu chính thức):

```json
{"e":"aggTrade","E":1757000000000,"a":1234567890,"s":"BTCUSDT",
 "p":"63200.50","q":"0.015","f":9876543210,"l":9876543212,
 "T":1757000000000,"m":true}
```

* `m = true` → **buyer là maker** → taker là bên **BÁN** chủ động → `sellVolume`.
* `m = false` → taker là bên **MUA** chủ động → `buyVolume`.
* `p`, `q` là **chuỗi**, phải ép sang số (giống mọi endpoint Binance khác).
* aggTrade gộp các fill **cùng giá, cùng phía, trong 100 ms** thành một bản tin.
  Nghĩa là số bản tin **nhỏ hơn** số trade thật 2–4 lần trên cặp thanh khoản
  cao — chi tiết ở mục 3.

Giới hạn đã xác nhận: **1024 stream / kết nối**, và **10 bản tin gửi lên / giây**
(giới hạn này áp cho lệnh subscribe của client, không phải dữ liệu nhận về).

---

## 2. Cấu trúc dữ liệu

### 2.1 Bucket 1m là đơn vị gốc

Chỉ 1m được dựng từ trade. Mọi khung lớn hơn **tổng hợp từ 1m**, không dựng
song song — hai đường dựng độc lập chắc chắn sẽ lệch nhau và không ai biết
đường nào đúng.

```
Bucket1m {
  t          int32    mốc phút (epoch/60), không lưu ms cho từng bucket
  buyVol     float64  khối lượng taker mua  (base asset)
  sellVol    float64  khối lượng taker bán
  buyQuote   float64  giá trị taker mua     (quote, = Σ p·q)
  sellQuote  float64
  trades     int32    số bản tin aggTrade gộp vào
  vwapNum    float64  Σ(p·q) — để tính VWAP mà không giữ lại từng trade
  levels     PriceMap giá → khối lượng
}
delta      = buyVol − sellVol            (tính khi đọc, không lưu — tránh lệch)
totalVol   = buyVol + sellVol
```

`delta` và `totalVol` **không lưu**: chúng suy được từ hai trường kia. Lưu cả
ba là mở đường cho trạng thái mâu thuẫn khi backfill ghi đè một phần.

### 2.2 PriceMap và bước giá

Bước giá lấy từ `tickSize` của chính coin đó (`/fapi/v1/exchangeInfo` →
`filters[].filterType === 'PRICE_FILTER'`), **không đoán**:

```
step(sym, tf) = tickSize(sym) × 10^k
   với k nhỏ nhất sao cho  (dải giá của khung) / step  ≤  MAX_LEVELS
```

`MAX_LEVELS = 512` cho 1m, `1024` cho khung hiển thị. Nếu không lấy được
`tickSize` thì **không dựng profile cho coin đó** và ghi rõ lý do — chứ không
lấy bừa một bước giá, vì bước sai làm POC dịch chỗ mà nhìn vẫn hợp lý.

Lưu trữ: `Map<int32 bucketIndex, float64>` với
`bucketIndex = round((p − priceOrigin) / step)`. Số nguyên chứ không phải chuỗi
giá — khoá chuỗi làm map phình gấp 3–4 lần và so sánh chậm.

### 2.3 Gộp lên khung lớn

```
rollUp(buckets1m[], tfMinutes) → BucketTF[]
  buyVol/sellVol/quote/trades : cộng
  vwapNum                     : cộng
  levels                      : GỘP LẠI THEO BƯỚC GIÁ THÔ HƠN
```

Chỗ dễ sai nhất: gộp `levels` bằng cách hợp nhất nguyên vẹn các map 1m. Làm vậy
thì profile khung 4H của BTC có tới hàng chục nghìn mức giá — vừa tốn bộ nhớ
vừa vẽ ra một histogram răng cưa vô nghĩa. Phải **lượng tử hoá lại** về bước
giá của khung đó.

### 2.4 Trần bộ nhớ

Ước tính: một bucket 1m của BTC chạm khoảng 80–300 mức giá.
`Map` với 200 mục ≈ 200 × (8 B khoá + 8 B giá trị + ~24 B overhead V8) ≈ **8 KB**.
Cộng phần vô hướng ≈ 8.1 KB/bucket.

| giữ | 1 coin | 20 coin | 600 coin |
|---|---|---|---|
| 1440 bucket 1m (24 h) | ~11 MB | ~230 MB | ~7 GB |
| 240 bucket 1m (4 h) | ~2 MB | ~39 MB | ~1.2 GB |

Nên trần đặt như sau:

* **Trình duyệt**: giữ `N_1M = 240` bucket 1m (4 giờ) cho **coin đang mở** thôi,
  cộng các khung đã gộp (mỗi khung 500 bucket, `levels` lượng tử hoá) →
  **dưới 20 MB cho một coin**. Vượt thì cắt từ đầu chuỗi (FIFO).
* **Server** (khi có worker của spec 5): 1m giữ 24 h trong RAM, phần cũ hơn ghi
  xuống TimescaleDB dưới dạng đã gộp.

**Kết luận thẳng: 600 coin KHÔNG chạy được ở trình duyệt.** Không phải vì băng
thông (mục 3 cho thấy băng thông chịu được) mà vì bộ nhớ và vì mỗi tab lại mở
một bộ kết nối riêng. Phần 1 của spec chỉ hợp lý cho **coin đang xem** và tối đa
~20 coin theo dõi; muốn phủ 600 coin thì phải là worker server ở spec 5. Hai
spec gặp nhau đúng ở đây.

---

## 3. Ước tính lưu lượng WebSocket

### 3.1 Cách suy ra (không phải số đo)

**Cỡ bản tin.** Khung combined-stream đầy đủ, kể cả `{"stream":...,"data":{...}}`
và framing WebSocket: đếm ký tự bản tin mẫu ở mục 1 → 196 B; cộng wrapper và
framing → **lấy 220 B/bản tin**.

**Nhịp bản tin.** Không đo được từ đây, nên suy theo hai bước:

1. `/fapi/v1/ticker/24hr` trả trường `count` = **số trade thật trong 24 h** cho
   từng symbol. Đây là số CHÍNH XÁC và lấy được bằng một request.
2. aggTrade gộp fill cùng giá/cùng phía trong 100 ms. Tỉ lệ gộp phụ thuộc độ
   dày sổ lệnh; trên cặp thanh khoản cao thường **2–4×**, trên cặp mỏng gần
   **1×** (mỗi trade một bản tin).

Bảng dưới dùng nhịp giả định theo bậc thanh khoản, **cận trên** của khoảng:

| bậc | coin | aggTrade/giây (trung bình) |
|---|---|---|
| A | BTC, ETH | 10 |
| B | hạng 3–20 | 3 |
| C | hạng 21–100 | 0.6 |
| D | hạng 101–600 | 0.1 |

### 3.2 Kết quả

| số coin | bản tin/giây | băng thông | mỗi ngày | đỉnh (×8) |
|---|---|---|---|---|
| **20** | 2×10 + 18×3 = **74** | 16 KB/s | **1.4 GB** | 130 KB/s |
| **100** | + 80×0.6 = **122** | 27 KB/s | **2.3 GB** | 215 KB/s |
| **600** | + 500×0.1 = **172** | 38 KB/s | **3.3 GB** | 300 KB/s |

Hệ số đỉnh ×8 là lúc cả thị trường động cùng lúc (tin FOMC, một cú quét thanh
lý). Đó mới là lúc hệ thống phải sống, nên mọi hàng đợi phải kê theo cột đỉnh
chứ không theo cột trung bình.

**Đọc bảng này cho đúng:** băng thông KHÔNG phải nút thắt — 38 KB/s là nhỏ.
Nút thắt là **CPU parse JSON** (172 lần `JSON.parse` mỗi giây, đỉnh 1.400) và
**bộ nhớ** ở mục 2.4. Đó là lý do parse phải nằm trong Web Worker.

### 3.3 Số kết nối

1024 stream/kết nối là đủ cho 600 coin trên một socket, nhưng **không nên**:
một socket đứt là mất trắng, và Binance có thể ngắt kết nối theo chu kỳ 24 h.

Chia **100 stream/kết nối** → 6 kết nối cho 600 coin, 1 cho 20 coin. Mỗi kết
nối reconnect độc lập, và mất một shard chỉ mất 1/6 dữ liệu trong lúc nối lại.

### 3.4 Việc bắt buộc trong ngày đầu chạy

Ước tính trên phải bị **thay bằng số đo**, không phải để đó:

* worker đếm `msgCount`, `byteCount`, `parseMs` theo từng symbol, xuất mỗi phút;
* sau 1 giờ, so với bảng 3.2 và ghi lại chênh lệch vào chính tài liệu này;
* `N_1M` và số shard chỉ được chốt SAU khi có số đo.

Cách đo nhanh, không cần worker (chạy trên máy có mạng):

```bash
websocat 'wss://fstream.binance.com/stream?streams=btcusdt@aggTrade' \
  | pv -l -r > /dev/null      # bản tin/giây
```

---

## 4. Mất kết nối và backfill

### 4.1 Reconnect

Exponential backoff có jitter: `min(30s, 0.5s × 2^n) × (0.5 + random)`.
Không jitter thì 6 shard cùng đứt sẽ cùng nối lại một lúc và tự tạo ra một cú
dồn request.

### 4.2 Backfill

REST `GET /fapi/v1/aggTrades?symbol=&startTime=&endTime=&limit=1000`.

* Mốc bắt đầu = `T` của bản tin cuối nhận được **trừ 1 giây** (chồng lấn có chủ
  ý), mốc kết thúc = lúc nối lại được.
* **Chống trùng bằng `a` (aggTradeId), không bằng thời gian.** Hai trade cùng
  mili-giây là chuyện bình thường; lọc theo thời gian sẽ vừa sót vừa đếm hai lần.
  Mỗi symbol giữ `lastAggId`; bản tin có `a <= lastAggId` thì bỏ.
* Khoảng trống dài quá `MAX_BACKFILL = 15 phút` thì **không backfill**: đánh dấu
  các bucket trong khoảng đó là `partial: true`, và CVD/Profile vẽ đứt đoạn ở
  đó kèm nhãn "thiếu dữ liệu". Vá một khoảng trống 3 giờ bằng 200 request là
  vừa tốn hạn mức vừa cho ra một đường CVD trông liền mạch mà thật ra là ghép.
* Cờ `partial` đi theo dữ liệu tới tận giao diện (đúng nguyên tắc "provenance
  travels with the data" ở `ARCHITECTURE.md`).

---

## 5. Web Worker và luồng dữ liệu

```
   WS ──► worker-trades.js ──► bucket 1m ──► rollUp ──► postMessage(delta only)
                    │                                        │
                    └── backfill REST                        ▼
                                                    UI vẽ (main thread)
```

* Worker giữ **toàn bộ** trạng thái. Main thread chỉ nhận **bản vá**, không
  nhận cả mảng: gửi 240 bucket × 8 KB mỗi giây qua `postMessage` là tự tay làm
  giật đúng thứ đang cố tránh.
* Bản vá: `{ type:'bucket', t, buyVol, sellVol, levelsDiff }` — chỉ mức giá có
  thay đổi.
* Profile và phân kỳ CVD tính **trong worker**, main thread chỉ nhận kết quả
  (mảng cột histogram, danh sách điểm phân kỳ).
* Worker **ngủ** khi tab ẩn (`visibilitychange` → main gửi `pause`), theo đúng
  bài học ở `AGENTS.md` §5.

Không thêm thư viện: worker là một file `.js` thuần, nạp bằng
`new Worker('js/worker-trades.js')`.

---

## 6. Phân kỳ CVD — thuật toán

Không so hai điểm cuối. Dùng pivot với lookback `N` (mặc định 5):

```
pivotLow(i)  ⇔  low[i]  < low[j]  ∀ j ∈ [i−N, i+N], j ≠ i
pivotHigh(i) ⇔  high[i] > high[j] ∀ j ∈ [i−N, i+N], j ≠ i
```

Một pivot chỉ **xác nhận sau N nến** — nghĩa là phân kỳ mới nhất luôn trễ N nến.
Phải nói rõ điều đó trên giao diện, không được vẽ như thể biết ngay lúc đó.

Phân kỳ tăng: hai pivotLow liên tiếp `p1 < p2` (theo thời gian) với
`price[p2].low < price[p1].low` **và** `cvd[p2] > cvd[p1]`.
Phân kỳ giảm: đối xứng với pivotHigh.

Chốt chặn để không rải nhãn khắp chart:

* hai pivot cách nhau `≥ 5` và `≤ 60` nến;
* chênh lệch giá `≥ 0.3 × ATR` (nếu không, "đáy thấp hơn" chỉ là nhiễu);
* mỗi hướng giữ tối đa 3 phân kỳ gần nhất.

---

## 7. Volume Profile — định nghĩa

* **POC** = mức giá có `volume` lớn nhất trong khoảng đang xét.
* **Value Area 70%**: bắt đầu từ POC, mỗi bước so tổng volume của **hai mức
  trên** với **hai mức dưới**, nhận nhóm lớn hơn, dừng khi đạt ≥ 70% tổng
  volume. VAH/VAL là biên trên/dưới của tập đã nhận. (Đây là thuật toán
  Market Profile chuẩn; ghi ra đây để sau này không ai đổi thầm cách tính.)
* **LVN** = mức có `volume < 0.30 × volume(POC)` và nằm giữa hai vùng có volume
  cao hơn (đáy cục bộ), không phải mọi mức thấp.
* **Session profile** cắt theo ngày UTC; **Visible Range** theo đúng cửa sổ
  `viewStart/viewCount` của chart.

---

## 8. Tích hợp vào confluence (phần 4 của spec)

Điểm confluence hiện là **số điều kiện cùng xác nhận, thang /5**
(`js/indicators.js` → `combatSignal`). Thêm volume profile vào đó phải giữ
nguyên thang, nếu không mọi con số lịch sử trong nhật ký lệnh đổi nghĩa.

Đề xuất: **không cộng thêm điều kiện thứ 6**, mà thêm một **hệ số tin cậy
riêng** đi kèm, hiển thị tách bạch:

```
vùng S&R trùng POC / VAH / VAL (trong ±0.25 × ATR)  →  confidence +1 bậc
vùng nằm trong LVN                                   →  confidence −1 bậc
```

và câu giải thích tiếng Việt nói thẳng lý do, ví dụ:
*"Vùng hỗ trợ 59.754 trùng POC của phiên — đây là nơi khối lượng đã đọng lại
nhiều nhất, giá thường phản ứng ở đó."* / *"Vùng này nằm trong LVN — giá từng
đi xuyên rất nhanh qua đây, đặt SL sát mức này dễ bị quét."*

Lý do tách ra: confluence đang là **đếm**, còn cái này là **đánh giá chất
lượng**. Trộn hai loại vào một con số là đúng thứ `AGENTS.md` §2 cấm.

---

## 9. Thứ tự làm và điểm dừng

| bước | nội dung | dừng để xem |
|---|---|---|
| 1 | `worker-trades.js`: WS + bucket 1m + rollUp + trần bộ nhớ, kèm test | ✓ |
| 2 | Đo lưu lượng thật, cập nhật mục 3 | ✓ |
| 3 | CVD + sub-chart dưới RSI, đồng bộ zoom/pan | ✓ |
| 4 | Phân kỳ pivot + nhãn trên chart | ✓ |
| 5 | Volume Profile + POC/VA/LVN + bật tắt Session/Visible | ✓ |
| 6 | Tích hợp confluence + câu giải thích | ✓ |

**Chưa code bước nào. Chờ duyệt.**
