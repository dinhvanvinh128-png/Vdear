/**
 * WHALE ENGINE (spec: WHALE ENGINE).
 *
 * ── An honest statement of what is and is not possible for free ─────────────
 * The spec asks for large transfers classified as Exchange→Wallet,
 * Wallet→Exchange and Wallet→Wallet. That classification requires a labelled
 * address database (which exchange owns which deposit address). No free API
 * publishes one, so VDEAR reports whale activity in TWO clearly-separated tiers
 * and never blurs them:
 *
 *   TIER 1 — CEX WHALE FILLS (free, always on, exact).
 *     Real executed trades above a USD threshold, taker side known. This is not
 *     a proxy for on-chain movement; it is order-flow evidence in its own right,
 *     and it is what the spec's $100K/$500K/$1M/$5M/$10M+ buckets describe.
 *
 *   TIER 2 — EXCHANGE FLOW (requires CryptoQuant or Glassnode).
 *     Actual inflow/outflow/netflow and exchange reserve. Absent a key this is
 *     reported as unavailable — NOT approximated from tier 1, because trades on
 *     an exchange say nothing about coins moving to or from it.
 *
 * The whale score uses whichever tiers are present and says which they were.
 */
import type { ExchangeId, Trade } from '@/lib/types';
import type { OnChainSeries } from '@/lib/providers/onchain/types';
import type { ProviderId } from '@/lib/providers/types';
import { clamp, pctChange, scaleAround } from '@/lib/indicators/series';
import { latestZScore } from '@/lib/indicators/zscore';

/** USD buckets from the spec. */
export const WHALE_TIERS = [100_000, 500_000, 1_000_000, 5_000_000, 10_000_000] as const;
export type WhaleTier = (typeof WHALE_TIERS)[number];

export interface WhaleBucket {
  threshold: WhaleTier;
  count: number;
  buyUsd: number;
  sellUsd: number;
  netUsd: number;
}

export interface WhaleFill {
  exchange: ExchangeId;
  price: number;
  usd: number;
  side: 'buy' | 'sell';
  timestamp: number;
}

export interface ExchangeFlowSummary {
  /** Positive = coins moving ONTO exchanges (supply arriving to be sold). */
  netflowLatest: number;
  netflow7dAvg: number | null;
  zScore: number | null;
  reserveChange30d: number | null;
  source: ProviderId;
  observedAt: number;
}

export type WhaleTierAvailability = 'cex_fills' | 'exchange_flow';

export interface WhaleActivity {
  symbol: string;

  /** TIER 1 */
  buckets: WhaleBucket[];
  largestFills: WhaleFill[];
  totalWhaleBuyUsd: number;
  totalWhaleSellUsd: number;
  whaleNetUsd: number;
  /** buy / (buy + sell) among whale-sized fills. Null when there were none. */
  whaleBuyRatio: number | null;
  /** Window the fill sample covers, in ms — usually minutes. */
  fillWindowMs: number;

  /** TIER 2 — null when no provider is configured. */
  exchangeFlow: ExchangeFlowSummary | null;
  /** Human-readable explanation when tier 2 is absent. */
  exchangeFlowNote: string | null;

  score: number;
  /** Which tiers actually contributed to the score. */
  tiers: WhaleTierAvailability[];
  sources: (ExchangeId | ProviderId)[];
  observedAt: number;
}

/** Bucket real fills by USD size. Buckets are cumulative (>= threshold). */
export function bucketFills(fills: readonly WhaleFill[]): WhaleBucket[] {
  return WHALE_TIERS.map((threshold) => {
    let count = 0, buyUsd = 0, sellUsd = 0;
    for (const f of fills) {
      if (f.usd < threshold) continue;
      count++;
      if (f.side === 'buy') buyUsd += f.usd;
      else sellUsd += f.usd;
    }
    return { threshold, count, buyUsd, sellUsd, netUsd: buyUsd - sellUsd };
  });
}

export function toWhaleFills(trades: readonly Trade[], minUsd = WHALE_TIERS[0]): WhaleFill[] {
  const out: WhaleFill[] = [];
  for (const t of trades) {
    const usd = t.price * t.size;
    if (!Number.isFinite(usd) || usd < minUsd) continue;
    out.push({ exchange: t.exchange, price: t.price, usd, side: t.side, timestamp: t.timestamp });
  }
  return out.sort((a, b) => b.usd - a.usd);
}

export function summarizeExchangeFlow(
  netflow: OnChainSeries | null, reserve: OnChainSeries | null,
): ExchangeFlowSummary | null {
  if (!netflow || netflow.points.length === 0) return null;
  const points = netflow.points;
  const values = points.map((p) => p.value);
  const latest = points[points.length - 1]!;

  const recent = values.slice(-7);
  const netflow7dAvg = recent.length > 0
    ? recent.reduce((s, v) => s + v, 0) / recent.length
    : null;

  let reserveChange30d: number | null = null;
  if (reserve && reserve.points.length > 1) {
    const rp = reserve.points;
    const target = rp[rp.length - 1]!.time - 30 * 86_400_000;
    let past: number | null = null;
    for (const p of rp) {
      if (p.time <= target) past = p.value;
      else break;
    }
    reserveChange30d = pctChange(past, rp[rp.length - 1]!.value);
  }

  return {
    netflowLatest: latest.value,
    netflow7dAvg,
    zScore: latestZScore(values, Math.min(30, Math.max(2, values.length - 1))),
    reserveChange30d,
    source: netflow.source,
    observedAt: latest.time,
  };
}

export interface WhaleInput {
  symbol: string;
  trades: readonly Trade[];
  netflow: OnChainSeries | null;
  reserve: OnChainSeries | null;
  /** Why tier 2 is missing, when it is. */
  flowUnavailableReason?: string;
  now?: number;
}

export function computeWhaleActivity(input: WhaleInput): WhaleActivity {
  const now = input.now ?? Date.now();
  const fills = toWhaleFills(input.trades);
  const buckets = bucketFills(fills);

  const totalWhaleBuyUsd = fills.filter((f) => f.side === 'buy').reduce((s, f) => s + f.usd, 0);
  const totalWhaleSellUsd = fills.filter((f) => f.side === 'sell').reduce((s, f) => s + f.usd, 0);
  const totalWhale = totalWhaleBuyUsd + totalWhaleSellUsd;

  const times = fills.map((f) => f.timestamp).filter((t) => t > 0);
  const fillWindowMs = times.length > 1 ? Math.max(...times) - Math.min(...times) : 0;

  const exchangeFlow = summarizeExchangeFlow(input.netflow, input.reserve);

  const tiers: WhaleTierAvailability[] = [];
  if (fills.length > 0) tiers.push('cex_fills');
  if (exchangeFlow) tiers.push('exchange_flow');

  const sources: (ExchangeId | ProviderId)[] = Array.from(new Set(fills.map((f) => f.exchange)));
  if (exchangeFlow) sources.push(exchangeFlow.source);

  const activity: Omit<WhaleActivity, 'score'> = {
    symbol: input.symbol.toUpperCase(),
    buckets,
    largestFills: fills.slice(0, 25),
    totalWhaleBuyUsd,
    totalWhaleSellUsd,
    whaleNetUsd: totalWhaleBuyUsd - totalWhaleSellUsd,
    whaleBuyRatio: totalWhale > 0 ? totalWhaleBuyUsd / totalWhale : null,
    fillWindowMs,
    exchangeFlow,
    exchangeFlowNote: exchangeFlow ? null : (
      input.flowUnavailableReason
      ?? 'Exchange in/out flow needs CryptoQuant or Glassnode — not configured. '
        + 'It is reported as unavailable rather than estimated from trade data, '
        + 'because trades on an exchange do not indicate coins moving to or from it.'
    ),
    tiers,
    sources,
    observedAt: now,
  };

  return { ...activity, score: scoreWhale(activity) };
}

/**
 * 0..100. 50 = no whale edge either way.
 *
 * Exchange NETFLOW is inverted on purpose: coins moving ONTO exchanges is
 * supply arriving to be sold (bearish), coins leaving is accumulation into
 * self-custody (bullish). When both tiers are present, flow outweighs fills —
 * it is the slower, higher-conviction signal.
 */
export function scoreWhale(a: Omit<WhaleActivity, 'score'>): number {
  const parts: { value: number; weight: number }[] = [];

  if (a.whaleBuyRatio != null) {
    parts.push({ value: scaleAround(a.whaleBuyRatio, 0.5, 0.3), weight: 0.4 });
  }

  if (a.exchangeFlow) {
    const f = a.exchangeFlow;
    if (f.zScore != null) {
      // Negative netflow (outflow) is bullish -> invert the z-score.
      parts.push({ value: scaleAround(-f.zScore, 0, 2), weight: 0.6 });
    }
    if (f.reserveChange30d != null) {
      // Falling reserves = accumulation.
      parts.push({ value: scaleAround(-f.reserveChange30d, 0, 10), weight: 0.4 });
    }
  }

  if (parts.length === 0) return 50;
  const wsum = parts.reduce((s, p) => s + p.weight, 0);
  return clamp(parts.reduce((s, p) => s + p.value * p.weight, 0) / wsum);
}
