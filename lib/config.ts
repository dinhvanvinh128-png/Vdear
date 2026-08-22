/**
 * CẤU HÌNH CÔNG KHAI — có thể nhúng thẳng vào code, KHÔNG cần biến môi trường Vercel.
 *
 * Các khóa dưới đây đều là khóa "công khai" (publishable / anon), vốn được thiết kế
 * để lộ ở phía trình duyệt — an toàn khi để trong mã nguồn.
 *
 * Cách bật đăng nhập + lưu đám mây: điền 3 giá trị vào giữa 2 dấu ngoặc kép "".
 *   1) CLERK  — tạo app tại https://clerk.com → API Keys → "Publishable key" (pk_...)
 *   2) SUPABASE URL + ANON — Supabase → Project Settings → API / API Keys
 *
 * Nếu để trống: web vẫn chạy ở chế độ CỤC BỘ (lưu trong máy, không đăng nhập).
 * (Vẫn ưu tiên biến môi trường nếu có, nên bạn có thể dùng cách nào cũng được.)
 */

export const CLERK_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** Đăng nhập (Clerk) đã bật chưa */
export const clerkEnabled = CLERK_PUBLISHABLE_KEY.length > 0;

/** Lưu đám mây (Supabase) đã cấu hình chưa */
export const cloudEnabled = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
