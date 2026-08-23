'use client';
import { cn } from '@/lib/utils';
import { REGIME_LABELS, SIGNAL_LABELS, type MarketRegime, type SignalState } from '@/lib/scoring/config';

const REGIME_TONE: Record<MarketRegime, string> = {
  STRONG_BULL: 'border-up/40 bg-up/10 text-up',
  BULL: 'border-up/30 bg-up/5 text-up',
  BULL_ACCUMULATION: 'border-info/40 bg-info/10 text-info',
  NEUTRAL: 'border-border bg-panel-2 text-muted',
  RANGE: 'border-border bg-panel-2 text-muted',
  DISTRIBUTION: 'border-warn/40 bg-warn/10 text-warn',
  BEAR: 'border-down/30 bg-down/5 text-down',
  STRONG_BEAR: 'border-down/40 bg-down/10 text-down',
  CAPITULATION: 'border-down/60 bg-down/20 text-down',
};

export function RegimeBadge({
  regime, conviction, className,
}: { regime: MarketRegime; conviction?: number | null; className?: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-2 border px-2.5 py-1',
      REGIME_TONE[regime], className,
    )}>
      <span className="font-serif text-sm leading-none">{REGIME_LABELS[regime]}</span>
      {conviction != null && (
        <span className="tnum text-[10px] font-normal opacity-80">
          {Math.round(conviction)} conviction
        </span>
      )}
    </span>
  );
}

const SIGNAL_TONE: Record<SignalState, string> = {
  HIGH_CONFIDENCE_BULLISH: 'border-up/50 bg-up/15 text-up',
  BULLISH: 'border-up/30 bg-up/5 text-up',
  NEUTRAL: 'border-border bg-panel-2 text-muted',
  CAUTION: 'border-warn/40 bg-warn/10 text-warn',
  BEARISH: 'border-down/30 bg-down/5 text-down',
  HIGH_CONFIDENCE_BEARISH: 'border-down/50 bg-down/15 text-down',
};

export function SignalBadge({
  state, confidence, className,
}: { state: SignalState; confidence?: number | null; className?: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-2 border px-2.5 py-1',
      SIGNAL_TONE[state], className,
    )}>
      <span className="font-serif text-sm leading-none">{SIGNAL_LABELS[state]}</span>
      {confidence != null && (
        <span className="tnum text-[10px] font-normal opacity-80">{Math.round(confidence)}/100</span>
      )}
    </span>
  );
}

const ACC_TONE: Record<string, string> = {
  ACCUMULATION: 'border-up/40 bg-up/10 text-up',
  DISTRIBUTION: 'border-warn/40 bg-warn/10 text-warn',
  NEUTRAL: 'border-border bg-panel-2 text-muted',
};

export function AccDistBadge({ phase, strength }: { phase: string; strength?: number | null }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-2 border px-2.5 py-1',
      ACC_TONE[phase] ?? ACC_TONE.NEUTRAL,
    )}>
      <span className="font-serif text-sm leading-none">{phase}</span>
      {strength != null && phase !== 'NEUTRAL' && (
        <span className="tnum text-[10px] font-normal opacity-80">{Math.round(strength)}</span>
      )}
    </span>
  );
}
