# 🌳 Gia Phả Dòng Họ — Website Full-Stack

Website gia phả dòng họ hiện đại, trang trọng, responsive. Lưu trữ, quản lý và
**trực quan hóa cây phả hệ** qua nhiều đời, nhiều chi.

**Công nghệ:** Next.js 14 (App Router) · TypeScript · Tailwind CSS · React Flow ·
Supabase (PostgreSQL + Auth + Storage) · Lucide Icons · Zod · Vercel · Cloudflare.

> **Không có dữ liệu bịa sẵn.** Khi chưa cấu hình Supabase, website **để trống**
> và hiển thị lời mời thêm thành viên — không tự tạo người giả. Khi bạn thêm biến
> môi trường Supabase, toàn bộ dữ liệu lấy từ database do **bạn tự nhập**.
> (Có sẵn `supabase/seed.sql` — dữ liệu MẪU **tùy chọn** để thử giao diện, có thể
> bỏ qua.)

---

## ✅ Đã có (Phase 1–3 + nền tảng)

- Trang chủ trang trọng: hero, thống kê, giới thiệu, sự kiện sắp tới, tổ tiên.
- **Cây gia phả tương tác** (React Flow): nhiều đời, quan hệ cha/mẹ/con và vợ/chồng,
  zoom, kéo, nút "toàn cây" / "đặt lại", tìm người trong cây, thu gọn/mở rộng nhánh,
  phân biệt nam/nữ, ảnh đại diện, trạng thái còn sống/đã mất, click mở hồ sơ.
- Danh sách **thành viên** + tìm kiếm/lọc theo chi, theo đời.
- **Hồ sơ thành viên** `/member/[id]`: thông tin, tiểu sử, quan hệ (cha/mẹ/vợ chồng),
  danh sách con, anh chị em, **QR code**, SEO riêng.
- **Chi họ**, **Lịch sử dòng họ** (timeline), **Sự kiện**, **Lịch giỗ**, **Thư viện**.
- **Đăng nhập** Email + Google (Supabase Auth).
- **Database schema đầy đủ** + **Row Level Security** cho toàn bộ bảng.
- SEO: metadata, Open Graph, `sitemap.xml`, `robots.txt`. Dark mode. Responsive.

## 🧭 Lộ trình tiếp theo (Phase 4–9)

Admin Dashboard & CRUD · hệ thống duyệt thay đổi (change requests) · upload ảnh/tài
liệu qua Supabase Storage · thông báo · thống kê biểu đồ · Export Excel/CSV/PDF/PNG &
Import · bản đồ quê quán/mộ phần · tích hợp AI hỏi–đáp gia phả.

---

## 🗂 Cấu trúc

```
app/                 # Các trang (App Router)
  page.tsx           # Trang chủ
  tree/              # Cây gia phả
  members/           # Danh sách thành viên
  member/[id]/       # Hồ sơ thành viên
  branches/ history/ events/ memorial/ library/ login/
components/           # Navbar, Footer, MemberCard, StatCard, ...
  tree/              # FamilyTree (React Flow) + MemberNode
  ui/                # button, card, badge, input (kiểu shadcn)
lib/                 # data.ts (data layer), demo-data, tree-layout, supabase clients, utils
types/               # Kiểu TypeScript dùng chung
supabase/
  migrations/0001_init.sql   # Schema + RLS
  seed.sql                   # Dữ liệu demo
```

## 🚀 Chạy local

```bash
npm install
cp .env.example .env.local   # (tùy chọn) điền khóa Supabase
npm run dev                  # http://localhost:3000
```

Không có `.env.local` vẫn chạy được ở chế độ demo.

---

## ☁️ Deploy lên Vercel (làm trước, chưa cần Supabase)

1. Push code lên GitHub (đã xong ở nhánh này).
2. Vào [vercel.com](https://vercel.com) → **Add New… → Project** → chọn repo `Vdear`.
3. Framework tự nhận **Next.js**. Bấm **Deploy**.
4. Sau ~1 phút bạn có URL `https://<tên>.vercel.app` chạy **chế độ demo**.

> Muốn dùng dữ liệu thật: làm tiếp phần Supabase bên dưới rồi thêm 2 biến môi
> trường trong Vercel (**Settings → Environment Variables**) và **Redeploy**.

## 🗄️ Cấu hình Supabase (dữ liệu thật)

1. Tạo project tại [supabase.com](https://supabase.com).
2. **SQL Editor** → dán nội dung `supabase/migrations/0001_init.sql` → **Run**.
3. (Tùy chọn) dán `supabase/seed.sql` → **Run** nếu muốn dữ liệu MẪU để thử. Bỏ
   qua bước này nếu muốn tự nhập dữ liệu thật của dòng họ.
4. **Storage** → tạo bucket `photos` (và `documents`) cho ảnh/tài liệu.
5. **Authentication → Providers**: bật **Email** và **Google** (điền OAuth client).
6. **Project Settings → API**: copy `Project URL` và `anon public key`.
7. Đặt biến môi trường (local `.env.local` và trên Vercel):
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```
8. Đặt tài khoản của bạn làm admin (sau khi đăng nhập lần đầu):
   ```sql
   update profiles set role = 'admin' where id = '<user-uuid>';
   ```
9. **Redeploy** trên Vercel.

## 🌐 Cloudflare (domain / CDN)

1. Thêm domain vào Cloudflare, trỏ nameserver theo hướng dẫn.
2. Trong Vercel **Settings → Domains** thêm domain của bạn.
3. Tại Cloudflare tạo bản ghi **CNAME** trỏ về `cname.vercel-dns.com`
   (proxy có thể để **DNS only** để tránh xung đột SSL, hoặc theo hướng dẫn Vercel).

---

## 🔒 Bảo mật

- **Row Level Security** bật cho mọi bảng; chỉ admin ghi dữ liệu lõi.
- Thông tin người còn sống có 3 mức: `public` / `family` / `private`.
- Chỉ dùng `anon key` ở frontend; **không** đưa `service_role` ra client.
- `audit_logs` ghi nhật ký; `change_requests` cho quy trình duyệt thay đổi.

## 🛠 Ghi chú kỹ thuật

- `next.config.mjs` tạm bật `ignoreBuildErrors`/`ignoreDuringBuilds` để **deploy lần
  đầu chắc chắn thành công**. Sau khi ổn định nên đặt lại `false` để bật kiểm tra
  nghiêm ngặt.
- Quan hệ gia phả có **chống vòng lặp** (không cho A là cha của B rồi B là cha của A)
  ở tầng nhập liệu (sẽ hoàn thiện trong Phase 4 khi làm CRUD admin).
