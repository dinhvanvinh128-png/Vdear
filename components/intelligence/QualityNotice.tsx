'use client';
import { AlertOctagon, Info } from 'lucide-react';
import type { DataQualityReport } from '@/lib/quality';
import { confidenceLabel } from '@/lib/quality/confidence';
import { cn } from '@/lib/utils';

/**
 * Surfaces cross-venue anomalies and unavailable sources.
 *
 * A detected anomaly is shown prominently rather than logged quietly — the
 * whole point of detecting it is that the user knows a venue was excluded.
 */
export function QualityNotice({ quality }: { quality: DataQualityReport }) {
  const hasAnomaly = quality.anomalies.length > 0;
  const hasMissing = quality.unavailable.length > 0;
  if (!hasAnomaly && !hasMissing) return null;

  return (
    <div className="space-y-2">
      {quality.anomalies.map((a) => (
        <div key={a.symbol}
             className={cn('flex gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed',
               a.severity === 'critical' || a.severity === 'major'
                 ? 'border-down/40 bg-down/5 text-down'
                 : 'border-warn/40 bg-warn/5 text-warn')}>
          <AlertOctagon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{a.message}</span>
        </div>
      ))}

      {hasMissing && (
        <details className="rounded-lg border border-border bg-panel-2/40 px-3 py-2">
          <summary className="cursor-pointer text-xs text-muted">
            <Info className="mr-1 inline h-3 w-3" />
            {quality.unavailable.length} source{quality.unavailable.length === 1 ? '' : 's'} unavailable
            {' · '}data confidence {Math.round(quality.confidence)}/100 ({confidenceLabel(quality.confidence)})
          </summary>
          <ul className="mt-2 space-y-0.5">
            {quality.unavailable.map((u, i) => (
              <li key={i} className="text-[11px] leading-snug text-muted">
                <span className="text-text">{u.source}</span> — {u.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
