# Bảo mật — Vdearypto

Tài liệu này ghi **cái gì đang được bảo vệ**, **bảo vệ bằng cách nào**, và
**cái gì trình duyệt không bảo vệ được**. Không tô hồng: phần lớn giá trị nằm
ở phía máy chủ, lớp trình duyệt chỉ là rào cản.

## 1. Kiến trúc đang chạy

| Thành phần | Thực tế |
|---|---|
| Trang web | Tĩnh, thư mục `legacy-static/` (Vercel `outputDirectory`) |
| Hàm máy chủ | `api/etf-flow.js` — **route duy nhất đang deploy** |
| Ứng dụng Next.js | `app/`, `lib/`, `components/` — **có trong repo nhưng KHÔNG deploy** |
| Đăng nhập | Clerk (tuỳ chọn, bật bằng biến môi trường) |
| Cơ sở dữ liệu | Supabase, client dùng khoá công khai, chặn bằng RLS |

Vì Vercel phục vụ `legacy-static`, 39 route trong `app/api/**` hiện **không
có mặt trên Internet**. Chúng vẫn được vá trong đợt này để lúc bật lên là an
toàn sẵn.

## 2. Bí mật để ở đâu

Không có secret nào trong mã nguồn. Đã quét cả cây làm việc lẫn **lịch sử
git**: chỉ có tên biến và ô trống, không có giá trị.

- `legacy-static/env.js` chỉ chứa **khoá công khai**: Supabase publishable,
  Clerk publishable, PostHog project key, Sentry DSN. Đây là loại khoá thiết
  kế để lộ ra trình duyệt.
- Secret (`SOSOVALUE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`…)
  chỉ đọc bằng `process.env` trong hàm máy chủ.
- `.gitignore` đã loại `.env`, `.env.local`, `.env*.local`.

> **Vì Supabase anon key là công khai, RLS là thứ DUY NHẤT chặn người lạ đọc
> dữ liệu người dùng.** Xem mục 6.

## 3. Security headers (`vercel.json`)

`Content-Security-Policy` (danh sách nguồn đóng, script nội tuyến dùng **băm
sha256** thay vì `'unsafe-inline'`), `Strict-Transport-Security` (2 năm,
preload), `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`
+ `frame-ancestors 'none'`, `Permissions-Policy` (tắt camera/micro/vị
trí/thanh toán/`display-capture`), `Cross-Origin-Opener-Policy`,
`Cross-Origin-Resource-Policy`, `X-Permitted-Cross-Domain-Policies`.

CSP đã kiểm bằng trình duyệt thật trên cả 9 trang, có ép gọi ra ngoài (4 sàn,
CoinGecko, Google Fonts, PostHog, Sentry, esm.sh, jsDelivr, TradingView):
**0 vi phạm**.

## 4. Hàm `api/etf-flow.js`

Chỉ nhận `GET`/`HEAD` (khác → 405 kèm `Allow`); query dài quá 256 ký tự → 414;
giới hạn 60 lượt/phút theo IP (429 + `Retry-After`, `no-store`); `?diag=1`
phải bật bằng `ETF_DIAG=1`, mặc định tắt; không đặt `Access-Control-Allow-Origin`
nên trang khác không gọi chéo được; khoá không bao giờ ra body hay header.

**Giới hạn thật:** bộ đếm nằm trong bộ nhớ của một instance serverless đang ấm,
nên nó chặn quét dồn từ một máy chứ **không phải** rate limit toàn cục. Muốn
chặt hơn thì dùng WAF của Vercel hoặc bộ đếm dùng chung (Upstash/Redis).

## 5. Route Next.js

`lib/api/guard.ts` sẵn có: kiểm tham số bằng zod, giới hạn 120 lượt/phút,
`assertCronAuthorized` (bearer `CRON_SECRET`) cho 4 route cron, và
`redactSecrets` khi trả lỗi.

Đợt này thêm `rateLimitResponse()` — bản **không ném lỗi** — và áp cho 17 route
công khai trước đây chưa có. Dùng `checkRateLimit` thẳng vào các route đó sẽ
thành 500 thay vì 429 vì chúng không bọc trong `handle()`.

## 6. Việc CHỈ BẠN làm được (tôi không có quyền truy cập)

1. **Kiểm RLS trên Supabase.** Anon key là công khai nên RLS là lớp chặn duy
   nhất. Vào SQL editor chạy:
   ```sql
   select schemaname, tablename, rowsecurity
     from pg_tables where schemaname = 'public';
   select tablename, policyname, cmd, qual
     from pg_policies where schemaname = 'public';
   ```
   Mọi bảng chứa dữ liệu người dùng (ít nhất `watchlist`) phải có
   `rowsecurity = true` và policy giới hạn theo `auth.jwt() ->> 'sub'`.
   **Tôi không kiểm được điều này từ đây — đừng coi là đã xong.**
2. **Thu hồi khoá SoSoValue cũ** đã dán trong chat và đặt khoá mới vào Vercel
   Environment Variables.
3. **`npm ci && npm run build && npm run typecheck && npm run lint`** trên máy
   có mạng: sandbox này không cài được `node_modules` nên tôi chưa chạy được.
4. **`npm audit`** để soát lỗ hổng phụ thuộc — cũng cần registry.
5. Trỏ **Production Branch** của Vercel sang nhánh đang phát triển.

## 7. Trình duyệt KHÔNG bảo vệ được

Nói thẳng, không vòng vo:

- **Không chặn được ảnh chụp màn hình.** Điện thoại chụp màn hình, công cụ hệ
  điều hành, phần mềm quay màn hình, máy ảnh ngoài — không có API web nào ngăn
  được. Watermark là để *truy nguồn*, không phải để *ngăn*.
- **Tắt JavaScript là mọi thứ chống copy biến mất.** HTML vẫn còn nguyên.
- **"View Source" từ menu trình duyệt** không sinh sự kiện bàn phím nên không
  chặn được; chỉ chặn được `Ctrl+U`.
- **DevTools mở ra cửa sổ riêng** thì phép dò theo kích thước không thấy. Chỉ
  bắt được khi DevTools gắn trong cửa sổ.
- **Gọi thẳng API** bằng `curl` bỏ qua toàn bộ lớp trình duyệt. Đó là lý do
  giới hạn nhịp gọi và giấu khoá ở máy chủ mới là phần quan trọng.
- Dữ liệu thị trường trên trang vốn là **dữ liệu công khai** từ các sàn. Thứ
  thật sự thuộc về Vdearypto là *cách chấm điểm và kế hoạch lệnh* — đó mới là
  phần được đánh dấu `data-sensitive` và đóng watermark.
