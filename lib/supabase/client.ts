'use client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser Supabase client (auth + watchlist/portfolio reads under RLS).
 * Env-guarded: if the public env vars are absent, returns null and the UI
 * degrades to "sign-in unavailable" instead of throwing.
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}

export function supabaseConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}
