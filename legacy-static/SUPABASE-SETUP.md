# Bật đăng nhập + đồng bộ Yêu thích (không cần Next.js)

Web chạy Clerk + Supabase **thẳng trên trình duyệt** bằng **khoá công khai**.
Làm 3 bước:

## 1) Tạo bảng trong Supabase
- Supabase → **SQL Editor** → dán nội dung `supabase/schema.sql` → **Run**.

## 2) Nối Clerk với Supabase (JWT template)
- Lấy **JWT Secret** của Supabase: Supabase → **Settings → API → JWT Settings → JWT Secret** (copy).
- Clerk → **JWT Templates → New template → chọn "Supabase"** (nếu có preset) hoặc tạo template **tên đúng là `supabase`**.
  - Dán **JWT Secret** của Supabase vào ô signing key.
  - Lưu. (Template phải tên `supabase` vì code gọi `getToken({ template: 'supabase' })`.)

## 3) Điền khoá công khai vào `env.js`
```js
window.VDEAR_ENV = {
  CLERK_PUBLISHABLE_KEY: "pk_live_...",   // hoặc pk_test_...
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_... hoặc anon JWT",
  ...
};
```

## Xong!
- Nút **Đăng nhập** hiện ở góc phải → bấm để đăng nhập (Clerk).
- Đã đăng nhập: bấm ⭐ ở coin → lưu lên Supabase, **đồng bộ mọi thiết bị**.
- Chưa đăng nhập / chưa cấu hình: Yêu thích vẫn hoạt động bằng bộ nhớ trình duyệt.

> Chỉ dùng **khoá công khai** ở client (an toàn nhờ RLS). Secret (service_role,
> Clerk secret) KHÔNG đặt ở đây — chỉ cần khi làm tính năng server (Stripe/Resend/AI)
> qua Next.js/Cloudflare Workers sau này.
