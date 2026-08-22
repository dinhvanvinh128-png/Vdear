# Vdear — Bảng thông tin cần điền (bạn điền, mình lo phần còn lại)

> Điền vào các ô `______`. Khoá/secret thì điền trong file **`.env.example`**
> (đổi tên thành `.env.local`). File này chứa phần **quyết định thương hiệu, DNS,
> giá, nội dung** — những thứ code không tự nghĩ ra được.

---

## A. Thương hiệu & liên hệ
- Tên sản phẩm: `Vdear` (đổi nếu muốn: `______`)
- Slogan (1 câu ngắn): `______`  (vd: "Quét tín hiệu futures theo RSI + S&R đa khung")
- Domain đã mua ở Namecheap: `______`  (vd `vdear.io`)
- Email hỗ trợ: `support@______`
- Email gửi hệ thống: `no-reply@______`
- Ngôn ngữ chính: `Tiếng Việt` / khác: `______`
- Mạng xã hội (nếu có): X/Twitter `______` · Telegram `______` · Discord `______`

## B. Pháp lý (bắt buộc với web tài chính/crypto)
- Tên cá nhân/công ty đứng tên: `______`
- Quốc gia/địa chỉ (cho Terms & hoá đơn Stripe): `______`
- Bạn muốn mình soạn sẵn các trang: Terms / Privacy / Refund / Disclaimer rủi ro?  (Có / Không): `______`
  > Mình sẽ soạn bản mẫu chuẩn; bạn nên nhờ luật sư rà lại trước khi mở bán.

## C. Gói giá (Stripe) — điền để mình tạo sản phẩm & phân quyền
| Gói | Giá/tháng | Giá/năm | Quyền lợi |
|-----|-----------|---------|-----------|
| Free | 0 | 0 | `______` (vd: xem 4 tín hiệu, khung 4H, watchlist 10 coin) |
| Pro  | `______` | `______` | `______` (vd: toàn bộ tín hiệu, alert realtime, RSI đa khung, không QC) |
| Team (tuỳ chọn) | `______` | `______` | `______` |
- Đơn vị tiền: `USD` / `VND` / khác: `______`
- Có dùng bản dùng thử (trial) mấy ngày? `______`

## D. DNS — sau khi mua domain, làm trên Cloudflare
1. Namecheap → Domain → **Nameservers** → chọn *Custom DNS* → điền 2 nameserver Cloudflare cấp cho bạn.
2. Cloudflare tự quét bản ghi. Cần thêm/kiểm tra:

| Loại | Tên (Host) | Giá trị | Dùng cho |
|------|------------|---------|----------|
| CNAME/A | `@` và `www` | (Cloudflare Pages/Vercel cấp) | Trỏ web |
| TXT | (Resend cấp) | (Resend cấp) | Xác minh gửi mail (SPF) |
| TXT/CNAME | `resend._domainkey` | (Resend cấp) | DKIM (chống vào spam) |
| MX (nếu muốn nhận mail) | `@` | (nhà cung cấp mail) | Nhận email @domain |

> Bạn chỉ cần dán các bản ghi mà **Resend** và **Cloudflare Pages** hiển thị; mình
> hướng dẫn từng dòng khi tới bước đó.

## E. Nội dung trang chủ (để không "lộ mùi AI")
- 3 điểm mạnh nhất của Vdear (mỗi cái 1 câu):
  1. `______`
  2. `______`
  3. `______`
- Ảnh/ră ảnh chụp màn hình muốn dùng làm preview (OG image): `______`
- Có logo riêng chưa? (Có/gửi mình / Chưa — mình thiết kế tạm): `______`

## F. Tính năng AI (Pinecone) — chọn phạm vi
- Nguồn dữ liệu để AI học/tra: (chọn) tin tức RSS `______` · mô tả coin (CoinGecko) `______` · tài liệu của bạn `______`
- Câu hỏi mẫu bạn muốn AI trả lời được: `______`

---

## Thứ tự bàn giao (mình thực hiện sau khi bạn điền)
1. **Điền tối thiểu để chạy**: mục A (domain, email) + Clerk + Supabase keys trong `.env`.
2. Mình migrate web sang Next.js, gắn đăng nhập (Clerk) + lưu Yêu thích (Supabase), deploy Cloudflare + domain.
3. Bạn điền tiếp Stripe (mục C) → mình bật thanh toán & phân quyền gói.
4. Resend + Upstash + PostHog + Sentry → email, cache, analytics, giám sát lỗi.
5. Pinecone + LLM (mục F) → tính năng hỏi đáp AI.

## Mức tối thiểu để mình bắt đầu NGAY
Chỉ cần 4 thứ này là mình khởi động được:
- [ ] Domain (mục A)
- [ ] Clerk: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY`
- [ ] Supabase: `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Gói giá sơ bộ (mục C) — có thể điền sau

> ⚠️ Bảo mật: đừng gửi secret cho bất kỳ ai qua chat công khai. Điền trực tiếp vào
> `.env.local` trên máy bạn / phần Environment Variables của Cloudflare/Vercel.
> `.env.local` đã được `.gitignore` để không bị đẩy lên GitHub.
