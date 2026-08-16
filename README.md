# Vdear — Crypto Intelligence Terminal

Bảng điều khiển crypto chuyên nghiệp (cảm hứng giao diện Nansen), chạy hoàn toàn
**tĩnh** (HTML/CSS/JS thuần) — không cần backend, deploy thẳng lên **Vercel Drop**
hoặc bất kỳ static host nào. **Không nhúng widget TradingView**, mọi biểu đồ được
vẽ bằng canvas tự viết nên **không bị màn hình đen** khi deploy.

## ✨ Tính năng

> **Chế độ FUTURES**: dữ liệu lấy từ hợp đồng vĩnh cửu (USDⓈ-M perpetual) của
> Binance/Bybit/OKX/Bitget, quét **TOÀN BỘ coin futures** (không giới hạn top 50).
> Có **funding rate**: hiển thị ở bảng biến động, trang coin, và ước tính **chi phí
> funding** cho lệnh trong panel chiến lược.

### Trang thị trường (`index.html`)
- **Thanh ticker 50px**: nền đen, coin chạy ngang liên tục, logo + giá + %
  tăng/giảm màu xanh/đỏ, tốc độ ổn định, dừng khi rê chuột. Không có nút/link TradingView.
- **Thang tâm lý thị trường 0–100** báo nên LONG hay SHORT.
- **Tín hiệu thực chiến · toàn bộ Futures · khung 4H** — mô phỏng theo chiến lược
  backtest confluence: **RSI H4 đảo chiều** (quá mua/bán rồi quay đầu) xác định hướng,
  xác nhận thêm bằng **hỗ trợ/kháng cự** và **Price Action**. Mỗi thẻ có 3 chấm xác
  nhận `RSI · S&R · PA`; coin đạt **hội tụ ✓** được ưu tiên lên đầu. Nút **Xem thêm**
  mở rộng (mặc định 12, tối đa ~30 tín hiệu).
- **Phân loại mảng coin (sector)**: Layer 1/2, DeFi, Meme, AI, Gaming, CEX, Payments, RWA, Privacy…
- **Bảng biến động 24h**: sắp xếp theo +% / −% / Volume, kèm **icon volume** (🔥 rất cao,
  💧 cao, 📊 khá) cho ~15 coin.
- **TradFi**: XAU (vàng), XAG (bạc), CL (dầu WTI), BZ (dầu Brent).

### Trang phân tích coin (`coin.html?c=BTC`)
- **Biểu đồ nến** + EMA20/EMA50 + **sub-chart RSI** với dải quá mua/quá bán.
- **Chú thích RSI nhấn mạnh**:
  - 🔴 RSI 70–80: quá mua → chú ý đảo chiều giảm (nên **SHORT**)
  - 🔴 RSI > 80: quá mua mạnh hơn
  - 🟢 RSI 20–30: quá bán → chú ý đảo chiều tăng (nên **LONG**)
  - 🟢 RSI < 20: quá bán mạnh hơn
- **Thang đo 0–100** đánh giá nên LONG/SHORT cho khung đang chọn + win-rate ước lượng.
- **Đa khung thời gian**: 5m, 15m, 30m, 1h, 2h, 4h, 10h, 12h, 1 ngày, 1 tuần, 1 tháng.
  Khung có khả năng **đảo chiều cao nhất** được đánh ⭐ và xếp lên đầu.
- **Vùng hỗ trợ / kháng cự**: mỗi vùng có **dải giá đảo chiều mạnh**, nhãn
  **LONG (khung xanh)** / **SHORT (đỏ)**, và **đánh giá 1–5 ★** độ an toàn vào lệnh.
  **Bấm vào một vùng** để highlight ngay trên chart.
- **Chiến lược thực chiến (⚔️)**: bảng hội tụ đa khung (RSI + S&R + Price Action) và
  **kế hoạch vào lệnh DCA** — Entry, TP +100% margin, mốc DCA −50%, giá TB sau DCA,
  TP/SL sau DCA — đồng thời **vẽ các mức này lên chart**.
- **Giá đa sàn (futures)**: Binance · Bybit · OKX · Bitget.

## 🔌 Nguồn dữ liệu (REST công khai, gọi trực tiếp từ trình duyệt)
- **Binance** — ticker 24h + klines (nến): nguồn chính cho biểu đồ và quét.
- **Bybit / OKX / Bitget** — giá tham chiếu để so sánh đa sàn.
- **Logo coin** — bộ icon `cryptocurrency-icons`, tự động fallback sang avatar chữ.
- **TradFi** — XAU/XAG lấy realtime khi khả dụng; CL/BZ hiển thị chỉ báo tham khảo
  (gắn nhãn `~`) khi nguồn realtime bị giới hạn CORS.

> ⚠️ Tất cả chỉ mang tính tham khảo, **không phải lời khuyên đầu tư**.

## 🚀 Chạy & Deploy
```bash
# Chạy thử cục bộ (bất kỳ static server nào)
python3 -m http.server 8080
# rồi mở http://localhost:8080
```
**Vercel Drop**: kéo–thả cả thư mục này (hoặc file zip) vào https://vercel.com/new —
không cần cấu hình build. `vercel.json` đã bật `cleanUrls`.

## 📁 Cấu trúc
```
index.html          # Dashboard thị trường
coin.html           # Trang phân tích 1 coin
css/styles.css      # Theme tối chuyên nghiệp
js/config.js        # Cấu hình sàn, sector, khung giờ, ngưỡng RSI
js/api.js           # Gom dữ liệu 4 sàn, klines, logo, tradfi
js/indicators.js    # RSI, EMA, hỗ trợ/kháng cự, chấm điểm tín hiệu
js/chart.js         # Engine vẽ nến + RSI bằng canvas
js/ticker.js        # Thanh ticker 50px
js/dashboard.js     # Logic trang thị trường
js/coin.js          # Logic trang coin
vercel.json         # Cấu hình static host
```
