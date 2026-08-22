"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, cloudEnabled } from "@/lib/config";

let cached: SupabaseClient | null | undefined;

export function supabaseConfigured(): boolean {
  return cloudEnabled;
}

/** Supabase client dùng để LƯU DỮ LIỆU (không dùng cho auth). null nếu chưa cấu hình. */
export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  if (!cloudEnabled) {
    cached = null;
    return null;
  }
  cached = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false }
  });
  return cached;
}
