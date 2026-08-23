'use client';
import type { MarketBreadth } from '@/lib/engines/breadth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmtCompact } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Each ratio shows its SAMPLE SIZE.
 *
 * That is not a detail: an asset without 200 days of history is excluded from
 * the EMA200 ratio rather than counted as "below", so "68% above EMA200 (of 42
 * assets)" is a materially different claim from "68% of 300".
 */
function Ratio({ label, pct, count, sample }: {
  label: string; pct: number | null; count: number; sample: number;
}) {
  const unavailable = pct == null;
  const tone = unavailable ? 'bg-muted' : pct >= 60 ? 'bg-up' : pct <= 40 ? 'bg-down' : 'bg-warn';
  const text = unavailable ? 'text-muted' : pct >= 60 ? 'text-up' : pct <= 40 ? 'text-down' : 'text-warn';

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-text">{label}</span>
        <span className={cn('tnum text-sm font-semibold', text)}>
          {unavailable ? '—' : `${pct.toFixed(0)}%`}
        </span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-panel-2">
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${pct ?? 0}%` }} />
      </div>
      <div className="mt-0.5 text-[10px] text-muted tnum">
        {unavailable
          ? 'no asset had enough history to judge'
          : `${count} of ${sample} assets`}
      </div>
    </div>
  );
}

export function BreadthPanel({ breadth }: { breadth: MarketBreadth }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Market Breadth</CardTitle>
        <span className="tnum text-xs text-muted">{breadth.universe} assets</span>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Ratio label="Advancing" pct={breadth.advancing.pct}
                 count={breadth.advancing.count} sample={breadth.advancing.sample} />
          <Ratio label="Above EMA20" pct={breadth.aboveEma20.pct}
                 count={breadth.aboveEma20.count} sample={breadth.aboveEma20.sample} />
          <Ratio label="Above EMA50" pct={breadth.aboveEma50.pct}
                 count={breadth.aboveEma50.count} sample={breadth.aboveEma50.sample} />
          <Ratio label="Above EMA200" pct={breadth.aboveEma200.pct}
                 count={breadth.aboveEma200.count} sample={breadth.aboveEma200.sample} />
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs sm:grid-cols-4">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted">Advance / Decline</div>
            <div className={cn('tnum font-semibold',
              breadth.advanceDecline >= 0 ? 'text-up' : 'text-down')}>
              {breadth.advanceDecline > 0 ? '+' : ''}{breadth.advanceDecline}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted">New highs / lows</div>
            <div className="tnum font-semibold text-text">
              {breadth.newHighs.count} / {breadth.newLows.count}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted">Advancing volume</div>
            <div className="tnum font-semibold text-up">{fmtCompact(breadth.advancingVolumeUsd, '$')}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted">Declining volume</div>
            <div className="tnum font-semibold text-down">{fmtCompact(breadth.decliningVolumeUsd, '$')}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
