# Marketeam — landing page

Hero một màn hình: header, cột nội dung trái với hiệu ứng gõ chữ, vòng tròn
quỹ đạo bên phải, dải logo đối tác chạy ở dưới. React + Vite, **không dùng thư
viện animation nào** — chỉ CSS animation cộng JS cho phần gõ chữ và đếm số.

## Chạy

```bash
npm install
npm run dev      # máy phát triển
npm run build    # dựng bản phát hành vào dist/
npm run preview  # xem thử bản đã dựng
```

## Xem nhanh không cần cài

Mở `preview.html` bằng trình duyệt (hoặc phục vụ qua một server tĩnh bất kỳ).
Tệp đó dựng **đúng cây DOM và đúng `src/styles.css`** mà `src/App.jsx` sinh ra,
nhưng bằng JS thuần — dùng để xem ngay khi chưa cài `node_modules`. Nó là công
cụ kiểm tra, không phải mã sản phẩm; sửa giao diện thì sửa `src/`.

## Cấu trúc

```
index.html          nạp font Inter + Urbanist, gắn #root
src/main.jsx        điểm vào React
src/App.jsx         toàn bộ trang: dữ liệu quỹ đạo/avatar/logo + component
src/styles.css      toàn bộ style, animation và 4 ngưỡng responsive
preview.html        bản xem trước không cần build
```

## Ba chỗ dễ sai đã xử lý

**1. Mốc 67 ký tự đổi màu tiêu đề chỉ đúng với EM DASH.**
Câu dùng `—` thì 67 ký tự đầu kết thúc gọn ở `…Was Out of Reach — Now Just`,
phần trắng còn lại là ` One Click Away!`. Nếu viết bằng hai dấu trừ `--` thì
câu dài thêm một ký tự và mốc 67 cắt ngang chữ `Just` thành `Jus|t`.

**2. Keyframes đặt `transform` sẽ GHI ĐÈ cả phép căn giữa.**
Lõi `20k+` được căn giữa bằng `translate(-50%,-50%)`. Dùng chung keyframes
`rotate()` với quỹ đạo thì transform bị thay hẳn, lõi vừa lệch chỗ vừa nghiêng
theo vòng quay. Nên lõi có `core-cw` / `core-ccw` riêng, mang theo cả phép
tịnh tiến.

**3. Viết tắt `animation:` xoá mất `animation-name` do lớp khác cấp.**
Tên animation đến từ `.spin-left` / `.spin-right`, còn thời lượng đặt ở lớp
phần tử. Viết `animation: var(--duration) linear infinite` ở quy tắc nằm SAU
`.spin-*` sẽ đặt lại `animation-name: none`. Đo được: `.avatar-inner` có
`animation-name: none`, không quay ngược, nên avatar nghiêng theo quỹ đạo —
hộp bao 58px phình thành 82px (đúng hệ số √2 của hình vuông xoay 45°). Các lớp
này vì thế dùng longhand `animation-duration/-timing-function/-iteration-count`
để không phụ thuộc thứ tự khai báo.

## Trợ năng

- Tiêu đề có bản đầy đủ trong `.sr-only`, phần gõ dần để `aria-hidden` — trình
  đọc màn hình đọc trọn câu, không đọc từng ký tự.
- Ảnh trang trí (avatar, logo đối tác) để `alt=""`; khối vòng tròn
  `aria-hidden`.
- `prefers-reduced-motion: reduce` tắt mọi vòng quay, dải trôi và nhấp nháy;
  phần gõ chữ và đếm số nhảy thẳng tới kết quả.
- Link và nút đều có `:focus-visible`.

## Đã kiểm những gì

Bằng Chrome headless trên `preview.html`:

- Cấu trúc: 4 nav, 4 quỹ đạo, 9 avatar, 20 logo (5×4), 2 nút viền xoay.
- Gõ chữ: chạy dần từ 1 ký tự, kết thúc đúng 67/16 ký tự, cắt đúng ranh giới
  từ, con trỏ tắt khi xong, `.sr-only` đủ 83 ký tự.
- Đếm số về đúng `20k+`.
- Avatar đúng bán kính khai báo (lệch 0px) và giữ phương đứng (hộp bao không
  đổi qua thời gian).
- Lõi `20k+` đứng yên tuyệt đối (hộp chữ dao động 0px) và đúng tâm.
- Chữ trên nút nằm trên lớp `::after` (không bị lớp hover phủ).
- Bốn ngưỡng 1280 / 1024 / 768 / 480: cỡ chữ, hướng bố cục, tỉ lệ vòng tròn,
  ẩn/hiện nav đều đúng; không trang nào tràn ngang.

## CHƯA kiểm được ở môi trường này

- **`npm install` / `npm run build`**: registry npm bị chặn nên không cài được
  `node_modules`; chưa chạy được Vite lần nào. `src/App.jsx` chưa qua trình
  biên dịch JSX.
- **Ảnh và font**: mọi CDN đều bị chặn, nên ảnh nền, avatar, logo đối tác và
  hai font Google đều KHÔNG tải được khi tôi chụp màn hình. Bố cục, hiệu ứng và
  hình học đã kiểm; còn hình ảnh hiển thị ra sao thì phải xem trên máy có mạng.
