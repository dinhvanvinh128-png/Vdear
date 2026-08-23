'use client';
import { AlertTriangle, CheckCircle2, EyeOff, GitCompareArrows } from 'lucide-react';
import type { AnalystReport } from '@/lib/analyst/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * The WHY / RISKS panel — the spec's headline deliverable.
 *
 * Blind spots are given equal billing with the evidence on purpose: a reader
 * needs to know what the system could NOT see to weigh what it did see.
 */
export function WhyRisks({ report }: { report: AnalystReport }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-up" /> Why
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {report.why.map((line, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-text">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-up" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warn" /> Risks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {report.risks.map((line, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-text">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warn" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {report.contradictions.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitCompareArrows className="h-4 w-4 text-warn" /> Contradictions between inputs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {report.contradictions.map((line, i) => (
                <li key={i} className="text-sm leading-relaxed text-muted">{line}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {report.blindSpots.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <EyeOff className="h-4 w-4 text-muted" /> What this reading cannot see
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 sm:grid-cols-2">
              {report.blindSpots.map((line, i) => (
                <li key={i} className="text-[12px] leading-snug text-muted">{line}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function Scenarios({ report }: { report: AnalystReport }) {
  const tone = (kind: string) =>
    kind === 'risk' ? 'border-warn/30' : kind === 'alternate' ? 'border-info/30' : 'border-up/30';

  return (
    <Card>
      <CardHeader><CardTitle>Scenarios</CardTitle></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {report.scenarios.map((s) => (
          <div key={s.name} className={`rounded-lg border ${tone(s.kind)} bg-panel-2/40 p-3`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-text">{s.name}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted">{s.kind}</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">{s.description}</p>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              <span className="text-text">Confirmation:</span> {s.confirmation}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
