/**
 * CROSS-SOURCE ANOMALY DETECTION (spec: DATA QUALITY ENGINE).
 *
 * The spec's own example: Binance BTC = 110,000 and OKX = 110,050 is normal;
 * Binance = 110,000 and OKX = 112,000 is a DATA ANOMALY. "Không được âm thầm
 * dùng dữ liệu sai" — never silently use bad data.
 *
 * The method matters. Comparing every venue to the MEAN is the obvious approach
 * and the wrong one: a single bad print drags the mean toward itself, shrinking
 * its own apparent deviation and inflating everyone else's. So the reference is
 * the MEDIAN, which a single outlier cannot move, and deviation is scaled by the
 * median absolute deviation where there are enough venues to compute one.
 *
 * An outlier is EXCLUDED from the index and REPORTED. It is never dropped
 * silently, and never quietly averaged in.
 */
import type { ExchangeId, Ticker } from '@/lib/types';

export type AnomalySeverity = 'none' | 'minor' | 'major' | 'critical';

export interface SourceDeviation {
  exchange: ExchangeId;
  price: number;
  /** Signed percent deviation from the median. */
  deviationPct: number;
  outlier: boolean;
}

export interface CrossSourceCheck {
  symbol: string;
  /** Median price across venues — the anomaly-resistant reference. */
  median: number | null;
  /** Spread across ALL responding venues. This is what severity keys off. */
  rawSpreadPct: number | null;
  /** Spread across only the venues kept for the index. */
  spreadPct: number | null;
  deviations: SourceDeviation[];
  /** Venues excluded from the index. */
  outliers: ExchangeId[];
  severity: AnomalySeverity;
  /** Present whenever severity is not 'none'. Safe to show in the UI. */
  message: string | null;
  /** 0..100 penalty to apply to confidence for this symbol. */
  confidencePenalty: number;
}

/**
 * Thresholds on the SPREAD BETWEEN VENUES, in percent.
 *
 * Severity keys off the spread rather than deviation-from-median because with
 * an even number of venues the median lands between them and halves every
 * deviation — two venues 0.8% apart each look only 0.4% off, and a real
 * divergence would slip through. The spread is what a human actually compares.
 *
 * Real cross-venue spread on a liquid pair is a few basis points; 0.5% is
 * already unusual, and past 1.5% a venue is stale, halted, or quoting a
 * different instrument.
 */
export const DEVIATION_THRESHOLDS = {
  minor: 0.5,
  major: 1.5,
  critical: 3.0,
} as const;

/**
 * Identifying WHICH venue is wrong needs a majority to disagree with it, so
 * exclusion requires at least three responding venues. With exactly two that
 * disagree, neither can be blamed — the honest outcome is to flag the anomaly,
 * exclude nothing, and take a large confidence penalty.
 */
export const MIN_SOURCES_TO_EXCLUDE = 3;

export function median(values: readonly number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v) && v > 0).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function severityFor(spreadPct: number): AnomalySeverity {
  if (spreadPct >= DEVIATION_THRESHOLDS.critical) return 'critical';
  if (spreadPct >= DEVIATION_THRESHOLDS.major) return 'major';
  if (spreadPct >= DEVIATION_THRESHOLDS.minor) return 'minor';
  return 'none';
}

/** Percent spread of a price set, relative to its lowest member. */
export function spreadOf(prices: readonly number[]): number {
  const valid = prices.filter((p) => Number.isFinite(p) && p > 0);
  if (valid.length < 2) return 0;
  const lo = Math.min(...valid);
  const hi = Math.max(...valid);
  return lo > 0 ? ((hi - lo) / lo) * 100 : 0;
}

export function checkCrossSource(symbol: string, tickers: readonly Ticker[]): CrossSourceCheck {
  const valid = tickers.filter((t) => Number.isFinite(t.price) && t.price > 0);

  if (valid.length === 0) {
    return {
      symbol, median: null, rawSpreadPct: null, spreadPct: null, deviations: [],
      outliers: [], severity: 'none', message: null, confidencePenalty: 0,
    };
  }

  // With a single source there is nothing to cross-check. Say so rather than
  // implying the value has been corroborated.
  if (valid.length === 1) {
    return {
      symbol, median: valid[0]!.price, rawSpreadPct: 0, spreadPct: 0,
      deviations: [{ exchange: valid[0]!.exchange, price: valid[0]!.price, deviationPct: 0, outlier: false }],
      outliers: [], severity: 'none',
      message: 'Single source — no cross-venue corroboration available.',
      confidencePenalty: 10,
    };
  }

  const med = median(valid.map((t) => t.price))!;
  const deviations: SourceDeviation[] = valid.map((t) => ({
    exchange: t.exchange,
    price: t.price,
    deviationPct: med > 0 ? ((t.price - med) / med) * 100 : 0,
    outlier: false,
  }));

  const rawSpreadPct = spreadOf(valid.map((t) => t.price));
  const severity = severityFor(rawSpreadPct);

  // Exclude at 'major' or worse, and only when a majority exists to disagree
  // with the outlier. A 0.5-1.5% gap is worth flagging but the venue is still
  // tradeable and its volume is real, so it stays in.
  if (severity === 'major' || severity === 'critical') {
    if (valid.length >= MIN_SOURCES_TO_EXCLUDE) {
      for (const d of deviations) {
        if (Math.abs(d.deviationPct) >= DEVIATION_THRESHOLDS.major / 2) d.outlier = true;
      }
    }
  }
  const outliers = deviations.filter((d) => d.outlier).map((d) => d.exchange);

  // Spread over the venues we actually keep.
  const spreadPct = spreadOf(deviations.filter((d) => !d.outlier).map((d) => d.price));

  return {
    symbol, median: med, rawSpreadPct, spreadPct, deviations, outliers, severity,
    message: severity === 'none' ? null : describeAnomaly(symbol, severity, deviations, med, outliers),
    confidencePenalty: PENALTY[severity],
  };
}

const PENALTY: Record<AnomalySeverity, number> = {
  none: 0, minor: 10, major: 30, critical: 55,
};

function describeAnomaly(
  symbol: string, severity: AnomalySeverity, deviations: SourceDeviation[],
  med: number, outliers: ExchangeId[],
): string {
  const worst = deviations.reduce((a, b) =>
    Math.abs(b.deviationPct) > Math.abs(a.deviationPct) ? b : a);
  const price = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });

  if (severity === 'minor') {
    return `${symbol}: ${worst.exchange} is ${worst.deviationPct.toFixed(2)}% from the `
      + `${price(med)} median across venues — wider than usual but within tradeable range.`;
  }

  if (outliers.length === 0) {
    // Two venues disagreeing: a real anomaly with no way to say which is wrong.
    const quotes = deviations
      .map((d) => `${d.exchange} ${price(d.price)}`)
      .join(' vs ');
    return `DATA ANOMALY — ${symbol}: ${quotes}. With only ${deviations.length} responding venues `
      + 'there is no majority to identify which is wrong, so neither is excluded and confidence '
      + 'in this symbol is reduced sharply.';
  }

  return `DATA ANOMALY — ${symbol}: ${worst.exchange} quotes ${price(worst.price)} against a `
    + `${price(med)} median (${worst.deviationPct.toFixed(2)}%). That venue is excluded from the `
    + 'index and from every score until it re-converges.';
}

/** The tickers safe to aggregate, with outliers removed. */
export function filterOutliers(tickers: readonly Ticker[], check: CrossSourceCheck): Ticker[] {
  if (check.outliers.length === 0) return tickers.slice();
  const bad = new Set(check.outliers);
  return tickers.filter((t) => !bad.has(t.exchange));
}
