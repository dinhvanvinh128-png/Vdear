/**
 * Database access — OPTIONAL BY DESIGN.
 *
 * getDb() returns null when no database is configured, and EVERY call site must
 * handle that. This is the mechanism behind "the platform runs with zero
 * configuration": the engines compute on demand, and the database only ever
 * adds history on top.
 *
 * Writes use the SERVICE ROLE key and therefore only ever happen in server
 * code (cron routes). Reads use the anon key, which RLS restricts to SELECT.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let readClient: SupabaseClient | null | undefined;
let writeClient: SupabaseClient | null | undefined;

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export function dbConfigured(): boolean {
  return !!(env('NEXT_PUBLIC_SUPABASE_URL') && env('NEXT_PUBLIC_SUPABASE_ANON_KEY'));
}

export function dbWritable(): boolean {
  return !!(env('NEXT_PUBLIC_SUPABASE_URL') && env('SUPABASE_SERVICE_ROLE_KEY'));
}

/** Read-only client, or null when unconfigured. Callers MUST handle null. */
export function getDb(): SupabaseClient | null {
  if (readClient !== undefined) return readClient;
  const url = env('NEXT_PUBLIC_SUPABASE_URL');
  const key = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  readClient = url && key
    ? createClient(url, key, { auth: { persistSession: false } })
    : null;
  return readClient;
}

/**
 * Privileged client for cron writes, or null. Never import this into a client
 * component — the service-role key must not reach the browser.
 */
export function getWriteDb(): SupabaseClient | null {
  if (writeClient !== undefined) return writeClient;
  const url = env('NEXT_PUBLIC_SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  writeClient = url && key
    ? createClient(url, key, { auth: { persistSession: false } })
    : null;
  return writeClient;
}

export interface DbStatus {
  configured: boolean;
  writable: boolean;
  message: string;
}

export function dbStatus(): DbStatus {
  const configured = dbConfigured();
  const writable = dbWritable();
  if (!configured) {
    return {
      configured: false, writable: false,
      message: 'Database not configured — all scores are computed live. '
        + 'Historical charts and score history need NEXT_PUBLIC_SUPABASE_URL '
        + 'and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    };
  }
  if (!writable) {
    return {
      configured: true, writable: false,
      message: 'Database readable but not writable — set SUPABASE_SERVICE_ROLE_KEY '
        + 'so the cron routes can record history.',
    };
  }
  return { configured: true, writable: true, message: 'Database configured (read + write).' };
}

/** Reset memoised clients. Test hook only. */
export function resetDbClients(): void {
  readClient = undefined;
  writeClient = undefined;
}
