/**
 * Crypto Fear & Greed index (alternative.me, public, no key). Fails soft.
 */
import { num } from '@/lib/exchanges/http';
import { request as getJson } from '@/lib/net/request';

export interface FearGreed {
  value: number; // 0..100
  label: string; // Extreme Fear .. Extreme Greed
  timestamp: number;
  history: { value: number; timestamp: number }[];
}

export async function getFearGreed(): Promise<FearGreed | null> {
  try {
    const j = await getJson<{ data: { value: string; value_classification: string; timestamp: string }[] }>(
      'https://api.alternative.me/fng/?limit=30',
      { timeoutMs: 8000 },
    );
    const rows = j.data || [];
    if (rows.length === 0) return null;
    const latest = rows[0];
    return {
      value: num(latest.value),
      label: latest.value_classification,
      timestamp: num(latest.timestamp) * 1000,
      history: rows.map((r) => ({ value: num(r.value), timestamp: num(r.timestamp) * 1000 })).reverse(),
    };
  } catch {
    return null;
  }
}
