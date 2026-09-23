# Lặp Lại & Tự Điền

Công cụ độc lập (một file HTML, không cần cài gì, không gửi dữ liệu đi đâu) để
tự điền form trên bất kỳ trang web nào và lặp lại nhiều lần.

Mở `tools/autofill/index.html` bằng Chrome / Edge / Firefox trên PC.

- **Các ô cần điền**: mỗi dòng `khoá = giá trị`. Khoá khớp với tên / id / nhãn /
  placeholder của ô (không phân biệt hoa thường, dấu), hoặc `css:<selector>`.
- **Biến**: `{i}` lượt hiện tại, `{n}` tổng lượt, `{date}`, `{time}`, `{Tên cột}`.
- **Lặp N lần** hoặc **Theo danh sách** (dán từ Excel / Google Sheets / CSV).
- **Nút gửi** (chữ trên nút hoặc `css:`): có thì tự điền → gửi → nghỉ → lượt
  tiếp; trống thì mỗi lần bấm dấu trang điền một lượt.
- Trang tải lại sau khi gửi → bấm dấu trang lần nữa, nó chạy tiếp chỗ dở.
- **Quét form**: dấu trang thứ hai, liệt kê mọi ô trên trang và chép sẵn các
  dòng `khoá = giá trị`.

Hỗ trợ input, textarea, select, checkbox, radio, ô `contenteditable` và form
React (đặt giá trị qua setter gốc + phát sự kiện `input`/`change`).
Dữ liệu nằm trong `localStorage` của trình duyệt; dùng Xuất / Nhập JSON để sao lưu.
