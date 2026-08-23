/**
 * THE SINGLE SOURCE OF TRUTH FOR EVERY WEIGHT AND THRESHOLD.
 *
 * Spec: "Các trọng số phải nằm trong config để dễ thay đổi. Không hard-code
 * trong nhiều file." Nothing outside this file may define a weight, a threshold
 * or a regime cut-off. If a number decides something, it lives here.
 *
 * Changing a weight here changes the product everywhere — engine, API and UI —
 * with no other edit.
 */

/* ------------------------- MONEY FLOW SCORE WEIGHTS ------------------------ */

export interface MoneyFlowWeights {
  spotFlow: number;
  marketBreadth: number;
  stablecoinLiquidity: number;
  trend: number;
  onChain: number;
  whaleFlow: number;
  defiLiquidity: number;
  derivativesConfirmation: number;
}

/** Exactly the split the spec specifies. Sums to 100. */
export const MONEY_FLOW_WEIGHTS: MoneyFlowWeights = {
  spotFlow: 20,
  marketBreadth: 15,
  stablecoinLiquidity: 15,
  trend: 20,
  onChain: 10,
  whaleFlow: 10,
  defiLiquidity: 5,
  derivativesConfirmation: 5,
};

export type MoneyFlowComponent = keyof MoneyFlowWeights;

export const MONEY_FLOW_LABELS: Record<MoneyFlowComponent, string> = {
  spotFlow: 'Spot Flow',
  marketBreadth: 'Market Breadth',
  stablecoinLiquidity: 'Stablecoin Liquidity',
  trend: 'Trend',
  onChain: 'On-chain',
  whaleFlow: 'Whale Flow',
  defiLiquidity: 'DeFi Liquidity',
  derivativesConfirmation: 'Derivatives Confirmation',
};

/* ----------------------------- TREND SCORE -------------------------------- */

/**
 * Timeframe weights for the Trend Score. Weighted toward the higher timeframes:
 * the 1D structure decides the regime, the 15m only decides whether this is a
 * reasonable moment inside it.
 */
export const TREND_TIMEFRAME_WEIGHTS = {
  '1d': 0.40,
  '4h': 0.30,
  '1h': 0.20,
  '15m': 0.10,
} as const;

export type TrendTimeframe = keyof typeof TREND_TIMEFRAME_WEIGHTS;

/** What contributes within a single timeframe. */
export const TREND_COMPONENT_WEIGHTS = {
  emaAlignment: 0.40,   // price vs EMA20/50/200 and their ordering
  structure: 0.25,      // HH/HL vs LH/LL
  momentum: 0.20,       // RSI, positioned rather than thresholded
  volume: 0.15,         // is the move participating
} as const;

export const EMA_PERIODS = { fast: 20, mid: 50, slow: 200 } as const;

/** ADX below this means "range", however good the other trend inputs look. */
export const ADX_TREND_MINIMUM = 20;
export const ADX_STRONG_TREND = 40;

/* --------------------------- LIQUIDITY SCORE ------------------------------ */

export const LIQUIDITY_WEIGHTS = {
  orderBookDepth: 0.30,
  spread: 0.20,
  cexVolume: 0.20,
  stablecoinLiquidity: 0.15,
  dexLiquidity: 0.15,
} as const;

/** Spread in percent: at or below `tight` scores 100, at or above `wide` scores 0. */
export const SPREAD_BOUNDS = { tight: 0.01, wide: 0.5 } as const;

/* ------------------------------- REGIME ----------------------------------- */

export type MarketRegime =
  | 'STRONG_BULL' | 'BULL' | 'BULL_ACCUMULATION' | 'NEUTRAL' | 'RANGE'
  | 'DISTRIBUTION' | 'BEAR' | 'STRONG_BEAR' | 'CAPITULATION';

export const REGIME_LABELS: Record<MarketRegime, string> = {
  STRONG_BULL: 'Strong Bull',
  BULL: 'Bull',
  BULL_ACCUMULATION: 'Bull Accumulation',
  NEUTRAL: 'Neutral',
  RANGE: 'Range',
  DISTRIBUTION: 'Distribution',
  BEAR: 'Bear',
  STRONG_BEAR: 'Strong Bear',
  CAPITULATION: 'Capitulation',
};

/**
 * Composite-score bands used as the STARTING POINT for a regime. The regime
 * engine then overrides these using structural evidence — e.g. a mid band with
 * rising CVD, whale accumulation and flat price is BULL_ACCUMULATION, not
 * NEUTRAL. Score alone never decides a regime.
 */
export const REGIME_BANDS: { min: number; regime: MarketRegime }[] = [
  { min: 80, regime: 'STRONG_BULL' },
  { min: 65, regime: 'BULL' },
  { min: 45, regime: 'NEUTRAL' },
  { min: 30, regime: 'BEAR' },
  { min: 15, regime: 'STRONG_BEAR' },
  { min: 0, regime: 'CAPITULATION' },
];

/* -------------------- ACCUMULATION / DISTRIBUTION -------------------------- */

export const ACC_DIST_WEIGHTS = {
  cvdVsPrice: 0.30,      // the divergence itself
  whaleFlow: 0.20,
  exchangeFlow: 0.20,
  stablecoin: 0.15,
  breadth: 0.15,
} as const;

/**
 * A price move smaller than this (percent, over the window) counts as
 * "sideways" — the precondition for calling something accumulation rather than
 * a plain advance.
 */
export const SIDEWAYS_PRICE_PCT = 3;

/** Divergence score must clear this before ACCUMULATION/DISTRIBUTION is claimed. */
export const ACC_DIST_THRESHOLD = 60;

/* ------------------------------- SIGNAL ----------------------------------- */

export type SignalState =
  | 'HIGH_CONFIDENCE_BULLISH' | 'BULLISH' | 'NEUTRAL'
  | 'CAUTION' | 'BEARISH' | 'HIGH_CONFIDENCE_BEARISH';

export const SIGNAL_LABELS: Record<SignalState, string> = {
  HIGH_CONFIDENCE_BULLISH: 'High Confidence Bullish',
  BULLISH: 'Bullish',
  NEUTRAL: 'Neutral',
  CAUTION: 'Caution',
  BEARISH: 'Bearish',
  HIGH_CONFIDENCE_BEARISH: 'High Confidence Bearish',
};

export const SIGNAL_EMOJI: Record<SignalState, string> = {
  HIGH_CONFIDENCE_BULLISH: '🟢',
  BULLISH: '🟢',
  NEUTRAL: '🟡',
  CAUTION: '🟠',
  BEARISH: '🔴',
  HIGH_CONFIDENCE_BEARISH: '🔴',
};

/**
 * Data confidence required before a HIGH_CONFIDENCE state may be claimed.
 *
 * This is the guard that stops the product overstating itself: a 90/100 score
 * built on two of eight inputs is not high confidence, however good the number
 * looks, and it is downgraded to the plain BULLISH/BEARISH state instead.
 */
export const HIGH_CONFIDENCE_MIN_DATA_QUALITY = 70;

/** Score bands for the signal state. */
export const SIGNAL_BANDS: { min: number; state: SignalState }[] = [
  { min: 78, state: 'HIGH_CONFIDENCE_BULLISH' },
  { min: 60, state: 'BULLISH' },
  { min: 45, state: 'NEUTRAL' },
  { min: 35, state: 'CAUTION' },
  { min: 22, state: 'BEARISH' },
  { min: 0, state: 'HIGH_CONFIDENCE_BEARISH' },
];

/* ------------------------------- ALERTS ----------------------------------- */

export type AlertSeverity = 'info' | 'warning' | 'critical';

export const ALERT_THRESHOLDS = {
  /** z-score at which a CVD move is worth an alert. */
  cvdSpikeZ: 2.5,
  volumeSpikeZ: 2.5,
  whaleTradeUsd: 1_000_000,
  exchangeFlowZ: 2.0,
  /** Stablecoin supply change over 7d, percent. */
  stablecoinExpansionPct: 1.5,
  /** Breadth score crossing these triggers a breakout/breakdown alert. */
  breadthBreakout: 70,
  breadthBreakdown: 30,
} as const;

/* ------------------------------ VALIDATION -------------------------------- */

/** Weight sets must sum to their expected total, or a score is silently wrong. */
export function sumWeights(weights: object): number {
  return Object.values(weights).reduce((s: number, w) => s + (typeof w === 'number' ? w : 0), 0);
}

export function assertWeightsValid(): void {
  const money = sumWeights(MONEY_FLOW_WEIGHTS);
  if (Math.abs(money - 100) > 1e-9) {
    throw new Error(`MONEY_FLOW_WEIGHTS must sum to 100, got ${money}`);
  }
  for (const [name, set] of [
    ['TREND_TIMEFRAME_WEIGHTS', TREND_TIMEFRAME_WEIGHTS],
    ['TREND_COMPONENT_WEIGHTS', TREND_COMPONENT_WEIGHTS],
    ['LIQUIDITY_WEIGHTS', LIQUIDITY_WEIGHTS],
    ['ACC_DIST_WEIGHTS', ACC_DIST_WEIGHTS],
  ] as const) {
    const total = sumWeights(set);
    if (Math.abs(total - 1) > 1e-9) {
      throw new Error(`${name} must sum to 1, got ${total}`);
    }
  }
}
