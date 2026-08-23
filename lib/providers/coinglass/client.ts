/**
 * CoinGlass integration — SERVER-ONLY (spec §22).
 *
 * Real CoinGlass API v4 (https://open-api-v4.coinglass.com), authenticated with
 * the `CG-API-KEY` header read only from the server environment. We never scrape
 * CoinGlass or ship its UI.
 *
 * IMPORTANT — plan gating: the Liquidation MAP and pair HEATMAP (model3)
 * endpoints require a CoinGlass **Professional or Enterprise** plan. With no key,
 * or a lower plan, these calls return `available:false` and the app falls back
 * to transparent exchange-derived ESTIMATES (see lib/liquidations.ts).
 *
 * Endpoints used:
 *   GET /api/futures/liquidation/map            (Pro+)   params: exchange, symbol, range(1d|7d|30d)
 *   GET /api/futures/liquidation/heatmap/model3 (Pro+)   params: exchange, symbol, range(12h|24h|3d|7d|30d|90d|180d|1y)
 *   GET /api/futures/supported-coins            (all)    used as a health probe
 */
import { request as getJson } from '@/lib/net/request';

const BASE = process.env.COINGLASS_API_BASE || 'https://open-api-v4.coinglass.com';
export const DEFAULT_EXCHANGE = process.env.COINGLASS_EXCHANGE || 'Binance';

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

/** Low-level authenticated GET. Returns the parsed `{code,msg,data}` envelope. */
async function request<T>(path: string): Promise<{ code: string; msg: string; data: T }> {
  const key = apiKey();
  if (!key) throw new Error('not configured');
  return getJson<{ code: string; msg: string; data: T }>(`${BASE}${path}`, {
    headers: { 'CG-API-KEY': key, accept: 'application/json' },
    timeoutMs: 9000,
  });
}

export async function coinglassStatus(): Promise<CoinglassStatus> {
  if (!apiKey()) return { configured: false, message: 'CoinGlass integration not configured' };
  try {
    const r = await request<unknown>('/api/futures/supported-coins');
    return { configured: true, reachable: r.code === '0', message: r.code === '0' ? 'CoinGlass online' : `CoinGlass: ${r.msg}` };
  } catch (e) {
    return { configured: true, reachable: false, message: e instanceof Error ? e.message : 'unreachable' };
  }
}

/* ------------------------------- Liquidation MAP ------------------------------ */

export interface CgLiquidationLevel {
  price: number;
  levelUsd: number; // liquidation notional at this price
  leverage: number;
}

// Raw shape: data.data = { "<price>": [ [price, levelUsd, leverage, null], ... ], ... }
type MapRaw = { data: Record<string, [number, number, number, unknown][]> };

export async function getLiquidationMap(
  symbol: string, exchange: string = DEFAULT_EXCHANGE, range = '1d',
): Promise<CoinglassResult<CgLiquidationLevel[]>> {
  if (!apiKey()) return { configured: false, message: 'CoinGlass integration not configured' };
  try {
    const r = await request<MapRaw>(
      `/api/futures/liquidation/map?exchange=${encodeURIComponent(exchange)}&symbol=${symbol}&range=${range}`,
    );
    if (r.code !== '0') return { configured: true, available: false, message: `CoinGlass: ${r.msg}` };
    const byPrice = r.data?.data ?? {};
    const levels: CgLiquidationLevel[] = [];
    for (const rows of Object.values(byPrice)) {
      for (const row of rows) {
        const [price, levelUsd, leverage] = row;
        if (Number.isFinite(price) && Number.isFinite(levelUsd)) {
          levels.push({ price, levelUsd, leverage });
        }
      }
    }
    if (levels.length === 0) return { configured: true, available: false, message: 'empty CoinGlass map' };
    return { configured: true, available: true, data: levels, source: 'coinglass' };
  } catch (e) {
    return { configured: true, available: false, message: e instanceof Error ? e.message : 'error' };
  }
}

/* ----------------------------- Liquidation HEATMAP ---------------------------- */

export interface CgHeatmap {
  yAxis: number[]; // price levels (rows)
  points: [number, number, number][]; // [xIndex, yIndex, value]
  candles: { time: number; open: number; high: number; low: number; close: number }[];
}

type HeatmapRaw = {
  y_axis: number[];
  liquidation_leverage_data: [number, number, number][];
  price_candlesticks: [number, string, string, string, string, string][];
};

export async function getLiquidationHeatmap(
  symbol: string, exchange: string = DEFAULT_EXCHANGE, range = '24h',
): Promise<CoinglassResult<CgHeatmap>> {
  if (!apiKey()) return { configured: false, message: 'CoinGlass integration not configured' };
  try {
    const r = await request<HeatmapRaw>(
      `/api/futures/liquidation/heatmap/model3?exchange=${encodeURIComponent(exchange)}&symbol=${symbol}&range=${range}`,
    );
    if (r.code !== '0') return { configured: true, available: false, message: `CoinGlass: ${r.msg}` };
    const d = r.data;
    if (!d || !Array.isArray(d.y_axis)) return { configured: true, available: false, message: 'empty CoinGlass heatmap' };
    const heatmap: CgHeatmap = {
      yAxis: d.y_axis,
      points: d.liquidation_leverage_data || [],
      candles: (d.price_candlesticks || []).map((c) => ({
        time: c[0], open: parseFloat(c[1]), high: parseFloat(c[2]), low: parseFloat(c[3]), close: parseFloat(c[4]),
      })),
    };
    return { configured: true, available: true, data: heatmap, source: 'coinglass' };
  } catch (e) {
    return { configured: true, available: false, message: e instanceof Error ? e.message : 'error' };
  }
}

/* ----------------------------- Liquidation HISTORY ---------------------------- */

export async function getLiquidationHistory(symbol: string, exchange: string = DEFAULT_EXCHANGE, range = '24h') {
  if (!apiKey()) return { configured: false as const, message: 'CoinGlass integration not configured' };
  try {
    const r = await request<unknown>(
      `/api/futures/liquidation/history?exchange=${encodeURIComponent(exchange)}&symbol=${symbol}&range=${range}`,
    );
    if (r.code !== '0') return { configured: true as const, available: false as const, message: `CoinGlass: ${r.msg}` };
    return { configured: true as const, available: true as const, data: r.data, source: 'coinglass' as const };
  } catch (e) {
    return { configured: true as const, available: false as const, message: e instanceof Error ? e.message : 'error' };
  }
}
