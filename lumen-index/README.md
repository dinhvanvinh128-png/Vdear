# LŪMEN // ÍNDEX — hero một màn hình

Dựng theo bản spec: React 18 + TypeScript + Vite + Tailwind, `lucide-react` cho
icon. Toàn trang là MỘT component, MỘT `<section>` phủ kín khung nhìn, không cuộn.

## Chạy bản nguồn

```bash
npm install
npm run dev
```

## Xem ngay không cần cài gì

Mở `preview.html` bằng trình duyệt.

Đây **không phải** bản nguồn — nguồn thật là `src/App.tsx`. Nó cùng cấu trúc và
cùng từng con số, nhưng viết bằng CSS thường thay cho class Tailwind, để xem
được mà không cần bước build. Tôi dùng nó để kiểm chứng hình học, vì môi trường
dựng repo này không cài được package nên không chạy được `vite`/`tsc`.

## Đã kiểm được những gì

Đo trên trình duyệt thật, ở ba khổ màn hình:

| Kiểm | 1440px | 900px | 420px |
| --- | --- | --- | --- |
| Gutter (nav / H1 / hàng dưới) | 35 · 35 · 35 | 35 · 35 · 35 | 20 · 20 · 20 |
| Ba mốc thẳng một đường dọc | ✓ | ✓ | ✓ |
| Chiều cao CTA | 40px | 40px | 36px |
| Node 3 ô vuông | hiện | hiện | ẩn |
| Thẻ info | hiện | hiện | ẩn |
| Nav links / dải ví | hiện | ẩn | ẩn |
| Trang không cuộn | ✓ | ✓ | ✓ |
| Dấu cộng đúng giao điểm | ✓ | ✓ | — |
| Đầu đường nối chạm góc ô vuông | ✓ | ✓ | — |
| Khoảng cách dải ví | 12·12·**32**·12 | — | — |

Và trên `src/App.tsx`: cân bằng ngoặc/thẻ JSX, 32 giá trị bracket đều nằm trong
bảng của spec (không có giá trị lạ), cùng 11 ràng buộc ở §15 (một `useState`
duy nhất, `rounded` xuất hiện đúng một lần, số nav có dấu chấm cuối, nhãn giữ
khoảng trắng trong ngoặc vuông, `&#10022;` là thực thể HTML chứ không phải icon
lucide, video có `muted` + `playsInline`, ô vuông không có transform căn giữa
còn dấu cộng thì có…).

## Ba chỗ lệch so với spec — đọc trước khi sửa

**1. Chiều cao nav dưới 1024px không phải 61/75px.**
§7 ghi nav cao `20+21+20 = 61px` (mobile) và `27+21+27 = 75px`, với 21px là
chiều cao của wordmark, "phần tử con cao nhất". Nhưng dưới `lg` nút hamburger
hiện ra và nó là hộp **40×40px** — cao hơn 21px. Nên chiều cao thật là **80px**
ở mobile và **94px** ở tablet. Đo được đúng như vậy.

Tôi giữ nguyên markup theo spec (hamburger 40×40, `py-5`/`py-[27px]`) vì §7 nói
rõ kích thước đó là có chủ đích ("comfortable tap target"). Chỗ sai là bảng
tính chiều cao, không phải bộ class. Không có hậu quả gì: `pt-24` (96px) của
menu vẫn vượt qua nav 80px.

Muốn đúng 61/75px thì phải cho hamburger thôi quyết định chiều cao — ví dụ
`absolute right-5 top-1/2 -translate-y-1/2`. Đó là thay đổi thiết kế, nên tôi
không tự ý làm.

**2. `ease-[...]` không được ghép chuỗi.** Tailwind quét mã bằng khớp chuỗi
thuần, nên `ease-[${EASE}]` sẽ không bao giờ sinh ra class và easing âm thầm
rơi về mặc định. Cả 7 chỗ đều viết nguyên văn `ease-[cubic-bezier(0.76,0,0.24,1)]`.
Đừng gom nó vào hằng số.

**3. `lucide-react` chỉ dùng 3 icon** (`Wallet`, `Menu`, `X`). Ngôi sao ✦ của
nút CTA là thực thể HTML `&#10022;` theo đúng §12, không phải icon lucide.

## Phụ thuộc mạng

- Video nền nạp từ CloudFront (URL cố định trong spec).
- Hai font nạp từ `db.onlinewebfonts.com` và Google Fonts.

Cả ba đều là **nguồn ngoài**. Hỏng cái nào thì phần đó mất: trang vẫn dựng, chỉ
là nền đen và font dự phòng `sans-serif`. Không có bước dựng nào phụ thuộc mạng.
