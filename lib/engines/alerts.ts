/**
 * ALERT ENGINE (spec: ALERT SYSTEM).
 *
 * Every alert carries asset, timestamp, severity, reason, source and confidence
 * — the spec's required fields — plus a dedupe key so the same condition does
 * not re-fire on every poll or after a restart.
 *
 * Alerts are derived from ALREADY-COMPUTED engine output, so an alert can never
 * assert something the scores do not. An input that is unavailable produces no
 * alert rather than a "0 detected" one.
 */
import { ALERT_THRESHOLDS, type AlertSeverity } from '@/lib/scoring/config';
import type { SpotFlow } from '@/lib/engines/spotFlow';
import type { MarketBreadth } from '@/lib/engines/breadth';
import type { WhaleActivity } from '@/lib/engines/whale';
import type { StablecoinMetrics } from '@/lib/engines/stablecoin';
import type { AccDistResult } from '@/lib/scoring/accDist';
import type { RegimeResult } from '@/lib/scoring/regime';
import { REGIME_LABELS } from '@/lib/scoring/config';

export type AlertKind =
  | 'cvd_spike' | 'volume_anomaly' | 'whale_transaction'
  | 'exchange_inflow_spike' | 'exchange_outflow_spike'
  | 'stablecoin_expansion' | 'stablecoin_contraction'
  | 'breadth_breakout' | 'breadth_breakdown'
  | 'regime_change' | 'accumulation_detected' | 'distribution_detected';

export interface Alert {
  asset: string;
  kind: AlertKind;
  severity: AlertSeverity;
  /** Plain-language explanation. Must pass the language guard. */
  reason: string;
  /** Which engine or provider produced the evidence. */
  source: string;
  /** 0..100 confidence in the underlying evidence. */
  confidence: number;
  timestamp: number;
  /** Stable across polls for the same condition — see supabase alerts.dedupe_key. */
  dedupeKey: string;
  payload?: Record<string, unknown>;
}

/**
 * Bucket the timestamp so the same condition within the same hour produces the
 * same key. Without this, a condition that persists would re-fire every poll.
 */
function hourBucket(ts: number): string {
  return new Date(ts).toISOString().slice(0, 13);
}

function key(asset: string, kind: AlertKind, ts: number, extra = ''): string {
  return [asset.toUpperCase(), kind, hourBucket(ts), extra].filter(Boolean).join(':');
}

export interface AlertInput {
  asset: string;
  spotFlow: SpotFlow | null;
  breadth: MarketBreadth | null;
  whale: WhaleActivity | null;
  stablecoin: StablecoinMetrics | null;
  accDist: AccDistResult | null;
  regime: RegimeResult | null;
  /** The regime recorded on the previous run, when history is available. */
  previousRegime?: string | null;
  dataConfidence: number;
  now?: number;
}

export function detectAlerts(input: AlertInput): Alert[] {
  const now = input.now ?? Date.now();
  const asset = input.asset.toUpperCase();
  const out: Alert[] = [];
  const conf = Math.round(input.dataConfidence);

  /* -------------------------------- flow ---------------------------------- */
  const flow = input.spotFlow;
  if (flow) {
    const z = flow.volumeAnomaly.zScore;
    if (z != null && z >= ALERT_THRESHOLDS.volumeSpikeZ) {
      out.push({
        asset, kind: 'volume_anomaly',
        severity: z >= 4 ? 'critical' : 'warning',
        reason: `${asset} volume on the ${flow.timeframe} is ${z.toFixed(1)} standard deviations `
          + 'above its 30-bar average — an unusually active bar.',
        source: 'spot flow engine', confidence: conf, timestamp: now,
        dedupeKey: key(asset, 'volume_anomaly', now, flow.timeframe),
        payload: { zScore: z, timeframe: flow.timeframe, label: flow.volumeAnomaly.label },
      });
    }

    // CVD spike: a large delta relative to the bar's own turnover.
    const turnover = flow.totalBuyVolume + flow.totalSellVolume;
    if (turnover > 0 && flow.volumeDelta != null) {
      const intensity = flow.volumeDelta / turnover;
      if (Math.abs(intensity) >= 0.05) {
        const buying = intensity > 0;
        out.push({
          asset, kind: 'cvd_spike',
          severity: Math.abs(intensity) >= 0.12 ? 'warning' : 'info',
          reason: `${asset} cumulative delta moved sharply ${buying ? 'up' : 'down'} on the `
            + `${flow.timeframe} — aggressive ${buying ? 'buying' : 'selling'} is dominating.`,
          source: 'spot flow engine', confidence: conf, timestamp: now,
          dedupeKey: key(asset, 'cvd_spike', now, `${flow.timeframe}:${buying ? 'up' : 'down'}`),
          payload: { delta: flow.volumeDelta, timeframe: flow.timeframe },
        });
      }
    }
  }

  /* ------------------------------- whales --------------------------------- */
  const whale = input.whale;
  if (whale) {
    const bigTier = whale.buckets.find((b) => b.threshold === ALERT_THRESHOLDS.whaleTradeUsd);
    if (bigTier && bigTier.count > 0) {
      const buying = bigTier.netUsd > 0;
      out.push({
        asset, kind: 'whale_transaction',
        severity: Math.abs(bigTier.netUsd) >= 10_000_000 ? 'warning' : 'info',
        reason: `${bigTier.count} fill${bigTier.count === 1 ? '' : 's'} above $1M on ${asset}, `
          + `net ${buying ? 'buying' : 'selling'}.`,
        source: 'whale engine (CEX fills)', confidence: conf, timestamp: now,
        dedupeKey: key(asset, 'whale_transaction', now, buying ? 'buy' : 'sell'),
        payload: { count: bigTier.count, netUsd: bigTier.netUsd },
      });
    }

    const zf = whale.exchangeFlow?.zScore;
    if (zf != null && Math.abs(zf) >= ALERT_THRESHOLDS.exchangeFlowZ) {
      const inflow = zf > 0;
      out.push({
        asset,
        kind: inflow ? 'exchange_inflow_spike' : 'exchange_outflow_spike',
        severity: Math.abs(zf) >= 3 ? 'warning' : 'info',
        reason: inflow
          ? `${asset} is arriving on exchanges ${zf.toFixed(1)} standard deviations faster than `
            + 'usual — supply is being positioned to sell.'
          : `${asset} is leaving exchanges ${Math.abs(zf).toFixed(1)} standard deviations faster `
            + 'than usual — consistent with accumulation into self-custody.',
        source: `exchange flow (${whale.exchangeFlow!.source})`, confidence: conf, timestamp: now,
        dedupeKey: key(asset, inflow ? 'exchange_inflow_spike' : 'exchange_outflow_spike', now),
        payload: { zScore: zf },
      });
    }
  }

  /* ----------------------------- stablecoins ------------------------------ */
  const stable = input.stablecoin;
  if (stable?.change7d != null && Math.abs(stable.change7d) >= ALERT_THRESHOLDS.stablecoinExpansionPct) {
    const expanding = stable.change7d > 0;
    out.push({
      asset: 'STABLECOINS',
      kind: expanding ? 'stablecoin_expansion' : 'stablecoin_contraction',
      severity: 'info',
      reason: `Stablecoin supply ${expanding ? 'expanded' : 'contracted'} `
        + `${Math.abs(stable.change7d).toFixed(2)}% over 7 days — `
        + `${expanding ? 'dry powder is building' : 'capital is leaving the system'}.`,
      source: 'stablecoin engine (DeFiLlama)', confidence: conf, timestamp: now,
      dedupeKey: key('STABLECOINS', expanding ? 'stablecoin_expansion' : 'stablecoin_contraction', now),
      payload: { change7d: stable.change7d, totalUsd: stable.totalUsd },
    });
  }

  /* ------------------------------- breadth -------------------------------- */
  const breadth = input.breadth;
  if (breadth) {
    if (breadth.score >= ALERT_THRESHOLDS.breadthBreakout) {
      out.push({
        asset: 'MARKET', kind: 'breadth_breakout', severity: 'info',
        reason: `Market breadth is ${Math.round(breadth.score)}/100 — participation is broad `
          + 'rather than concentrated in a few assets.',
        source: 'breadth engine', confidence: conf, timestamp: now,
        dedupeKey: key('MARKET', 'breadth_breakout', now),
        payload: { score: breadth.score, universe: breadth.universe },
      });
    } else if (breadth.score <= ALERT_THRESHOLDS.breadthBreakdown) {
      out.push({
        asset: 'MARKET', kind: 'breadth_breakdown', severity: 'warning',
        reason: `Market breadth is ${Math.round(breadth.score)}/100 — participation is narrow `
          + 'and the majority of assets are declining.',
        source: 'breadth engine', confidence: conf, timestamp: now,
        dedupeKey: key('MARKET', 'breadth_breakdown', now),
        payload: { score: breadth.score, universe: breadth.universe },
      });
    }
  }

  /* --------------------------- acc/dist + regime -------------------------- */
  const acc = input.accDist;
  if (acc && acc.phase !== 'NEUTRAL') {
    const isAcc = acc.phase === 'ACCUMULATION';
    out.push({
      asset, kind: isAcc ? 'accumulation_detected' : 'distribution_detected',
      severity: isAcc ? 'info' : 'warning',
      reason: acc.divergences[0]
        ?? `${asset} flow evidence is consistent with ${isAcc ? 'accumulation' : 'distribution'}.`,
      source: 'accumulation/distribution engine', confidence: conf, timestamp: now,
      dedupeKey: key(asset, isAcc ? 'accumulation_detected' : 'distribution_detected', now),
      payload: { strength: acc.strength, divergences: acc.divergences },
    });
  }

  if (input.regime && input.previousRegime && input.regime.regime !== input.previousRegime) {
    out.push({
      asset, kind: 'regime_change', severity: 'warning',
      reason: `${asset} regime changed from ${input.previousRegime} to `
        + `${REGIME_LABELS[input.regime.regime]} at ${Math.round(input.regime.conviction)}/100 conviction.`,
      source: 'regime engine', confidence: conf, timestamp: now,
      dedupeKey: key(asset, 'regime_change', now, input.regime.regime),
      payload: { from: input.previousRegime, to: input.regime.regime },
    });
  }

  return out;
}
