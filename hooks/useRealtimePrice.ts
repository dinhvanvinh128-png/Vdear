'use client';
import { useEffect, useRef, useState } from 'react';
import type { ExchangeId } from '@/lib/types';
import { subscribe, type RealtimeStatus } from '@/lib/realtime';

export interface RealtimePriceState {
  /** Most recent price per venue. */
  prices: Partial<Record<ExchangeId, number>>;
  /** Mean across venues that are currently streaming. */
  consensus: number | null;
  status: Record<string, RealtimeStatus>;
  updatedAt: number | null;
}

/**
 * Live price for ONE symbol, direct from public venue streams.
 *
 * Scores and aggregates still come from the backend — this only keeps the
 * headline price ticking between REST refreshes. The subscription is torn down
 * when the tab is hidden so a background tab holds no sockets open.
 */
export function useRealtimePrice(symbol: string | null): RealtimePriceState {
  const [state, setState] = useState<RealtimePriceState>({
    prices: {}, consensus: null, status: {}, updatedAt: null,
  });
  const pending = useRef<Partial<Record<ExchangeId, number>>>({});

  useEffect(() => {
    if (!symbol || typeof window === 'undefined' || typeof WebSocket === 'undefined') return;

    pending.current = {};
    let sub: ReturnType<typeof subscribe> | null = null;

    // Ticks arrive far faster than React should re-render; batch to ~4fps.
    const flush = setInterval(() => {
      const prices = { ...pending.current };
      const values = Object.values(prices).filter((v): v is number => typeof v === 'number' && v > 0);
      if (values.length === 0) return;
      setState((prev) => ({
        prices,
        consensus: values.reduce((s, v) => s + v, 0) / values.length,
        status: sub ? sub.status() : prev.status,
        updatedAt: Date.now(),
      }));
    }, 250);

    const open = () => {
      sub?.close();
      sub = subscribe({
        symbol, channel: 'ticker',
        handlers: {
          onEvent: (e) => {
            if (e.tick) pending.current[e.tick.exchange] = e.tick.price;
          },
          onStatus: () => {
            setState((prev) => ({ ...prev, status: sub ? sub.status() : prev.status }));
          },
        },
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') open();
      else { sub?.close(); sub = null; }
    };

    if (document.visibilityState === 'visible') open();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(flush);
      sub?.close();
    };
  }, [symbol]);

  return state;
}
