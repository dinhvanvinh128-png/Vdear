'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * A 0..100 score with its confidence.
 *
 * The confidence bar is not decoration. A score is only interpretable alongside
 * how well its inputs were known, so the two are rendered together and a score
 * built on thin coverage reads visibly weaker than the same number built on
 * full coverage.
 */
export function ScoreGauge({
  label, score, confidence, coverage, sublabel, size = 'md',
}: {
  label: string;
  score: number | null;
  confidence?: number | null;
  coverage?: number | null;
  sublabel?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const unavailable = score == null || !Number.isFinite(score);
  const tone = unavailable ? 'muted' : score >= 60 ? 'up' : score <= 40 ? 'down' : 'warn';
  const toneText =
    tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down'
      : tone === 'warn' ? 'text-warn' : 'text-muted';
  const toneBg =
    tone === 'up' ? 'bg-up' : tone === 'down' ? 'bg-down'
      : tone === 'warn' ? 'bg-warn' : 'bg-muted';

  const valueSize =
    size === 'lg' ? 'text-4xl' : size === 'sm' ? 'text-lg' : 'text-2xl';

  return (
    <div className="rounded-xl border border-border bg-panel px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
        {coverage != null && (
          <span className="tnum text-[10px] text-muted" title="Share of scoring inputs available">
            {Math.round(coverage * 100)}% data
          </span>
        )}
      </div>

      <div className={cn('mt-1 font-bold tnum', valueSize, toneText)}>
        {unavailable ? '—' : Math.round(score)}
        {!unavailable && <span className="ml-0.5 text-xs font-normal text-muted">/100</span>}
      </div>

      {!unavailable && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-panel-2">
          <div className={cn('h-full rounded-full', toneBg)} style={{ width: `${Math.round(score)}%` }} />
        </div>
      )}

      {confidence != null && (
        <div className="mt-1.5 flex items-center gap-1.5" title="Confidence in the data behind this score">
          <div className="h-0.5 flex-1 overflow-hidden rounded-full bg-panel-2">
            <div
              className={cn('h-full rounded-full', confidence >= 70 ? 'bg-info' : 'bg-warn')}
              style={{ width: `${Math.round(confidence)}%` }}
            />
          </div>
          <span className="tnum text-[10px] text-muted">{Math.round(confidence)} conf</span>
        </div>
      )}

      {sublabel != null && <div className="mt-1 text-[11px] leading-snug text-muted">{sublabel}</div>}
    </div>
  );
}

/** Compact inline score, for table cells and dense rows. */
export function ScorePill({ score }: { score: number | null }) {
  if (score == null || !Number.isFinite(score)) {
    return <span className="text-muted">—</span>;
  }
  const tone = score >= 60 ? 'text-up' : score <= 40 ? 'text-down' : 'text-warn';
  return <span className={cn('tnum font-semibold', tone)}>{Math.round(score)}</span>;
}
