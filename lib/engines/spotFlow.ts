/**
 * SPOT FLOW ENGINE — the most important module in VDEAR (spec: SPOT FLOW ENGINE).
 *
 * Produces CVD, volume delta, buy/sell pressure, volume anomaly and VWAP
 * deviation from REAL taker-side data. Nothing here is assumed or simulated.
 *
 * ── How the buy/sell split is obtained, and why it matters ──────────────────
 * Splitting volume into aggressive buying and aggressive selling requires the
 * TAKER side of each trade. There are two honest ways to get it:
 *
 *   A. Taker-buy volume published per candle. Exact, and available for the full
 *      kline history, so CVD can be computed on 5m/15m/1H/4H/1D.
 *      Of the four venues VDEAR integrates, only BINANCE publishes this.
 *   B. Recent individual fills, each carrying its taker side. Also exact, but a
 *      recent-trades endpoint returns roughly the last 1000 fills — minutes of
 *      history on a liquid pair, not days.
 *
 * So: long-horizon CVD comes from (A), short-horizon confirmation from (B), and
 * every result records which venues contributed and over what horizon. A venue
 * that publishes neither is EXCLUDED — it is never given an assumed 50/50 split,
 * because a fabricated neutral reading would quietly dilute a real signal.
 */
import type { ExchangeId, FlowCandle, Trade } from '@/lib/types';
import { classifyAnomaly, latestZScore, type AnomalyLabel } from '@/lib/indicators/zscore';
import { vwap, vwapDeviation, type VwapBar } from '@/lib/indicators/vwap';
import { clamp, scaleAround } from '@/lib/indicators/series';

/** Timeframes the spec asks for. */
export const FLOW_TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d'] as const;
export type FlowTimeframe = (typeof FLOW_TIMEFRAMES)[number];

export interface CvdPoint {
  time: number;         // seconds epoch
  buyVolume: number;    // quote (USDT)
  sellVolume: number;   // quote (USDT)
  delta: number;        // buy - sell
  cumulative: number;   // running sum of delta
  close: number;
}

export interface VolumeAnomaly {
  /** z-score of the latest candle's volume vs the preceding window. */
  zScore: number | null;
  label: AnomalyLabel | null;
  latestVolume: number;
  averageVolume: number | null;
}

export interface SpotFlow {
  symbol: string;
  timeframe: FlowTimeframe;
  points: CvdPoint[];

  /**
   * Cumulative delta over the whole window (quote currency), or null when no
   * venue published a taker split for this pair.
   *
   * Null rather than 0 on purpose. A CVD of exactly zero means buying and
   * selling cancelled out — a real, informative reading. "We could not measure
   * it" is a different statement and must not borrow that number.
   */
  cvd: number | null;
  /** Delta of the most recent closed candle. Null when unmeasured. */
  volumeDelta: number | null;
  /** CVD change over the last N candles, for divergence detection. Null when unmeasured. */
  cvdChange: number | null;

  totalBuyVolume: number;
  totalSellVolume: number;
  /** buyVolume / totalVolume, 0..1. Null when nothing traded. */
  buyPressure: number | null;
  sellPressure: number | null;

  volumeAnomaly: VolumeAnomaly;

  /** Session VWAP over the window and where price sits relative to it. */
  vwap: number | null;
  vwapDeviationPct: number | null;

  /**
   * 0..100 — aggressive buying vs selling, 50 = balanced. Null when no taker
   * split was available, so the composite drops this component and renormalises
   * the remaining weights instead of scoring it neutral.
   */
  score: number | null;

  /** Which venues supplied a real taker split. */
  sources: ExchangeId[];
  /** Venues excluded because they publish no taker side (NOT assumed neutral). */
  excluded: ExchangeId[];
  candleCount: number;
}

/**
 * Build CVD from candles that carry a taker-buy split.
 *
 * sell = quoteVolume - takerBuyQuote, which is exact rather than modelled.
 * A candle without a split is skipped, not halved.
 */
export function buildCvd(candles: readonly FlowCandle[]): CvdPoint[] {
  const points: CvdPoint[] = [];
  let cumulative = 0;
  for (const c of candles) {
    if (c.takerBuyQuote == null) continue;
    const total = c.quoteVolume > 0 ? c.quoteVolume : 0;
    const buy = Math.max(0, Math.min(total, c.takerBuyQuote));
    const sell = Math.max(0, total - buy);
    const delta = buy - sell;
    cumulative += delta;
    points.push({ time: c.time, buyVolume: buy, sellVolume: sell, delta, cumulative, close: c.close });
  }
  return points;
}

/**
 * Merge the same timeframe across venues by candle time.
 *
 * Volume is additive across venues, so summing buy and sell per timestamp gives
 * a market-wide delta. Only venues that reported a real split reach this point.
 */
export function mergeCvd(perExchange: CvdPoint[][]): CvdPoint[] {
  const byTime = new Map<string, { buy: number; sell: number; close: number; n: number }>();
  for (const series of perExchange) {
    for (const p of series) {
      const key = String(p.time);
      const acc = byTime.get(key);
      if (acc) {
        acc.buy += p.buyVolume;
        acc.sell += p.sellVolume;
        acc.close += p.close;
        acc.n += 1;
      } else {
        byTime.set(key, { buy: p.buyVolume, sell: p.sellVolume, close: p.close, n: 1 });
      }
    }
  }
  const times = Array.from(byTime.keys()).map(Number).sort((a, b) => a - b);
  let cumulative = 0;
  return times.map((time) => {
    const a = byTime.get(String(time))!;
    const delta = a.buy - a.sell;
    cumulative += delta;
    return {
      time, buyVolume: a.buy, sellVolume: a.sell, delta, cumulative,
      close: a.close / a.n, // simple mean across venues for the reference price
    };
  });
}

/** Volume anomaly from the candle series (z-score against the prior window). */
export function detectVolumeAnomaly(
  candles: readonly { quoteVolume: number }[], lookback = 30,
): VolumeAnomaly {
  const volumes = candles.map((c) => c.quoteVolume);
  const latestVolume = volumes.length > 0 ? volumes[volumes.length - 1]! : 0;
  const z = latestZScore(volumes, lookback);
  const window = volumes.slice(-lookback - 1, -1);
  const averageVolume = window.length > 0
    ? window.reduce((s, v) => s + v, 0) / window.length
    : null;
  return { zScore: z, label: classifyAnomaly(z), latestVolume, averageVolume };
}

/**
 * Spot-flow score, 0..100.
 *
 * Built from buy pressure (how one-sided the flow is) and the CVD trend (is the
 * imbalance building or fading), because either alone is misleading: strong
 * buying that is already decelerating is a different market from strong buying
 * that is accelerating.
 */
export function scoreSpotFlow(points: readonly CvdPoint[]): number | null {
  // No measurement is not a neutral measurement. Returning 50 here would hand
  // the composite a confident "balanced" reading for a pair nobody published
  // taker data for, and it would count towards coverage and confidence as if it
  // were evidence. Null makes the component drop out and the weights renormalise.
  if (points.length === 0) return null;

  const totalBuy = points.reduce((s, p) => s + p.buyVolume, 0);
  const totalSell = points.reduce((s, p) => s + p.sellVolume, 0);
  const total = totalBuy + totalSell;
  if (total <= 0) return null;

  // 1) Overall imbalance. 50% buy = 50 points; each 10pp of skew moves it 20.
  const buyShare = totalBuy / total;
  const pressureScore = scaleAround(buyShare, 0.5, 0.25);

  // 2) Is cumulative delta rising or falling across the window?
  const recent = points.slice(-Math.max(3, Math.floor(points.length / 4)));
  const first = recent[0]!.cumulative;
  const last = recent[recent.length - 1]!.cumulative;
  const trendDelta = last - first;
  // Normalise the move against the window's own turnover so it is comparable
  // across assets and regimes.
  const turnover = recent.reduce((s, p) => s + p.buyVolume + p.sellVolume, 0);
  const trendScore = turnover > 0 ? scaleAround(trendDelta / turnover, 0, 0.3) : 50;

  return clamp(pressureScore * 0.6 + trendScore * 0.4);
}

export interface ComputeFlowInput {
  symbol: string;
  timeframe: FlowTimeframe;
  /** One entry per venue that reported a real taker split. */
  perExchange: { exchange: ExchangeId; candles: FlowCandle[] }[];
  /** Venues queried that publish no taker side. Recorded, never imputed. */
  excluded: ExchangeId[];
  lookback?: number;
}

export function computeSpotFlow(input: ComputeFlowInput): SpotFlow {
  const { symbol, timeframe, excluded, lookback = 30 } = input;
  const usable = input.perExchange.filter((e) => e.candles.length > 0);

  const perExchangeCvd = usable.map((e) => buildCvd(e.candles));
  const points = perExchangeCvd.length === 1
    ? perExchangeCvd[0]!
    : mergeCvd(perExchangeCvd);

  const totalBuyVolume = points.reduce((s, p) => s + p.buyVolume, 0);
  const totalSellVolume = points.reduce((s, p) => s + p.sellVolume, 0);
  const totalVolume = totalBuyVolume + totalSellVolume;

  // Volume anomaly is measured on the deepest single series so the z-score is
  // not distorted by a venue joining or dropping out mid-window.
  const deepest = usable.reduce<FlowCandle[]>(
    (best, e) => (e.candles.length > best.length ? e.candles : best), [],
  );
  const volumeAnomaly = detectVolumeAnomaly(deepest, lookback);

  const vwapBars: VwapBar[] = deepest.map((c) => ({
    time: c.time, high: c.high, low: c.low, close: c.close, volume: c.volume,
  }));
  const vwapSeries = vwap(vwapBars, 'session');
  const vwapValue = vwapSeries.length > 0 ? vwapSeries[vwapSeries.length - 1] ?? null : null;
  const lastClose = points.length > 0 ? points[points.length - 1]!.close : null;

  const recentCount = Math.max(1, Math.min(points.length, 10));
  const cvdChange = points.length > 0
    ? points[points.length - 1]!.cumulative - points[points.length - recentCount]!.cumulative
    : null;

  return {
    symbol,
    timeframe,
    points,
    cvd: points.length > 0 ? points[points.length - 1]!.cumulative : null,
    volumeDelta: points.length > 0 ? points[points.length - 1]!.delta : null,
    cvdChange,
    totalBuyVolume,
    totalSellVolume,
    buyPressure: totalVolume > 0 ? totalBuyVolume / totalVolume : null,
    sellPressure: totalVolume > 0 ? totalSellVolume / totalVolume : null,
    volumeAnomaly,
    vwap: vwapValue,
    vwapDeviationPct: lastClose != null ? vwapDeviation(lastClose, vwapValue) : null,
    score: scoreSpotFlow(points),
    sources: usable.map((e) => e.exchange),
    excluded,
    candleCount: points.length,
  };
}

/* ------------------------- trade-derived (short horizon) ------------------- */

export interface TradeFlow {
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  delta: number;
  buyPressure: number | null;
  tradeCount: number;
  /** ms covered by the sample — usually minutes, so it is a confirmation only. */
  windowMs: number;
  sources: ExchangeId[];
}

/**
 * Flow from individual fills. Exact but SHORT — a recent-trades endpoint covers
 * minutes, not days — so this confirms the candle-derived CVD rather than
 * replacing it. `windowMs` is returned so callers can say how short.
 */
export function computeTradeFlow(trades: readonly Trade[]): TradeFlow {
  let buy = 0;
  let sell = 0;
  let minT = Number.POSITIVE_INFINITY;
  let maxT = 0;
  const sources = new Set<ExchangeId>();

  for (const t of trades) {
    const usd = t.price * t.size;
    if (!Number.isFinite(usd) || usd <= 0) continue;
    if (t.side === 'buy') buy += usd;
    else sell += usd;
    if (t.timestamp < minT) minT = t.timestamp;
    if (t.timestamp > maxT) maxT = t.timestamp;
    sources.add(t.exchange);
  }

  const total = buy + sell;
  return {
    buyVolumeUsd: buy,
    sellVolumeUsd: sell,
    delta: buy - sell,
    buyPressure: total > 0 ? buy / total : null,
    tradeCount: trades.length,
    windowMs: maxT > 0 && Number.isFinite(minT) ? maxT - minT : 0,
    sources: Array.from(sources),
  };
}
