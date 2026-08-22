'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

interface State<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** ms epoch of the last successful fetch (for freshness display). */
  fetchedAt: number | null;
}

/**
 * Minimal fetch-on-interval hook (no extra dependency). Realtime-ish polling
 * that pauses when the tab is hidden to save quota. Returns data + freshness +
 * a manual refetch. The heavy caching lives server-side (lib/cache).
 */
export function useApi<T = unknown>(url: string | null, intervalMs = 0): State<T> & { refetch: () => void } {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: !!url, fetchedAt: null });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const alive = useRef(true);

  const run = useCallback(async () => {
    if (!url) return;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as T;
      if (alive.current) setState({ data: json, error: null, loading: false, fetchedAt: Date.now() });
    } catch (e) {
      if (alive.current) {
        setState((s) => ({ ...s, error: e instanceof Error ? e.message : 'error', loading: false }));
      }
    }
  }, [url]);

  useEffect(() => {
    alive.current = true;
    setState((s) => ({ ...s, loading: true }));
    run();
    if (intervalMs > 0) {
      const tick = () => {
        if (document.visibilityState === 'visible') run();
      };
      timer.current = setInterval(tick, intervalMs);
    }
    return () => {
      alive.current = false;
      if (timer.current) clearInterval(timer.current);
    };
  }, [run, intervalMs]);

  return { ...state, refetch: run };
}
