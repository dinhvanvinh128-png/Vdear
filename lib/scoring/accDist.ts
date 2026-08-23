/**
 * ACCUMULATION / DISTRIBUTION ENGINE (spec: ACCUMULATION / DISTRIBUTION ENGINE).
 *
 * The spec's two worked examples define the whole module:
 *
 *   Price sideways + CVD rising + whale accumulation + exchange outflow +
 *   stablecoin supply rising  ->  ACCUMULATION
 *
 *   Price rising + CVD falling + whale exchange inflow + breadth falling
 *   ->  DISTRIBUTION WARNING
 *
 * Both are DIVERGENCES between price and flow. That is the point: when price
 * and flow agree there is nothing to detect — it is just a trend. The signal
 * lives in the disagreement, so the engine scores the divergence itself rather
 * than the direction of either input.
 */
import { clamp, scaleAround } from '@/lib/indicators/series';
import {
  ACC_DIST_THRESHOLD, ACC_DIST_WEIGHTS, SIDEWAYS_PRICE_PCT,
} from '@/lib/scoring/config';

export type AccDistPhase = 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL';

export interface AccDistInput {
  /** Price change over the window, percent. */
  priceChangePct: number | null;
  /** CVD change over the SAME window, in quote currency. */
  cvdChange: number | null;
  /** Total volume over the window, to normalise cvdChange. */
  totalVolume: number | null;
  /** Whale engine score, 0..100 (>50 = whales buying / coins leaving venues). */
  whaleScore: number | null;
  /** Exchange netflow: positive = coins arriving on exchanges. */
  exchangeNetflowZ: number | null;
  /** Stablecoin engine score, 0..100. */
  stablecoinScore: number | null;
  /** Breadth engine score, 0..100. */
  breadthScore: number | null;
}

export interface AccDistResult {
  phase: AccDistPhase;
  /** 0..100 — how strongly the evidence points at the phase. */
  strength: number;
  /** Raw 0..100 bias: >50 accumulation-leaning, <50 distribution-leaning. */
  bias: number;
  /** True when price is flat enough for this to be a genuine base/top. */
  priceSideways: boolean;
  /**
   * Places where price and flow DISAGREE. At least one of these is required
   * before a phase is claimed — see the gate in computeAccDist.
   */
  divergences: string[];
  /** Divergences plus supporting context, for display. */
  evidence: string[];
  /** Inputs that were unavailable. */
  missing: string[];
  scoredAt: number;
}

export function computeAccDist(input: AccDistInput, now = Date.now()): AccDistResult {
  const parts: { value: number; weight: number }[] = [];
  // Divergences are the SIGNAL; supporting notes are context. Only the former
  // can justify claiming a phase.
  const divergences: string[] = [];
  const supporting: string[] = [];
  const missing: string[] = [];

  const priceSideways = input.priceChangePct != null
    && Math.abs(input.priceChangePct) <= SIDEWAYS_PRICE_PCT;

  /* --- 1. CVD vs price: the core divergence --------------------------------- */
  if (input.cvdChange != null && input.totalVolume != null && input.totalVolume > 0
      && input.priceChangePct != null) {
    // CVD move as a share of the window's turnover: comparable across assets.
    const cvdIntensity = input.cvdChange / input.totalVolume; // roughly -1..1
    const cvdUp = cvdIntensity > 0.02;
    const cvdDown = cvdIntensity < -0.02;
    const priceUp = input.priceChangePct > SIDEWAYS_PRICE_PCT;
    const priceDown = input.priceChangePct < -SIDEWAYS_PRICE_PCT;

    let value = scaleAround(cvdIntensity, 0, 0.15);
    if (priceSideways && cvdUp) {
      value = Math.max(value, 80);
      divergences.push('Price is flat while cumulative delta rises — buying is being absorbed quietly.');
    } else if (priceSideways && cvdDown) {
      value = Math.min(value, 20);
      divergences.push('Price is flat while cumulative delta falls — selling is being absorbed quietly.');
    } else if (priceUp && cvdDown) {
      // The spec's distribution warning: price up on falling delta.
      value = Math.min(value, 15);
      divergences.push('Price is rising while cumulative delta falls — the advance is not backed by spot buying.');
    } else if (priceDown && cvdUp) {
      value = Math.max(value, 85);
      divergences.push('Price is falling while cumulative delta rises — sellers are being absorbed.');
    }
    parts.push({ value, weight: ACC_DIST_WEIGHTS.cvdVsPrice });
  } else missing.push('CVD vs price');

  /* --- 2. Whale flow -------------------------------------------------------- */
  if (input.whaleScore != null) {
    parts.push({ value: input.whaleScore, weight: ACC_DIST_WEIGHTS.whaleFlow });
    if (input.whaleScore >= 65) supporting.push('Whale-sized flow is net accumulative.');
    else if (input.whaleScore <= 35) supporting.push('Whale-sized flow is net distributive.');
  } else missing.push('whale flow');

  /* --- 3. Exchange flow ----------------------------------------------------- */
  if (input.exchangeNetflowZ != null) {
    // Coins leaving exchanges (negative netflow) is accumulation -> invert.
    parts.push({ value: scaleAround(-input.exchangeNetflowZ, 0, 2), weight: ACC_DIST_WEIGHTS.exchangeFlow });
    if (input.exchangeNetflowZ <= -1) supporting.push('Coins are leaving exchanges faster than usual.');
    else if (input.exchangeNetflowZ >= 1) supporting.push('Coins are arriving on exchanges faster than usual — supply is being positioned to sell.');
  } else missing.push('exchange flow');

  /* --- 4. Stablecoin liquidity ---------------------------------------------- */
  if (input.stablecoinScore != null) {
    parts.push({ value: input.stablecoinScore, weight: ACC_DIST_WEIGHTS.stablecoin });
    if (input.stablecoinScore >= 65) supporting.push('Stablecoin supply is expanding — dry powder is building.');
    else if (input.stablecoinScore <= 35) supporting.push('Stablecoin supply is contracting — capital is leaving the system.');
  } else missing.push('stablecoin liquidity');

  /* --- 5. Breadth ----------------------------------------------------------- */
  if (input.breadthScore != null) {
    parts.push({ value: input.breadthScore, weight: ACC_DIST_WEIGHTS.breadth });
    if (input.breadthScore <= 35 && input.priceChangePct != null && input.priceChangePct > 0) {
      divergences.push('Price is up but breadth is weak — the advance is narrow.');
    }
  } else missing.push('breadth');

  const wsum = parts.reduce((s, p) => s + p.weight, 0);
  const bias = wsum > 0
    ? clamp(parts.reduce((s, p) => s + p.value * p.weight, 0) / wsum)
    : 50;

  // Strength is distance from neutral, rescaled to 0..100.
  const strength = clamp(Math.abs(bias - 50) * 2);

  /*
   * The gate. A phase requires BOTH:
   *   - a directional bias clearing the threshold, and
   *   - at least one actual divergence between price and flow.
   *
   * The second condition is the important one. When price and flow agree there
   * is nothing to detect — that is simply a trend — and an earlier version of
   * this gate used bias alone, which labelled a healthy advance (price +10%,
   * CVD rising, everything agreeing) as ACCUMULATION. Requiring a divergence
   * keeps the engine reporting what it is actually named for.
   */
  let phase: AccDistPhase = 'NEUTRAL';
  if (divergences.length > 0) {
    if (bias >= ACC_DIST_THRESHOLD) phase = 'ACCUMULATION';
    else if (bias <= 100 - ACC_DIST_THRESHOLD) phase = 'DISTRIBUTION';
  }

  return {
    phase, strength, bias, priceSideways,
    divergences, evidence: [...divergences, ...supporting],
    missing, scoredAt: now,
  };
}

/**
 * DISTRIBUTION while price is still rising is the specific case worth warning
 * about — the market looks healthy on the chart and is not underneath.
 */
export function isDistributionWarning(
  result: AccDistResult, priceChangePct: number | null,
): boolean {
  return result.phase === 'DISTRIBUTION' && priceChangePct != null && priceChangePct > 0;
}
