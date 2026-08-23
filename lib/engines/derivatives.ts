/**
 * DERIVATIVES CONFIRMATION ENGINE (spec: DERIVATIVES).
 *
 * "Không dùng futures làm nguồn duy nhất để quyết định Spot." Derivatives here
 * answer one question only: does positioning CONFIRM what spot flow is saying,
 * or contradict it? The output is a confirmation score plus an explicit
 * agreement flag — it is capped in the Money Flow Score at 5% and is never
 * allowed to set direction on its own.
 *
 * The interpretation is deliberately non-naive:
 *   - Rising OI + rising price + POSITIVE funding = leveraged longs crowding in.
 *     That is momentum, but it is also fuel for a long squeeze, so extreme
 *     funding REDUCES the confirmation rather than raising it.
 *   - Rising OI + rising price + NEGATIVE funding = shorts being squeezed while
 *     spot lifts — the highest-quality confirmation there is.
 */
import { clamp, pctChange, scaleAround } from '@/lib/indicators/series';
import type { ExchangeId } from '@/lib/types';

export interface DerivativesInput {
  symbol: string;
  /** Volume-weighted funding across venues, as a fraction (0.0001 = 0.01%). */
  fundingRate: number | null;
  /** Summed OI in USD, now and 24h ago. */
  openInterestUsd: number | null;
  openInterestUsd24hAgo: number | null;
  /** Spot price change over the same window, percent. */
  priceChange24h: number | null;
  /** Average long account share, 0..100. */
  longPct: number | null;
  /** Liquidations in the last 24h, if a source provides them. */
  longLiquidationsUsd?: number | null;
  shortLiquidationsUsd?: number | null;
  sources: ExchangeId[];
}

export type PositioningRegime =
  | 'long_crowding'      // OI up, price up, funding rich
  | 'short_squeeze'      // OI up, price up, funding negative
  | 'long_unwind'        // OI down, price down
  | 'short_build'        // OI up, price down
  | 'deleveraging'       // OI down sharply
  | 'balanced';

export interface DerivativesConfirmation {
  symbol: string;
  fundingRate: number | null;
  /** Annualised funding, percent — the comparable form. */
  fundingAnnualizedPct: number | null;
  openInterestUsd: number | null;
  oiChange24hPct: number | null;
  longPct: number | null;
  netLiquidationUsd: number | null;
  regime: PositioningRegime;
  /** 0..100 — how strongly derivatives confirm the spot picture. */
  score: number;
  /** True when positioning agrees with the spot direction. */
  confirms: boolean | null;
  /** Leverage-risk flags that the analyst surfaces under RISKS. */
  warnings: string[];
  sources: ExchangeId[];
  observedAt: number;
}

/** Perpetual funding is charged every 8h -> 3x/day, 1095x/year. */
export const FUNDING_PERIODS_PER_YEAR = 1095;

/** Above this annualised rate, long crowding is a squeeze risk, not strength. */
export const FUNDING_RICH_ANNUAL_PCT = 30;

export function classifyPositioning(
  oiChangePct: number | null, priceChangePct: number | null, funding: number | null,
): PositioningRegime {
  if (oiChangePct == null || priceChangePct == null) return 'balanced';
  const oiUp = oiChangePct > 2;
  const oiDown = oiChangePct < -2;
  const priceUp = priceChangePct > 0.5;
  const priceDown = priceChangePct < -0.5;

  if (oiDown && Math.abs(oiChangePct) > 10) return 'deleveraging';
  if (oiUp && priceUp) return (funding != null && funding < 0) ? 'short_squeeze' : 'long_crowding';
  if (oiUp && priceDown) return 'short_build';
  if (oiDown && priceDown) return 'long_unwind';
  return 'balanced';
}

export function computeDerivativesConfirmation(
  input: DerivativesInput, now = Date.now(),
): DerivativesConfirmation {
  const oiChange24hPct = pctChange(input.openInterestUsd24hAgo, input.openInterestUsd);
  const fundingAnnualizedPct = input.fundingRate != null
    ? input.fundingRate * FUNDING_PERIODS_PER_YEAR * 100
    : null;
  const regime = classifyPositioning(oiChange24hPct, input.priceChange24h, input.fundingRate);

  const netLiquidationUsd =
    input.longLiquidationsUsd != null || input.shortLiquidationsUsd != null
      ? (input.shortLiquidationsUsd ?? 0) - (input.longLiquidationsUsd ?? 0)
      : null;

  const warnings: string[] = [];
  if (fundingAnnualizedPct != null && fundingAnnualizedPct > FUNDING_RICH_ANNUAL_PCT) {
    warnings.push(
      `Funding is rich (${fundingAnnualizedPct.toFixed(1)}% annualised) — long positioning is crowded, `
      + 'which raises the risk of a leverage-driven pullback.',
    );
  }
  if (fundingAnnualizedPct != null && fundingAnnualizedPct < -FUNDING_RICH_ANNUAL_PCT) {
    warnings.push(
      `Funding is deeply negative (${fundingAnnualizedPct.toFixed(1)}% annualised) — shorts are paying, `
      + 'which raises short-squeeze probability.',
    );
  }
  if (oiChange24hPct != null && oiChange24hPct > 15) {
    warnings.push(
      `Open interest is up ${oiChange24hPct.toFixed(1)}% in 24h — leverage is building quickly.`,
    );
  }
  if (input.longPct != null && input.longPct > 70) {
    warnings.push(`${input.longPct.toFixed(0)}% of accounts are long — positioning is one-sided.`);
  }

  const confirmation: Omit<DerivativesConfirmation, 'score' | 'confirms'> = {
    symbol: input.symbol.toUpperCase(),
    fundingRate: input.fundingRate,
    fundingAnnualizedPct,
    openInterestUsd: input.openInterestUsd,
    oiChange24hPct,
    longPct: input.longPct,
    netLiquidationUsd,
    regime,
    warnings,
    sources: input.sources,
    observedAt: now,
  };

  const score = scoreDerivatives(confirmation);
  const confirms = input.priceChange24h == null
    ? null
    : (input.priceChange24h > 0 ? score >= 50 : score <= 50);

  return { ...confirmation, score, confirms };
}

/**
 * 0..100 confirmation score.
 *
 * Note the deliberate non-monotonicity of funding: mildly positive funding
 * supports an advance, but extreme funding subtracts, because crowded leverage
 * is a fragility rather than a strength.
 */
/**
 * Funding -> confirmation, as a TENT rather than a straight line.
 *
 * This non-monotonicity is the whole point. Mildly positive funding means longs
 * are paying to hold an advancing market: healthy confirmation. Extremely
 * positive funding means the same trade has become crowded and expensive to
 * hold, which is fragility, not strength — so past the "rich" threshold the
 * curve turns and falls BELOW neutral.
 *
 *   f = 0      -> 50   (neutral)
 *   f = +30%   -> 75   (peak confirmation)
 *   f = +60%   -> 50   (back to neutral: the crowding cancels the momentum)
 *   f >= +90%  -> 25   (crowded leverage actively subtracts)
 *
 * Symmetric on the negative side, where a deeply negative rate is squeeze fuel.
 */
export function fundingConfirmation(annualizedPct: number): number {
  const sign = Math.sign(annualizedPct);
  const magnitude = Math.abs(annualizedPct);
  if (magnitude <= FUNDING_RICH_ANNUAL_PCT) {
    return clamp(50 + sign * 25 * (magnitude / FUNDING_RICH_ANNUAL_PCT));
  }
  const excess = Math.min(1, (magnitude - FUNDING_RICH_ANNUAL_PCT) / (2 * FUNDING_RICH_ANNUAL_PCT));
  return clamp(50 + sign * 25 * (1 - 2 * excess));
}

/** Share of accounts that are long, above which positioning is one-sided. */
export const CROWDED_LONG_PCT = 70;

/**
 * Long/short account share -> confirmation, also a tent.
 *
 * A modest long lean confirms an advance. Past ~70/30 the crowd IS the trade,
 * and the marginal buyer is already in — so confirmation decays back toward
 * neutral rather than continuing to rise.
 */
export function positioningConfirmation(longPct: number): number {
  const skew = longPct - 50;                       // -50..+50
  const peak = CROWDED_LONG_PCT - 50;              // 20
  const magnitude = Math.abs(skew);
  const effective = magnitude <= peak
    ? magnitude
    : Math.max(0, peak - (magnitude - peak));      // decays past the peak
  return clamp(50 + Math.sign(skew) * 25 * (effective / peak));
}

export function scoreDerivatives(
  c: Omit<DerivativesConfirmation, 'score' | 'confirms'>,
): number {
  const parts: { value: number; weight: number }[] = [];

  if (c.oiChange24hPct != null) {
    parts.push({ value: scaleAround(c.oiChange24hPct, 0, 15), weight: 0.3 });
  }

  if (c.fundingAnnualizedPct != null) {
    parts.push({ value: fundingConfirmation(c.fundingAnnualizedPct), weight: 0.25 });
  }

  if (c.longPct != null) {
    parts.push({ value: positioningConfirmation(c.longPct), weight: 0.2 });
  }

  if (c.netLiquidationUsd != null) {
    // More shorts liquidated than longs = upward pressure.
    const magnitude = Math.abs(c.netLiquidationUsd);
    if (magnitude > 0) {
      parts.push({ value: scaleAround(Math.sign(c.netLiquidationUsd), 0, 1), weight: 0.15 });
    }
  }

  const REGIME_BIAS: Record<PositioningRegime, number> = {
    short_squeeze: 75, long_crowding: 58, short_build: 40,
    long_unwind: 35, deleveraging: 45, balanced: 50,
  };
  parts.push({ value: REGIME_BIAS[c.regime], weight: 0.1 });

  const wsum = parts.reduce((s, p) => s + p.weight, 0);
  return wsum > 0 ? clamp(parts.reduce((s, p) => s + p.value * p.weight, 0) / wsum) : 50;
}
