/**
 * Freshness tracking (spec: DATA QUALITY ENGINE — "Mỗi dữ liệu phải có source,
 * timestamp, freshness, confidence, API status").
 *
 * Every metric records WHEN its underlying observation was made, not when we
 * happened to fetch it. A stale value is still shown — hiding it would be worse
 * — but it is labelled, discounted in confidence, and excluded from anything
 * claiming to be real-time.
 */
import {
  confidenceFor, FRESH_WINDOW_MS, STALE_MULTIPLIER, type SourceKind,
} from '@/lib/quality/confidence';

export type FreshnessState = 'live' | 'recent' | 'aging' | 'stale';

export interface Freshness {
  observedAt: number;
  ageMs: number;
  state: FreshnessState;
  kind: SourceKind;
  /** Human-readable, e.g. "4s ago" — locale-stable for SSR/CSR parity. */
  label: string;
}

export function freshnessOf(kind: SourceKind, observedAt: number, now = Date.now()): Freshness {
  const ageMs = Math.max(0, now - observedAt);
  const fresh = FRESH_WINDOW_MS[kind];
  let state: FreshnessState;
  if (ageMs <= fresh) state = 'live';
  else if (ageMs <= fresh * 2) state = 'recent';
  else if (ageMs < fresh * STALE_MULTIPLIER) state = 'aging';
  else state = 'stale';
  return { observedAt, ageMs, state, kind, label: humanAge(ageMs) };
}

export function humanAge(ms: number): string {
  const s = ms / 1000;
  if (s < 1) return 'just now';
  if (s < 60) return `${Math.floor(s)}s ago`;
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** One fully-attributed metric: value + where it came from + how much to trust it. */
export interface QualifiedMetric<T> {
  value: T;
  source: string;
  freshness: Freshness;
  /** 0..100 after staleness decay and any anomaly penalty. */
  confidence: number;
}

export function qualify<T>(
  value: T, source: string, kind: SourceKind, observedAt: number,
  penalty = 0, now = Date.now(),
): QualifiedMetric<T> {
  const freshness = freshnessOf(kind, observedAt, now);
  const base = confidenceFor(kind, observedAt, now).value;
  return {
    value, source, freshness,
    confidence: Math.max(0, Math.min(100, Math.round(base - penalty))),
  };
}
