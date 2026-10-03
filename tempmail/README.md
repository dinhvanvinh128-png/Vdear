# Hộp Thư Tạm

Web hộp thư tạm thời chạy trên **API công khai của mail.tm** (https://docs.mail.tm).
Trang tĩnh, không có bước build, không cần API key. Dự án này độc lập với Vdearypto
và web gia phả trong cùng repo.

## Tính năng
- Tự tạo địa chỉ ngẫu nhiên khi mở trang, hoặc tự đặt tên và chọn tên miền
- Tự kiểm tra thư mới mỗi 10 giây khi tab đang mở, tạm dừng khi tab ẩn
- Số thư chưa đọc hiện trên tiêu đề tab
- Đọc thư HTML trong iframe sandbox: script trong thư không chạy, ảnh từ xa
  (ảnh theo dõi) bị chặn cho tới khi bấm "Hiện ảnh"
- Tải tệp đính kèm, xoá thư
- Nhớ hộp thư trong trình duyệt (localStorage); JWT hết hạn thì tự đăng nhập lại
- "Địa chỉ mới" sẽ xoá hẳn hộp thư cũ ở mail.tm

## Triển khai lên Vercel
Tạo một project Vercel **mới** từ repo này, đặt **Root Directory = `tempmail`**.
`tempmail/vercel.json` đã có sẵn cấu hình và CSP. Đừng sửa `vercel.json` ở gốc repo,
vì file đó thuộc về Vdearypto.

Chạy thử trên máy: `cd tempmail && python3 -m http.server 8000` rồi mở http://localhost:8000
(phải chạy qua HTTP vì trang dùng ES module, mở thẳng file sẽ không chạy).

## Nếu mail.tm đổi địa chỉ API
Sửa `API_BASE` trong `js/config.js` **và** `connect-src` trong `vercel.json`.
Khi API trả về cấu trúc lạ, thông báo lỗi trên trang sẽ ghi rõ URL đã gọi và
các khoá JSON nhận được.

## Giới hạn
- mail.tm cho tối đa 8 yêu cầu/giây mỗi IP. Mỗi người dùng gọi từ IP riêng của họ.
- mail.tm tự xoá thư sau một thời gian. Không dùng cho tài khoản quan trọng:
  mật khẩu hộp thư nằm trong localStorage của trình duyệt.

## Test
    cd tempmail && npm test     # node --test, không cần cài gì
