'use client';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase/client';

/** Current Supabase user (null when signed out or auth not configured). */
export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) { setReady(true); return; }
    sb.auth.getUser().then(({ data }) => { setUser(data.user ?? null); setReady(true); });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { user, ready, configured: !!getSupabase() };
}
