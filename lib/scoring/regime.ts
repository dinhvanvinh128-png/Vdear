/**
 * MARKET REGIME ENGINE (spec: MARKET REGIME ENGINE).
 *
 * Nine states: STRONG BULL, BULL, BULL ACCUMULATION, NEUTRAL, RANGE,
 * DISTRIBUTION, BEAR, STRONG BEAR, CAPITULATION.
 *
 * "Không dùng một indicator" — the composite score only picks a STARTING BAND.
 * Structural evidence then overrides it, which is where the states that a score
 * alone cannot express come from:
 *
 *   RANGE               a mid score is not the same as a market with no trend.
 *                       ADX below the threshold means RANGE, not NEUTRAL.
 *   BULL_ACCUMULATION   a mid score with flat price, rising CVD, whale
 *                       accumulation and expanding stablecoins is a base being
 *                       built — the most valuable state to identify, and one
 *                       that looks identical to NEUTRAL on the number alone.
 *   DISTRIBUTION        a GOOD score with falling CVD, narrowing breadth and
 *                       exchange inflow. Reading the score alone here would
 *                       call a top "BULL".
 *   CAPITULATION        a terrible score is only capitulation with the volume
 *                       and liquidation evidence to match; otherwise it is
 *                       just STRONG_BEAR.
 */
import type { AccDistResult } from '@/lib/scoring/accDist';
import { REGIME_BANDS, ADX_TREND_MINIMUM, type MarketRegime } from '@/lib/scoring/config';

export interface RegimeInput {
  /** Money Flow composite, 0..100. */
  compositeScore: number;
  trendScore: number | null;
  breadthScore: number | null;
  /** ADX on the daily. */
  adx: number | null;
  /** Price change over the regime window (usually 7d), percent. */
  priceChangePct: number | null;
  accDist: AccDistResult | null;
  /** Volume anomaly z-score, for capitulation detection. */
  volumeZ: number | null;
  /** Spot flow score, 0..100. */
  spotFlowScore: number | null;
  /** Coverage of the composite, 0..1 — a thin picture cannot claim an extreme. */
  coverage: number;
}

export interface RegimeResult {
  regime: MarketRegime;
  /** The band the composite alone would have given. */
  baseRegime: MarketRegime;
  /** Set when structural evidence overrode the band. */
  overrideReason: string | null;
  /** 0..100 — how clearly the evidence points at this regime. */
  conviction: number;
  scoredAt: number;
}

export function bandFor(score: number): MarketRegime {
  for (const band of REGIME_BANDS) {
    if (score >= band.min) return band.regime;
  }
  return 'NEUTRAL';
}

/**
 * Extremes need breadth of evidence behind them. With a thin picture the regime
 * is pulled one step toward the middle rather than claiming STRONG_BULL off
 * three of eight components.
 */
const SOFTEN: Partial<Record<MarketRegime, MarketRegime>> = {
  STRONG_BULL: 'BULL',
  STRONG_BEAR: 'BEAR',
  CAPITULATION: 'STRONG_BEAR',
};

export const MIN_COVERAGE_FOR_EXTREME = 0.6;

export function computeRegime(input: RegimeInput, now = Date.now()): RegimeResult {
  const base = bandFor(input.compositeScore);
  let regime = base;
  let overrideReason: string | null = null;

  const acc = input.accDist;
  const midBand = base === 'NEUTRAL';
  const goodBand = base === 'BULL' || base === 'STRONG_BULL';
  const badBand = base === 'BEAR' || base === 'STRONG_BEAR' || base === 'CAPITULATION';

  /* 1. DISTRIBUTION overrides a good band — a top looks bullish by the numbers. */
  if (goodBand && acc?.phase === 'DISTRIBUTION' && acc.strength >= 40) {
    regime = 'DISTRIBUTION';
    overrideReason =
      'The composite reads bullish, but spot flow, breadth and exchange flow are diverging from '
      + 'price — the advance is being sold into.';
  }

  /* 2. BULL ACCUMULATION overrides a mid band — a base being built. */
  else if ((midBand || base === 'BULL') && acc?.phase === 'ACCUMULATION' && acc.strength >= 40) {
    regime = 'BULL_ACCUMULATION';
    overrideReason =
      'Price is not leading, but flow is: cumulative delta, whale flow and stablecoin liquidity '
      + 'are building underneath a quiet market.';
  }

  /* 3. RANGE overrides a mid band when ADX says there is no trend at all. */
  else if (midBand && input.adx != null && input.adx < ADX_TREND_MINIMUM) {
    regime = 'RANGE';
    overrideReason =
      `Trend strength is low (ADX ${input.adx.toFixed(1)}) — this is a range, not a market `
      + 'waiting to resolve in either direction.';
  }

  /* 4. CAPITULATION needs the volume and flow evidence, not just a bad score. */
  else if (badBand) {
    const volumeSpike = input.volumeZ != null && input.volumeZ >= 2.5;
    const flowFlush = input.spotFlowScore != null && input.spotFlowScore <= 20;
    if (base === 'CAPITULATION' && !(volumeSpike && flowFlush)) {
      regime = 'STRONG_BEAR';
      overrideReason =
        'The composite is at capitulation levels, but without the volume spike and forced selling '
        + 'that define a capitulation this is better described as a strong downtrend.';
    } else if (base !== 'CAPITULATION' && volumeSpike && flowFlush && input.compositeScore <= 25) {
      regime = 'CAPITULATION';
      overrideReason =
        'Volume is spiking into heavy one-sided selling — the signature of forced liquidation '
        + 'rather than ordinary weakness.';
    }
  }

  /* 5. Coverage guard — an extreme claim needs a broad evidence base. */
  if (input.coverage < MIN_COVERAGE_FOR_EXTREME && SOFTEN[regime]) {
    const softened = SOFTEN[regime]!;
    overrideReason =
      `Only ${Math.round(input.coverage * 100)}% of the scoring inputs were available, which is `
      + 'not a broad enough basis for an extreme reading.';
    regime = softened;
  }

  return {
    regime,
    baseRegime: base,
    overrideReason,
    conviction: convictionOf(input, regime),
    scoredAt: now,
  };
}

/**
 * How clearly the evidence agrees. High conviction requires the independent
 * inputs to point the same way AND the data coverage to be broad.
 */
export function convictionOf(input: RegimeInput, regime: MarketRegime): number {
  const bullish = regime === 'STRONG_BULL' || regime === 'BULL' || regime === 'BULL_ACCUMULATION';
  const bearish = regime === 'BEAR' || regime === 'STRONG_BEAR'
    || regime === 'CAPITULATION' || regime === 'DISTRIBUTION';

  const signals = [input.trendScore, input.breadthScore, input.spotFlowScore]
    .filter((s): s is number => s != null);
  if (signals.length === 0) return Math.round(input.coverage * 40);

  const agreeing = signals.filter((s) => (bullish ? s > 50 : bearish ? s < 50 : true)).length;
  const agreement = (agreeing / signals.length) * 100;

  // Distance of the composite from neutral also matters — a 51 is not a regime.
  const decisiveness = Math.min(100, Math.abs(input.compositeScore - 50) * 2.5);

  return Math.round(
    Math.max(0, Math.min(100, agreement * 0.45 + decisiveness * 0.30 + input.coverage * 100 * 0.25)),
  );
}

export function isBullish(regime: MarketRegime): boolean {
  return regime === 'STRONG_BULL' || regime === 'BULL' || regime === 'BULL_ACCUMULATION';
}

export function isBearish(regime: MarketRegime): boolean {
  return regime === 'BEAR' || regime === 'STRONG_BEAR'
    || regime === 'CAPITULATION' || regime === 'DISTRIBUTION';
}
