# Hộp Thư Tạm

Web hộp thư tạm thời chạy trên **API công khai của mail.tm** (https://docs.mail.tm).
Trang tĩnh + một hàm proxy (`api/mailtm.js`, Vercel Edge), không có bước build,
không cần API key. Dự án này độc lập với Vdearypto
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

## Dự phòng nhiều lớp
- Đường gọi: proxy `/api/mailtm` trước; proxy hỏng (5xx, 404, mất mạng) thì trình duyệt gọi thẳng.
- Nhà cung cấp: khi tạo hộp thư, mail.tm không với tới được thì dùng **mail.gw** (cùng kiểu API).
  Hộp thư tạo ở đâu thì luôn đọc thư ở đó.
- Lỗi luôn ghi rõ từng nơi đã thử và lý do.

## Chẩn đoán
Mở `https://<tên-miền>/api/mailtm?diag=1`: máy chủ Vercel gọi thử `/domains` của mail.tm và
mail.gw rồi in ra mã HTTP, thời gian và vài chữ đầu của phản hồi.

## Vì sao có proxy
Gọi thẳng `api.mail.tm` từ trình duyệt từng báo `Failed to fetch` (CORS, trình chặn
quảng cáo hoặc nhà mạng). Nên trình duyệt gọi `/api/mailtm?path=/messages` cùng tên
miền, hàm `api/mailtm.js` (Node.js runtime) gọi tiếp mail.tm. Hàm chỉ chuyển tiếp các đường dẫn mail.tm
mà web dùng (không phải proxy mở) và không lưu gì.

Lưu ý: giới hạn 8 yêu cầu/giây của mail.tm giờ tính theo IP máy chủ Vercel.

## Nếu mail.tm đổi địa chỉ API
Đặt biến môi trường `MAILTM_UPSTREAM` trên Vercel. Muốn bỏ proxy và gọi thẳng, xem
chú thích trong `js/config.js`.
Khi API trả về cấu trúc lạ, thông báo lỗi trên trang sẽ ghi rõ URL đã gọi và
các khoá JSON nhận được.

## Giới hạn
- mail.tm tự xoá thư sau một thời gian. Không dùng cho tài khoản quan trọng:
  mật khẩu hộp thư nằm trong localStorage của trình duyệt.

## Test
    cd tempmail && npm test     # node --test, không cần cài gì
