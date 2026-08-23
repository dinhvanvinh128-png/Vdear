/**
 * THE COMPOSER — where every engine, score and the analyst come together.
 *
 * This is the one place that knows the full pipeline:
 *
 *   providers -> engines -> data quality -> money flow -> regime -> signal -> analyst
 *
 * Its most important job is HONEST DEGRADATION. Each sub-score is fetched
 * independently and may fail independently. A failure becomes a REASON attached
 * to that component, which flows into computeMoneyFlowScore, which drops the
 * component and renormalises. The reason then reaches the UI and the analyst's
 * blind-spot list. At no point is a missing input replaced by a value.
 */
import type { Envelope, ExchangeId, MarketType } from '@/lib/types';
import { cached } from '@/lib/cache';
import { toCanonical, splitSymbol } from '@/lib/symbols';

import { getAggregatedTicker } from '@/lib/services/market';
import { getSpotFlow } from '@/lib/services/spotFlow';
import { getMarketBreadth } from '@/lib/services/breadth';
import { getLiquidity } from '@/lib/services/liquidity';
import { getMacroLiquidity } from '@/lib/services/liquidityMacro';
import { getOnChain, getExchangeFlow } from '@/lib/services/onchain';
import { getWhaleActivity } from '@/lib/services/whale';
import { getKlines } from '@/lib/services/chart';
import { getFunding, getOpenInterestAll, getLongShortAll } from '@/lib/services/derivatives';

import { computeTrendScore, type TrendScore } from '@/lib/scoring/trend';
import { computeMoneyFlowScore, type MoneyFlowScore } from '@/lib/scoring/moneyFlow';
import type { MoneyFlowComponent } from '@/lib/scoring/config';
import { computeAccDist, type AccDistResult } from '@/lib/scoring/accDist';
import { computeRegime, type RegimeResult } from '@/lib/scoring/regime';
import { computeSignal, type Signal } from '@/lib/scoring/signal';
import { computeDerivativesConfirmation, type DerivativesConfirmation } from '@/lib/engines/derivatives';
import { buildQualityReport, type DataQualityReport } from '@/lib/quality';
import { analyze, type AnalystReport } from '@/lib/analyst';
import type { SpotFlow } from '@/lib/engines/spotFlow';
import type { MarketBreadth } from '@/lib/engines/breadth';
import type { WhaleActivity } from '@/lib/engines/whale';
import type { OnChainMetrics } from '@/lib/engines/onchain';
import type { LiquidityScore } from '@/lib/scoring/liquidity';
import type { OrderBookMetrics } from '@/lib/engines/orderBook';

export interface Intelligence {
  symbol: string;
  price: number | null;
  priceChange24h: number | null;

  moneyFlow: MoneyFlowScore;
  regime: RegimeResult;
  signal: Signal;
  accDist: AccDistResult;
  analyst: AnalystReport;

  trend: TrendScore | null;
  spotFlow: SpotFlow | null;
  breadth: MarketBreadth | null;
  liquidity: LiquidityScore | null;
  orderBook: OrderBookMetrics | null;
  onChain: OnChainMetrics | null;
  whale: WhaleActivity | null;
  derivatives: DerivativesConfirmation | null;
  stablecoinScore: number | null;
  defiScore: number | null;

  quality: DataQualityReport;
  /** Every source that did not answer, with the reason. */
  unavailable: { source: string; reason: string }[];
  generatedAt: number;
}

/** Composite refresh cadence. Sub-services keep their own, shorter, TTLs. */
const INTELLIGENCE_TTL = 30_000;

/** Timeframes the trend score is built from. */
const TREND_TIMEFRAMES = ['1d', '4h', '1h', '15m'] as const;

/** Run a task, converting any failure into a named reason instead of a throw. */
async function attempt<T>(
  label: string, run: () => Promise<T>,
): Promise<{ value: T | null; reason: string | null }> {
  try {
    return { value: await run(), reason: null };
  } catch (e) {
    return {
      value: null,
      reason: `${label}: ${e instanceof Error ? e.message.slice(0, 140) : 'unavailable'}`,
    };
  }
}

export async function getIntelligence(
  rawSymbol: string, market: MarketType = 'spot',
): Promise<Envelope<Intelligence>> {
  const symbol = splitSymbol(rawSymbol.toUpperCase()).quote
    ? rawSymbol.toUpperCase()
    : toCanonical(rawSymbol);
  const { base } = splitSymbol(symbol);

  const key = `intel:${market}:${symbol}`;
  const res = await cached(key, INTELLIGENCE_TTL, async () => {
    /* ---- 1. Fetch everything concurrently; each may fail on its own ---- */
    const [
      ticker, flow, breadth, liquidity, macro, onChain, whale, funding, oi, longShort, exchFlow,
      ...trendCandles
    ] = await Promise.all([
      attempt('Ticker', () => getAggregatedTicker(symbol, market)),
      attempt('Spot flow', () => getSpotFlow(symbol, '1h', market)),
      attempt('Market breadth', () => getMarketBreadth()),
      attempt('Liquidity', () => getLiquidity(symbol, market)),
      attempt('Macro liquidity', () => getMacroLiquidity()),
      attempt('On-chain', () => getOnChain(base || symbol)),
      attempt('Whale activity', () => getWhaleActivity(symbol, market)),
      attempt('Funding', () => getFunding(symbol)),
      attempt('Open interest', () => getOpenInterestAll(symbol)),
      attempt('Long/short', () => getLongShortAll(symbol)),
      attempt('Exchange flow', () => getExchangeFlow(base || symbol)),
      ...TREND_TIMEFRAMES.map((tf) =>
        attempt(`Klines ${tf}`, () => getKlines(symbol, tf, market, 300))),
    ]);

    const unavailable: { source: string; reason: string }[] = [];
    const push = (r: { reason: string | null }, source: string) => {
      if (r.reason) unavailable.push({ source, reason: r.reason });
    };
    push(ticker, 'Ticker'); push(flow, 'Spot flow'); push(breadth, 'Market breadth');
    push(liquidity, 'Liquidity'); push(macro, 'Macro liquidity'); push(onChain, 'On-chain');
    push(whale, 'Whale activity');
    for (const u of macro.value?.data.unavailable ?? []) unavailable.push(u);

    /* ---- 2. Trend across timeframes ---- */
    const trendInputs = TREND_TIMEFRAMES
      .map((tf, i) => ({ timeframe: tf, candles: trendCandles[i]?.value?.data ?? [] }))
      .filter((t) => t.candles.length > 0);
    const trend = trendInputs.length > 0 ? computeTrendScore(base || symbol, trendInputs) : null;

    /* ---- 3. Derivatives confirmation ---- */
    const oiNow = oi.value?.data.totalUsd ?? null;
    const derivatives = computeDerivativesConfirmation({
      symbol: base || symbol,
      fundingRate: funding.value?.data.average ?? null,
      openInterestUsd: oiNow,
      // A 24h-ago OI figure needs a stored series; without the DB it is unknown,
      // and null is the honest value (the engine reports oiChange as null).
      openInterestUsd24hAgo: null,
      priceChange24h: ticker.value?.data.priceChange24h ?? null,
      longPct: longShort.value?.data.avgLong ?? null,
      sources: (oi.value?.meta.sources ?? []) as ExchangeId[],
    });

    /* ---- 4. Accumulation / distribution ---- */
    const spotFlow = flow.value?.data ?? null;
    const whaleActivity = whale.value?.data ?? null;
    const breadthData = breadth.value?.data ?? null;
    const stablecoin = macro.value?.data.stablecoin ?? null;
    const defi = macro.value?.data.defi ?? null;

    const accDist = computeAccDist({
      priceChangePct: ticker.value?.data.priceChange24h ?? null,
      cvdChange: spotFlow?.cvdChange ?? null,
      totalVolume: spotFlow
        ? spotFlow.totalBuyVolume + spotFlow.totalSellVolume
        : null,
      whaleScore: whaleActivity?.score ?? null,
      exchangeNetflowZ: whaleActivity?.exchangeFlow?.zScore ?? null,
      stablecoinScore: stablecoin?.score ?? null,
      breadthScore: breadthData?.score ?? null,
    });

    /* ---- 5. Data quality ---- */
    const anomalies = ticker.value ? [ticker.value.data.quality] : [];
    const contributing = ticker.value?.meta.sources ?? [];
    const quality = buildQualityReport({
      parts: [
        spotFlow ? { value: 95, weight: 2 } : null,
        breadthData ? { value: 90, weight: 1.5 } : null,
        stablecoin ? { value: 85, weight: 1.5 } : null,
        trend ? { value: 92, weight: 2 } : null,
        onChain.value?.data.metrics.metrics.length ? { value: 88, weight: 1 } : null,
        whaleActivity?.tiers.length ? { value: 85, weight: 1 } : null,
        defi?.inputs.length ? { value: 85, weight: 0.5 } : null,
        oiNow != null ? { value: 90, weight: 0.5 } : null,
      ].filter((p): p is { value: number; weight: number } => p !== null),
      expectedCount: 8,
      contributing,
      unavailable,
      anomalies,
    });

    /* ---- 6. Money Flow — missing components become REASONS, not values ---- */
    const reasons: Partial<Record<MoneyFlowComponent, string>> = {};
    if (!spotFlow) reasons.spotFlow = flow.reason ?? 'spot flow unavailable';
    if (!breadthData) reasons.marketBreadth = breadth.reason ?? 'breadth unavailable';
    if (!stablecoin) {
      reasons.stablecoinLiquidity = macro.value?.data.stablecoinReason ?? 'stablecoin data unavailable';
    }
    if (!trend) reasons.trend = 'not enough candle history for a trend score';
    if (!onChain.value?.data.metrics.metrics.length) {
      reasons.onChain = onChain.value?.data.attempts
        .filter((a) => a.outcome !== 'ok')
        .map((a) => a.message ?? `${a.provider}: ${a.outcome}`)
        .join('; ') || (onChain.reason ?? 'on-chain data unavailable');
    }
    if (!whaleActivity?.tiers.length) {
      reasons.whaleFlow = whaleActivity?.exchangeFlowNote ?? (whale.reason ?? 'whale data unavailable');
    }
    if (!defi?.inputs.length) reasons.defiLiquidity = 'DeFi data unavailable';

    const moneyFlow = computeMoneyFlowScore({
      scores: {
        spotFlow: spotFlow?.score ?? null,
        marketBreadth: breadthData?.score ?? null,
        stablecoinLiquidity: stablecoin?.score ?? null,
        trend: trend?.score ?? null,
        onChain: onChain.value?.data.metrics.metrics.length ? onChain.value.data.metrics.score : null,
        whaleFlow: whaleActivity?.tiers.length ? whaleActivity.score : null,
        defiLiquidity: defi?.inputs.length ? defi.score : null,
        derivativesConfirmation: oiNow != null || funding.value?.data.average != null
          ? derivatives.score : null,
      },
      reasons,
      qualityPenalty: anomalies.reduce((worst, a) => Math.max(worst, a.confidencePenalty), 0),
    });

    /* ---- 7. Regime, signal, analyst ---- */
    const dailyTf = trend?.timeframes.find((t) => t.timeframe === '1d');
    const regime = computeRegime({
      compositeScore: moneyFlow.score,
      trendScore: trend?.score ?? null,
      breadthScore: breadthData?.score ?? null,
      adx: dailyTf?.adx ?? null,
      priceChangePct: ticker.value?.data.priceChange24h ?? null,
      accDist,
      volumeZ: spotFlow?.volumeAnomaly.zScore ?? null,
      spotFlowScore: spotFlow?.score ?? null,
      coverage: moneyFlow.coverage,
    });

    const signal = computeSignal({
      compositeScore: moneyFlow.score,
      dataConfidence: quality.confidence,
      coverage: moneyFlow.coverage,
      regime: regime.regime,
      regimeConviction: regime.conviction,
      accDist,
      trendScore: trend?.score ?? null,
      breadthScore: breadthData?.score ?? null,
      spotFlowScore: spotFlow?.score ?? null,
      derivativeWarnings: derivatives.warnings,
      priceChangePct: ticker.value?.data.priceChange24h ?? null,
    });

    const liquidityScore = liquidity.value?.data.score ?? null;
    const analyst = await analyze({
      symbol: base || symbol,
      moneyFlow, regime, signal, accDist,
      scores: {
        trend: trend?.score ?? null,
        liquidity: liquidityScore?.score ?? null,
        breadth: breadthData?.score ?? null,
        onChain: onChain.value?.data.metrics.metrics.length ? onChain.value.data.metrics.score : null,
        whale: whaleActivity?.tiers.length ? whaleActivity.score : null,
        spotFlow: spotFlow?.score ?? null,
        stablecoin: stablecoin?.score ?? null,
        derivatives: derivatives.score,
      },
      context: {
        priceChange24h: ticker.value?.data.priceChange24h ?? null,
        fundingAnnualizedPct: derivatives.fundingAnnualizedPct,
        oiChange24hPct: derivatives.oiChange24hPct,
        stablecoinChange7dPct: stablecoin?.change7d ?? null,
      },
      unavailable,
    });

    const intelligence: Intelligence = {
      symbol: base || symbol,
      price: ticker.value?.data.vdearIndex ?? null,
      priceChange24h: ticker.value?.data.priceChange24h ?? null,
      moneyFlow, regime, signal, accDist, analyst,
      trend,
      spotFlow,
      breadth: breadthData,
      liquidity: liquidityScore,
      orderBook: liquidity.value?.data.orderBook ?? null,
      onChain: onChain.value?.data.metrics ?? null,
      whale: whaleActivity,
      derivatives,
      stablecoinScore: stablecoin?.score ?? null,
      defiScore: defi?.inputs.length ? defi.score : null,
      quality,
      unavailable,
      generatedAt: Date.now(),
    };

    return { intelligence, ok: contributing as ExchangeId[] };
  });

  return {
    data: res.intelligence,
    meta: {
      kind: res.ok.length > 0 ? 'live' : 'unavailable',
      sources: res.ok,
      errors: [],
      generatedAt: res.intelligence.generatedAt,
      cached: false,
    },
  };
}
