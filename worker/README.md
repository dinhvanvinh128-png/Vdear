# Worker nạp dữ liệu

Mục 1 của `docs/INFRA-SCALING.md`, viết thành mã chạy được.

## Vì sao không đặt trên Vercel

Hàm serverless của Vercel sống vài trăm mili giây rồi bị thu hồi. Một kết nối
WebSocket cần sống liên tục nhiều ngày. Hai thứ đó không tương thích, và không
có cách cấu hình nào làm chúng tương thích — nên worker phải chạy ở nơi có
tiến trình dài hạn: Railway, Fly.io, hoặc một máy chủ nhỏ bất kỳ.

## PHẦN NÀY CHƯA ĐƯỢC CHẠY THẬT

Mã trong thư mục này **chưa từng chạy trên hạ tầng thật**. Sandbox nơi nó được
viết chặn cả `fapi.binance.com` lẫn `fstream.binance.com`, và không có
Postgres nào để kết nối. Nó được viết theo đúng tài liệu API đã đối chiếu và
dùng chung các module thuần tính đã có bài kiểm (`legacy-static/js/tape.js`,
`js/incremental.js`), nhưng phần **nạp thật và ghi thật thì cần chạy một lần
với dữ liệu thật rồi mới tin được**.

Nói cách khác: đây là mã sẵn sàng để triển khai, không phải mã đã kiểm chứng
đầu-cuối. Đừng đọc nó như thứ đã chạy được.

## Cần gì để chạy

```bash
export DATABASE_URL="postgres://..."        # Postgres đã bật TimescaleDB
export SYMBOLS="BTCUSDT,ETHUSDT,SOLUSDT"    # danh sách cặp theo dõi

psql "$DATABASE_URL" -f ../sql/timescale.sql
node ingest.mjs
```

## Thứ tự khởi động

1. Nạp lược đồ (`sql/timescale.sql`) — chạy lại được, không hỏng nếu đã có.
2. Bù lịch sử nến 1 phút qua REST cho tới hiện tại.
3. Mở WebSocket, ghi nến và lệnh khớp theo thời gian thực.
4. Cứ mỗi phút ghi một dòng `metrics` để `/api/health` và mục 7 có cái đọc.

## Kiểm tra sức khoẻ

Worker mở một cổng HTTP nhỏ (mặc định 8080) trả `/healthz`. Railway và Fly.io
đều dùng đường dẫn này để tự khởi động lại tiến trình khi nó chết. Trả 503 khi
mất kết nối quá lâu — trả 200 mù quáng thì bộ giám sát sẽ không bao giờ khởi
động lại một tiến trình đã treo.
