import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client for privileged operations (admin, cron, writes
 * bypassing RLS). Uses the SERVICE ROLE key which MUST stay server-only — it is
 * never imported into a client component. Returns null if not configured.
 */
export function getServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
