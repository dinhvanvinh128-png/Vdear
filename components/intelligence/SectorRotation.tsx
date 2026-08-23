'use client';
import type { SectorRotation as SectorRotationData } from '@/lib/engines/sector';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmtCompact, fmtPct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ScorePill } from '@/components/intelligence/ScoreGauge';

export function SectorRotation({ rotation }: { rotation: SectorRotationData }) {
  const max = Math.max(1, ...rotation.sectors.map((s) => s.score));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sector Rotation</CardTitle>
        <span className="text-xs text-muted">
          Leading: {rotation.leaders.map((l) => l.toUpperCase()).join(' → ')}
        </span>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-border">
                <th className="px-2 py-2 text-left font-medium">Sector</th>
                <th className="px-2 py-2 text-right font-medium">Market cap</th>
                <th className="px-2 py-2 text-right font-medium">24h</th>
                <th className="px-2 py-2 text-right font-medium">7d</th>
                <th className="px-2 py-2 text-right font-medium">Turnover</th>
                <th className="px-2 py-2 text-right font-medium">Score</th>
              </tr>
            </thead>
            <tbody>
              {rotation.sectors.map((s) => (
                <tr key={s.sector} className="border-b border-border/50 last:border-0">
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1 w-10 shrink-0 overflow-hidden rounded-full bg-panel-2">
                        <div className="h-full rounded-full bg-brand"
                             style={{ width: `${(s.score / max) * 100}%` }} />
                      </div>
                      <span className="text-text">{s.label}</span>
                      <span className="tnum text-[10px] text-muted">{s.memberCount}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right tnum text-muted">{fmtCompact(s.marketCapUsd, '$')}</td>
                  <td className={cn('px-2 py-2 text-right tnum',
                    (s.change24h ?? 0) >= 0 ? 'text-up' : 'text-down')}>
                    {fmtPct(s.change24h)}
                  </td>
                  <td className={cn('px-2 py-2 text-right tnum',
                    (s.change7d ?? 0) >= 0 ? 'text-up' : 'text-down')}>
                    {fmtPct(s.change7d)}
                  </td>
                  <td className="px-2 py-2 text-right tnum text-muted">
                    {s.turnover == null ? '—' : `${(s.turnover * 100).toFixed(1)}%`}
                  </td>
                  <td className="px-2 py-2 text-right"><ScorePill score={s.score} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rotation.unclassified > 0 && (
          <p className="mt-2 text-[11px] text-muted">
            {rotation.unclassified} assets matched no sector category and are excluded from these totals.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
