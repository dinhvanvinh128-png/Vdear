'use client';
import { useCallback, useEffect, useState } from 'react';

const KEY = 'vdear-favorites';

/** Local favorites (base symbols). Cloud sync to Supabase happens on /watchlist. */
export function useFavorites() {
  const [favs, setFavs] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setFavs(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const persist = useCallback((next: string[]) => {
    setFavs(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);

  const toggle = useCallback((base: string) => {
    setFavs((cur) => {
      const b = base.toUpperCase();
      const next = cur.includes(b) ? cur.filter((x) => x !== b) : [...cur, b];
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const has = useCallback((base: string) => favs.includes(base.toUpperCase()), [favs]);

  return { favs, has, toggle, setFavs: persist };
}
