/**
 * Source confidence (spec: SOURCE CONFIDENCE).
 *
 * Every metric VDEAR publishes carries a 0..100 confidence describing HOW WELL
 * WE KNOW IT — separate from what the number says. A 90/100 Money Flow score
 * built from one stale third-party feed is not the same claim as the same score
 * built from four live exchanges, and the UI must be able to tell them apart.
 *
 * Confidence never manufactures data. A missing input lowers confidence and is
 * reported in the Envelope; it is never replaced by a default value.
 */

export type SourceKind =
  | 'cex_realtime'      // direct exchange REST/WS — we see the venue's own book
  | 'cex_aggregated'    // several venues merged by us
  | 'onchain_direct'    // node RPC or a first-party chain indexer
  | 'onchain_provider'  // Coin Metrics / Glassnode / CryptoQuant
  | 'aggregated_api'    // CoinGecko / DeFiLlama — someone else's aggregation
  | 'derived'           // computed by us from one of the above
  | 'third_party';      // everything else

/** Base confidence per source kind, before any staleness penalty. */
export const SOURCE_CONFIDENCE: Record<SourceKind, number> = {
  cex_realtime: 95,
  onchain_direct: 95,
  cex_aggregated: 90,
  onchain_provider: 88,
  aggregated_api: 85,
  derived: 80,
  third_party: 75,
};

/**
 * How long a metric stays fully trustworthy, by source kind (ms). Past this the
 * confidence decays; past `staleAfterMs` it is treated as stale outright.
 */
export const FRESH_WINDOW_MS: Record<SourceKind, number> = {
  cex_realtime: 15_000,
  cex_aggregated: 30_000,
  onchain_direct: 10 * 60_000,
  onchain_provider: 60 * 60_000,
  aggregated_api: 5 * 60_000,
  derived: 60_000,
  third_party: 15 * 60_000,
};

/** A metric older than 8x its fresh window is stale and must be labelled. */
export const STALE_MULTIPLIER = 8;

export interface Confidence {
  /** 0..100 */
  value: number;
  kind: SourceKind;
  ageMs: number;
  stale: boolean;
}

/**
 * Confidence for one observation, decayed linearly from its base value down to
 * a floor of 40 as it ages across the stale window.
 */
export function confidenceFor(kind: SourceKind, observedAt: number, now = Date.now()): Confidence {
  const base = SOURCE_CONFIDENCE[kind];
  const ageMs = Math.max(0, now - observedAt);
  const fresh = FRESH_WINDOW_MS[kind];
  const staleAt = fresh * STALE_MULTIPLIER;

  if (ageMs <= fresh) return { value: base, kind, ageMs, stale: false };

  if (ageMs >= staleAt) {
    // Still reported, but clearly marked — the UI shows it greyed with an age.
    return { value: Math.round(base * 0.4), kind, ageMs, stale: true };
  }
  const decayed = ageMs - fresh;
  const span = staleAt - fresh;
  const factor = 1 - 0.6 * (decayed / span);
  return { value: Math.round(base * factor), kind, ageMs, stale: false };
}

/**
 * Confidence of a value computed from several inputs.
 *
 * Deliberately NOT a plain average: a composite is only as trustworthy as its
 * weakest meaningful input, so this blends the mean with the minimum, and then
 * penalises missing inputs by coverage. Ten inputs of which two answered should
 * never look as certain as ten of which ten answered.
 */
export function combineConfidence(
  parts: { value: number; weight?: number }[],
  expectedCount = parts.length,
): number {
  if (parts.length === 0) return 0;
  let wsum = 0;
  let acc = 0;
  let min = 100;
  for (const p of parts) {
    const w = p.weight ?? 1;
    acc += p.value * w;
    wsum += w;
    if (p.value < min) min = p.value;
  }
  const weighted = wsum > 0 ? acc / wsum : 0;
  const blended = weighted * 0.7 + min * 0.3;
  const coverage = expectedCount > 0 ? parts.length / expectedCount : 1;
  return Math.round(Math.max(0, Math.min(100, blended * coverage)));
}

export function confidenceLabel(value: number): 'high' | 'medium' | 'low' | 'insufficient' {
  if (value >= 80) return 'high';
  if (value >= 60) return 'medium';
  if (value >= 35) return 'low';
  return 'insufficient';
}
