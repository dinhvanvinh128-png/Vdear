'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The Confidence Rail.
 *
 * A score here is a *reading*, not a quantity, so it is drawn the way a reading
 * is drawn on a measuring instrument rather than as a progress bar:
 *
 *   0        25        50        75       100
 *   |----|----|----|----|----|----|----|----|
 *                     [--|--]                  needle inside its error bracket
 *   # # # # # . . .                            coverage pips
 *
 *  - the NEEDLE marks the score exactly;
 *  - the BRACKET around it is the error bar. Its half-width is (100 - confidence)/2
 *    score points, so a reading the system is unsure of is visibly *imprecise*
 *    rather than quietly identical to a confident one;
 *  - the PIPS below count scoring components: filled where the input was
 *    available, hollow where it was missing and its weight renormalised away.
 *
 * None of this is decoration. It is the renormalisation rule made visible: the
 * platform never substitutes a default for a missing input, and the rail refuses
 * to let a thin reading look like a complete one.
 */

type Tone = 'up' | 'down' | 'warn' | 'muted';

function toneOf(score: number | null | undefined): Tone {
  if (score == null || !Number.isFinite(score)) return 'muted';
  if (score >= 60) return 'up';
  if (score <= 40) return 'down';
  return 'warn';
}

const TONE_TEXT: Record<Tone, string> = {
  up: 'text-up', down: 'text-down', warn: 'text-warn', muted: 'text-muted',
};
const TONE_BG: Record<Tone, string> = {
  up: 'bg-up', down: 'bg-down', warn: 'bg-warn', muted: 'bg-muted',
};
const TONE_BORDER: Record<Tone, string> = {
  up: 'border-up/60', down: 'border-down/60', warn: 'border-warn/60', muted: 'border-muted/60',
};
const TONE_FILL: Record<Tone, string> = {
  up: 'bg-up/10', down: 'bg-down/10', warn: 'bg-warn/10', muted: 'bg-muted/10',
};

const clamp = (n: number) => Math.min(100, Math.max(0, n));

/**
 * The rail itself, reusable at two sizes. `compact` is the per-component
 * variant used inside the breakdown, so the breakdown and the composite speak
 * one visual language instead of two kinds of bar.
 */
export function ConfidenceRail({
  score, confidence, compact = false, className,
}: {
  score: number | null;
  confidence?: number | null;
  compact?: boolean;
  className?: string;
}) {
  const has = score != null && Number.isFinite(score);
  const tone = toneOf(score);
  const pos = has ? clamp(score as number) : null;

  // The error bracket: half-width in score points. Confidence 92 -> +/-4pt,
  // confidence 48 -> +/-26pt. Clamped at the rail's ends, because a reading
  // cannot be uncertain past 0 or 100.
  let bracket: { left: number; width: number } | null = null;
  if (pos != null && confidence != null && Number.isFinite(confidence)) {
    const half = Math.max(0, (100 - clamp(confidence)) / 2);
    const left = clamp(pos - half);
    const right = clamp(pos + half);
    if (right > left) bracket = { left, width: right - left };
  }

  const label = has
    ? `Score ${Math.round(score as number)} of 100`
      + (confidence != null ? `, confidence ${Math.round(confidence)} of 100` : '')
    : 'Score not available';

  return (
    <div
      role="img"
      aria-label={label}
      className={cn('relative w-full', compact ? 'h-3.5' : 'h-6', className)}
    >
      {/* graduations, sitting on the baseline */}
      <div className={cn(
        'rail-ticks absolute inset-x-0 bottom-0 border-b border-border',
        compact ? 'h-1.5' : 'h-2.5',
      )} />
      {/* the 100 end cap, which the repeating gradient cannot draw */}
      <div className={cn('absolute bottom-0 right-0 w-px bg-border', compact ? 'h-1.5' : 'h-2.5')} />
      {/* 50 is the neutral datum in every band in lib/scoring/config, so it is
          marked: the reader can see which side of neutral the needle sits on
          without reading the number. */}
      <div className={cn('absolute bottom-0 left-1/2 w-px bg-border', compact ? 'h-2.5' : 'h-4')} />

      {bracket && (
        <div
          className={cn(
            'absolute bottom-0 border-x',
            TONE_BORDER[tone], TONE_FILL[tone],
            compact ? 'h-3' : 'h-5',
          )}
          style={{ left: `${bracket.left}%`, width: `${bracket.width}%` }}
        />
      )}

      {pos != null && (
        <div
          className={cn('absolute bottom-0 w-0.5 -translate-x-1/2', TONE_BG[tone], compact ? 'h-3.5' : 'h-6')}
          style={{ left: `${pos}%` }}
        />
      )}
    </div>
  );
}

/**
 * Coverage pips — one per scoring component. Filled = the input was there;
 * hollow = it was missing, dropped, and the remaining weights renormalised.
 */
export function CoveragePips({
  available, total, title,
}: { available: number; total: number; title?: string }) {
  const n = Math.max(0, Math.round(total));
  const filled = Math.min(n, Math.max(0, Math.round(available)));
  return (
    <div
      className="flex items-center gap-[3px]"
      title={title ?? `${filled} of ${n} scoring inputs available`}
      aria-label={`${filled} of ${n} scoring inputs available`}
    >
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-1.5 w-1.5',
            i < filled ? 'bg-muted' : 'border border-border',
          )}
        />
      ))}
    </div>
  );
}

/**
 * A 0..100 score with its confidence and coverage.
 *
 * The confidence bracket is not decoration. A score is only interpretable
 * alongside how well its inputs were known, so the two are rendered together and
 * a score built on thin coverage reads visibly weaker than the same number built
 * on full coverage.
 */
export function ScoreGauge({
  label, score, confidence, coverage, components, sublabel, size = 'md',
}: {
  label: string;
  score: number | null;
  confidence?: number | null;
  coverage?: number | null;
  /** Exact input count, when the caller knows it. Otherwise inferred from coverage. */
  components?: { available: number; total: number };
  sublabel?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const unavailable = score == null || !Number.isFinite(score);
  const tone = toneOf(score);

  const pips = components
    ?? (coverage != null && Number.isFinite(coverage)
      ? { available: Math.floor(clamp(coverage * 100) / 10), total: 10 }
      : null);

  return (
    <div className="border border-border bg-panel px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted">{label}</span>
        {coverage != null && (
          <span className="tnum text-[10px] text-muted" title="Share of scoring inputs available">
            {Math.round(coverage * 100)}% data
          </span>
        )}
      </div>

      {/* The hero reading is the one place the analyst's voice shows up in a
          number: a serif figure, because at this size it is being read as a
          judgement, not scanned in a column. */}
      <div className={cn(
        'mt-1 tnum',
        size === 'lg' ? 'font-serif text-4xl font-normal leading-none'
          : size === 'sm' ? 'text-lg font-medium' : 'text-2xl font-medium',
        TONE_TEXT[tone],
      )}>
        {unavailable ? '—' : Math.round(score)}
        {!unavailable && (
          <span className="ml-1 font-sans text-[10px] font-normal tracking-[0.14em] text-muted">/100</span>
        )}
      </div>

      <ConfidenceRail score={score} confidence={confidence} className="mt-2.5" />

      <div className="mt-1.5 flex items-center justify-between gap-2">
        {pips
          ? <CoveragePips available={pips.available} total={pips.total} />
          : <span />}
        {confidence != null && (
          <span
            className="tnum text-[10px] text-muted"
            title="Confidence in the data behind this score — the width of the bracket on the rail"
          >
            ±{Math.round((100 - clamp(confidence)) / 2)} conf {Math.round(confidence)}
          </span>
        )}
      </div>

      {sublabel != null && <div className="mt-1.5 text-[11px] leading-snug text-muted">{sublabel}</div>}
    </div>
  );
}

/** Compact inline score, for table cells and dense rows. */
export function ScorePill({ score }: { score: number | null }) {
  if (score == null || !Number.isFinite(score)) {
    return <span className="text-muted">—</span>;
  }
  return <span className={cn('tnum font-medium', TONE_TEXT[toneOf(score)])}>{Math.round(score)}</span>;
}
