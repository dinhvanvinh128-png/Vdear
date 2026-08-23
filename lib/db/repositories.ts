/**
 * Typed repositories — the ONLY place SQL/PostgREST calls are written.
 *
 * Every function is null-safe: with no database configured they resolve to an
 * empty result (reads) or a no-op (writes) rather than throwing. A caller
 * therefore never needs to branch on whether history is available; it just gets
 * an empty series and renders "no history yet".
 */
import { getDb, getWriteDb } from '@/lib/db/client';
import type { MarketRegime, SignalState } from '@/lib/scoring/config';

/* --------------------------------- scores --------------------------------- */

export interface ScoreRow {
  symbol: string;
  scored_at: string;
  money_flow: number | null;
  trend: number | null;
  liquidity: number | null;
  breadth: number | null;
  onchain: number | null;
  whale: number | null;
  spot_flow: number | null;
  stablecoin: number | null;
  defi: number | null;
  derivatives: number | null;
  regime: MarketRegime | null;
  regime_conviction: number | null;
  acc_dist: string | null;
  signal_state: SignalState | null;
  signal_confidence: number | null;
  coverage: number | null;
  data_confidence: number | null;
  components: unknown;
}

export async function saveScore(row: Omit<ScoreRow, 'scored_at'> & { scored_at?: string }): Promise<boolean> {
  const db = getWriteDb();
  if (!db) return false;
  const { error } = await db.from('market_scores').upsert(
    { ...row, scored_at: row.scored_at ?? new Date().toISOString() },
    { onConflict: 'symbol,scored_at' },
  );
  return !error;
}

/** Score history for a symbol, oldest first. Empty when there is no database. */
export async function getScoreHistory(symbol: string, limit = 200): Promise<ScoreRow[]> {
  const db = getDb();
  if (!db) return [];
  const { data, error } = await db
    .from('market_scores')
    .select('*')
    .eq('symbol', symbol.toUpperCase())
    .order('scored_at', { ascending: false })
    .limit(Math.min(1000, limit));
  if (error || !data) return [];
  return (data as ScoreRow[]).reverse();
}

/* --------------------------------- breadth -------------------------------- */

export interface BreadthRow {
  captured_at: string;
  universe: number;
  advancing_pct: number | null;
  above_ema20_pct: number | null;
  above_ema50_pct: number | null;
  above_ema200_pct: number | null;
  ema200_sample: number | null;
  volume_ratio: number | null;
  score: number;
}

export async function saveBreadth(row: Omit<BreadthRow, 'captured_at'> & Record<string, unknown>): Promise<boolean> {
  const db = getWriteDb();
  if (!db) return false;
  const { error } = await db.from('market_breadth').insert({ ...row, captured_at: new Date().toISOString() });
  return !error;
}

export async function getBreadthHistory(limit = 168): Promise<BreadthRow[]> {
  const db = getDb();
  if (!db) return [];
  const { data, error } = await db
    .from('market_breadth').select('*')
    .order('captured_at', { ascending: false }).limit(Math.min(1000, limit));
  if (error || !data) return [];
  return (data as BreadthRow[]).reverse();
}

/* ----------------------------------- CVD ---------------------------------- */

export interface CvdRow {
  symbol: string;
  timeframe: string;
  bucket_time: string;
  cumulative: number;
  delta: number;
  close_price: number | null;
}

export async function saveCvd(rows: CvdRow[]): Promise<number> {
  const db = getWriteDb();
  if (!db || rows.length === 0) return 0;
  const { error } = await db.from('cvd').upsert(rows, { onConflict: 'symbol,timeframe,bucket_time' });
  return error ? 0 : rows.length;
}

export async function getCvdHistory(symbol: string, timeframe: string, limit = 500): Promise<CvdRow[]> {
  const db = getDb();
  if (!db) return [];
  const { data, error } = await db
    .from('cvd').select('*')
    .eq('symbol', symbol.toUpperCase()).eq('timeframe', timeframe)
    .order('bucket_time', { ascending: false }).limit(Math.min(2000, limit));
  if (error || !data) return [];
  return (data as CvdRow[]).reverse();
}

/* ---------------------------------- alerts -------------------------------- */

export interface AlertRow {
  asset: string;
  kind: string;
  severity: 'info' | 'warning' | 'critical';
  reason: string;
  source: string;
  confidence: number | null;
  payload?: unknown;
  dedupe_key: string;
  triggered_at?: string;
}

/**
 * Insert an alert, ignoring duplicates.
 *
 * The dedupe key is what stops a restart re-firing yesterday's alerts. Without
 * a database, de-duplication is per-process only — which is why the alert route
 * says so.
 */
export async function saveAlert(row: AlertRow): Promise<'inserted' | 'duplicate' | 'no_db'> {
  const db = getWriteDb();
  if (!db) return 'no_db';
  const { error } = await db.from('alerts').insert({
    ...row, triggered_at: row.triggered_at ?? new Date().toISOString(),
  });
  if (!error) return 'inserted';
  // 23505 = unique_violation on dedupe_key: the alert already fired.
  if ((error as { code?: string }).code === '23505') return 'duplicate';
  return 'no_db';
}

export async function getRecentAlerts(limit = 100, asset?: string): Promise<(AlertRow & { triggered_at: string })[]> {
  const db = getDb();
  if (!db) return [];
  let q = db.from('alerts').select('*').order('triggered_at', { ascending: false })
    .limit(Math.min(500, limit));
  if (asset) q = q.eq('asset', asset.toUpperCase());
  const { data, error } = await q;
  if (error || !data) return [];
  return data as (AlertRow & { triggered_at: string })[];
}

/* ------------------------------ data quality ------------------------------ */

export async function saveDataQuality(row: {
  symbol: string; severity: string; median_price: number | null;
  raw_spread_pct: number | null; outliers: string[]; message: string | null;
  deviations: unknown;
}): Promise<boolean> {
  const db = getWriteDb();
  if (!db) return false;
  const { error } = await db.from('data_quality').insert({ ...row, detected_at: new Date().toISOString() });
  return !error;
}

/* ------------------------------- api health ------------------------------- */

export async function saveHealth(rows: {
  source: string; status: string; latency_ms: number | null; message: string | null;
}[]): Promise<boolean> {
  const db = getWriteDb();
  if (!db || rows.length === 0) return false;
  const checked_at = new Date().toISOString();
  const { error } = await db.from('api_health').insert(rows.map((r) => ({ ...r, checked_at })));
  return !error;
}

/* -------------------------------- retention ------------------------------- */

export async function pruneMarketData(): Promise<{ ok: boolean; results: unknown }> {
  const db = getWriteDb();
  if (!db) return { ok: false, results: null };
  const { data, error } = await db.rpc('prune_market_data');
  return { ok: !error, results: data ?? null };
}
