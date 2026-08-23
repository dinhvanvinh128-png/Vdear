'use client';
import { cn } from '@/lib/utils';
import type { MoneyFlowScore } from '@/lib/scoring/moneyFlow';

/**
 * The per-component breakdown of the Money Flow Score.
 *
 * Unavailable components are shown EXPLICITLY with their reason rather than
 * hidden. That is the visible counterpart of the renormalisation rule: the user
 * can see that a component was dropped, and why, instead of a composite that
 * quietly absorbed a default value.
 */
export function ScoreBreakdown({ moneyFlow }: { moneyFlow: MoneyFlowScore }) {
  const available = moneyFlow.components.filter((c) => c.score != null);
  const missing = moneyFlow.components.filter((c) => c.score == null);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {available.map((c) => {
          const score = c.score as number;
          const tone = score >= 60 ? 'bg-up' : score <= 40 ? 'bg-down' : 'bg-warn';
          const text = score >= 60 ? 'text-up' : score <= 40 ? 'text-down' : 'text-warn';
          return (
            <div key={c.component} className="grid grid-cols-[1fr_auto] items-center gap-3">
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs text-text">{c.label}</span>
                  <span className="tnum shrink-0 text-[10px] text-muted">
                    {c.effectiveWeight.toFixed(0)}% weight
                  </span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-panel-2">
                  <div className={cn('h-full rounded-full', tone)} style={{ width: `${score}%` }} />
                </div>
              </div>
              <span className={cn('tnum w-8 text-right text-sm font-semibold', text)}>
                {Math.round(score)}
              </span>
            </div>
          );
        })}
      </div>

      {missing.length > 0 && (
        <div className="rounded-lg border border-border bg-panel-2/40 px-3 py-2">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Not available — excluded and weights renormalised
          </div>
          <ul className="mt-1 space-y-0.5">
            {missing.map((c) => (
              <li key={c.component} className="text-[11px] leading-snug text-muted">
                <span className="text-text">{c.label}</span>
                {c.unavailableReason ? ` — ${c.unavailableReason}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2 text-[11px] text-muted">
        <span>Coverage <span className="tnum text-text">{Math.round(moneyFlow.coverage * 100)}%</span></span>
        <span>Confidence <span className="tnum text-text">{Math.round(moneyFlow.confidence)}/100</span></span>
        <span>Direction <span className="text-text">{moneyFlow.direction}</span></span>
      </div>
    </div>
  );
}
