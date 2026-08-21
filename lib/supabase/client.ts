"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client dùng ở phía trình duyệt (Client Components).
 * Trả về null nếu chưa cấu hình biến môi trường — để app vẫn chạy ở chế độ demo.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}
