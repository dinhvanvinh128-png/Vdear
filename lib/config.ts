/**
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  ĐIỀN 2 GIÁ TRỊ SUPABASE VÀO GIỮA HAI DẤU "" (khóa CÔNG KHAI).     │
 * │  Điền xong → đăng nhập + lưu đám mây hoạt động, KHÔNG cần biến      │
 * │  môi trường Vercel. Để trống = chạy cục bộ (lưu trong máy).         │
 * └─────────────────────────────────────────────────────────────────┘
 */

const URL  = "https://gqfyfquweikosrnwacqs.supabase.co"; // Supabase Project URL
const ANON = "sb_publishable_Ewv_SsAarl-0I45fXwSbGg_oc10zmP0"; // Supabase anon/publishable key

/* ───────── Không cần sửa phần dưới ───────── */

export const SUPABASE_URL =
  URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";

export const SUPABASE_ANON_KEY =
  ANON || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** Đã cấu hình Supabase (đăng nhập + lưu đám mây) chưa */
export const cloudEnabled = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
