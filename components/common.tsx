'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { ago, fmtPct } from '@/lib/format';
import type { Envelope } from '@/lib/types';

/** Colored 24h % change. Uses semantic tokens only (no hard-coded green/red). */
export function PctChange({ value, className }: { value: number | null | undefined; className?: string }) {
  const up = (value ?? 0) >= 0;
  return (
    <span className={cn('tnum font-medium', up ? 'text-up' : 'text-down', className)}>
      {fmtPct(value)}
    </span>
  );
}

/** Freshness + provenance line (spec §56: timestamp + source + freshness). */
export function DataFreshness({ meta, className }: { meta?: Envelope<unknown>['meta']; className?: string }) {
  if (!meta) return null;
  const sources = meta.sources || [];
  return (
    <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted', className)}>
      <span>Updated {ago(meta.generatedAt)}</span>
      {sources.length > 0 && (
        <span>· Sources: {sources.map((s) => s[0].toUpperCase() + s.slice(1)).join(' / ')}</span>
      )}
      {meta.errors && meta.errors.length > 0 && (
        <span className="text-warn">· {meta.errors.length} source(s) unavailable</span>
      )}
      {meta.kind === 'estimated' && <span className="text-warn">· estimated</span>}
    </div>
  );
}

export function Stat({
  label, value, sub, tone,
}: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'up' | 'down' | 'warn' | 'info' }) {
  const toneCls =
    tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : tone === 'warn' ? 'text-warn' : tone === 'info' ? 'text-info' : 'text-text';
  return (
    <div className="rounded-xl border border-border bg-panel px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={cn('mt-1 text-lg font-semibold tnum', toneCls)}>{value}</div>
      {sub != null && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-panel-2', className)} />;
}

export function ErrorState({ message }: { message?: string }) {
  return (
    <div className="rounded-xl border border-down/30 bg-down/5 px-4 py-6 text-center text-sm text-muted">
      <div className="font-semibold text-down">Data temporarily unavailable</div>
      {message && <div className="mt-1 text-xs">{message}</div>}
      <div className="mt-1 text-xs">The dashboard keeps running on remaining sources.</div>
    </div>
  );
}

/** Tiny inline SVG sparkline (no chart library). */
export function Sparkline({ points, up }: { points: number[]; up?: boolean }) {
  if (!points || points.length < 2) return <svg width="72" height="24" />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const rng = max - min || 1;
  const w = 72, h = 24;
  const d = points
    .map((p, i) => `${(i / (points.length - 1)) * w},${h - ((p - min) / rng) * h}`)
    .join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={d} fill="none" strokeWidth="1.5" className={up ? 'stroke-up' : 'stroke-down'} />
    </svg>
  );
}
