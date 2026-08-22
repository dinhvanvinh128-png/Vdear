/**
 * CoinGlass integration — SERVER-ONLY abstraction layer (spec §22).
 *
 * We do NOT scrape CoinGlass and we do NOT ship their proprietary UI. This is a
 * pluggable data provider: if a valid COINGLASS_API_KEY is present in the server
 * environment we call their official API; otherwise every method returns a
 * `configured: false` result and the app falls back to exchange-derived,
 * clearly-labelled ESTIMATED liquidation data (see lib/liquidations.ts).
 *
 * The API key is read only here, on the server. It is never sent to the client.
 * Field mappings below are conservative — adjust them to match your CoinGlass
 * plan's response schema when you enable the key.
 */
import type { LiquidationZone } from '@/lib/types';
import { getJson } from '@/lib/exchanges/http';

const BASE = process.env.COINGLASS_API_BASE || 'https://open-api-v4.coinglass.com';

export interface CoinglassStatus {
  configured: boolean;
  reachable?: boolean;
  message: string;
}

export type CoinglassResult<T> =
  | { configured: false; message: string }
  | { configured: true; available: true; data: T; source: 'coinglass' }
  | { configured: true; available: false; message: string };

function apiKey(): string | undefined {
  const k = process.env.COINGLASS_API_KEY;
  return k && k.trim() ? k.trim() : undefined;
}

export function coinglassConfigured(): boolean {
  return !!apiKey();
}

export async function coinglassStatus(): Promise<CoinglassStatus> {
  if (!apiKey()) {
    return { configured: false, message: 'CoinGlass integration not configured' };
  }
  try {
    // Lightweight reachability probe; endpoint kept generic on purpose.
    await getJson(`${BASE}/api/futures/supported-coins`, {
      headers: { 'CG-API-KEY': apiKey() as string },
      timeoutMs: 6000,
    });
    return { configured: true, reachable: true, message: 'CoinGlass online' };
  } catch (e) {
    return { configured: true, reachable: false, message: e instanceof Error ? e.message : 'unreachable' };
  }
}

async function call<T>(path: string): Promise<CoinglassResult<T>> {
  const key = apiKey();
  if (!key) return { configured: false, message: 'CoinGlass integration not configured' };
  try {
    const raw = await getJson<{ code?: string | number; data?: T }>(`${BASE}${path}`, {
      headers: { 'CG-API-KEY': key },
      timeoutMs: 9000,
    });
    if (raw && raw.data != null) {
      return { configured: true, available: true, data: raw.data, source: 'coinglass' };
    }
    return { configured: true, available: false, message: 'empty CoinGlass response' };
  } catch (e) {
    return { configured: true, available: false, message: e instanceof Error ? e.message : 'error' };
  }
}

export interface HeatmapCell {
  price: number;
  time: number;
  value: number; // liquidation intensity
}

/** Liquidation heatmap for a coin. Shape depends on your CoinGlass plan. */
export function getLiquidationHeatmap(coin: string, range = '24h') {
  return call<HeatmapCell[]>(`/api/futures/liquidation/heatmap?symbol=${coin}&range=${range}`);
}

/** Aggregated liquidation levels (map). */
export function getLiquidationMap(coin: string) {
  return call<LiquidationZone[]>(`/api/futures/liquidation/map?symbol=${coin}`);
}

/** Historical liquidation totals for a coin. */
export function getLiquidationHistory(coin: string, range = '24h') {
  return call<{ time: number; long: number; short: number }[]>(
    `/api/futures/liquidation/history?symbol=${coin}&range=${range}`,
  );
}
