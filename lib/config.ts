/**
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  ĐIỀN 3 GIÁ TRỊ VÀO GIỮA HAI DẤU "" Ở 3 DÒNG NGAY DƯỚI ĐÂY.        │
 * │  (Đây là các khóa CÔNG KHAI — để trong code an toàn.)             │
 * │  Điền xong thì gửi lại file này cho mình.                          │
 * └─────────────────────────────────────────────────────────────────┘
 */

const CLERK = "";   // ← dán Clerk Publishable key:  pk_test_....  (Clerk → API Keys)
const URL   = "";   // ← dán Supabase Project URL:   https://xxxx.supabase.co
const ANON  = "";   // ← dán Supabase anon/publishable key: sb_publishable_....

/* ───────── Không cần sửa phần dưới ───────── */

export const CLERK_PUBLISHABLE_KEY =
  CLERK || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";

export const SUPABASE_URL =
  URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";

export const SUPABASE_ANON_KEY =
  ANON || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** Đăng nhập (Clerk) đã bật chưa */
export const clerkEnabled = CLERK_PUBLISHABLE_KEY.length > 0;

/** Lưu đám mây (Supabase) đã cấu hình chưa */
export const cloudEnabled = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
