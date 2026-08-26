'use client';
import { useApi } from '@/hooks/useApi';
import type { HealthReport } from '@/lib/services/health';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/common';
import { ago } from '@/lib/format';
import { cn } from '@/lib/utils';

const DOT: Record<string, string> = {
  online: 'bg-up', degraded: 'bg-warn', error: 'bg-down', not_configured: 'bg-muted',
};
const LABEL: Record<string, string> = {
  online: 'ONLINE', degraded: 'DEGRADED', error: 'ERROR', not_configured: 'NOT CONFIGURED',
};
const TEXT: Record<string, string> = {
  online: 'text-up', degraded: 'text-warn', error: 'text-down', not_configured: 'text-muted',
};

function SourceCard({
  label, status, message, latencyMs, tier, capabilities, docsUrl,
}: {
  label: string; status: string; message?: string; latencyMs: number | null;
  tier?: string; capabilities?: readonly string[]; docsUrl?: string;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', DOT[status],
                status === 'online' && 'animate-pulseDot')} />
              <span className="truncate font-semibold">{label}</span>
              {tier && (
                <span className="rounded border border-border px-1 text-[10px] uppercase text-muted">
                  {tier}
                </span>
              )}
            </div>
            {message && <div className="mt-1 text-[11px] leading-snug text-muted">{message}</div>}
            {capabilities && capabilities.length > 0 && (
              <div className="mt-1.5 text-[11px] text-muted">{capabilities.join(' · ')}</div>
            )}
          </div>
          <div className="shrink-0 text-right">
            <div className={cn('text-xs font-semibold', TEXT[status])}>{LABEL[status]}</div>
            {latencyMs != null && <div className="text-[11px] text-muted tnum">{latencyMs}ms</div>}
            {docsUrl && (
              <a href={docsUrl} target="_blank" rel="noreferrer noopener"
                 className="text-[11px] text-muted underline-offset-2 hover:underline">docs</a>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function StatusPage() {
  const { data, loading } = useApi<HealthReport>('/api/health', 15000);
  const core = (data?.providers ?? []).filter((p) => !p.requiresKey);
  const premium = (data?.providers ?? []).filter((p) => p.requiresKey);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Source Health"
        subtitle="Live status of every source. A down source fails over; an unconfigured premium source is expected, not an error."
      />
      {loading && !data && <Skeleton className="h-48 w-full" />}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-panel px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-muted">Exchanges</div>
              <div className={cn('mt-1 text-lg font-semibold tnum',
                data.summary.exchangesOnline === data.summary.exchangesTotal ? 'text-up' : 'text-warn')}>
                {data.summary.exchangesOnline}/{data.summary.exchangesTotal} online
              </div>
            </div>
            <div className="rounded-xl border border-border bg-panel px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-muted">Core providers</div>
              <div className={cn('mt-1 text-lg font-semibold tnum',
                data.summary.degraded ? 'text-warn' : 'text-up')}>
                {data.summary.coreOnline}/{data.summary.coreTotal} online
              </div>
            </div>
            <div className="rounded-xl border border-border bg-panel px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-muted">Premium (optional)</div>
              <div className="mt-1 text-lg font-semibold tnum text-text">
                {data.summary.premiumConfigured}/{data.summary.premiumTotal} configured
              </div>
            </div>
            <div className="rounded-xl border border-border bg-panel px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-muted">Cache</div>
              <div className="mt-1 text-lg font-semibold tnum text-text">{data.cache.entries}</div>
              <div className="mt-0.5 text-xs text-muted">{data.cache.inflight} in-flight</div>
            </div>
          </div>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Exchanges</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {data.exchanges.map((s) => (
                <SourceCard key={s.id} label={s.label} status={s.status}
                            message={s.message} latencyMs={s.latencyMs} />
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
              Core providers — no API key required
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {core.map((p) => (
                <SourceCard key={p.id} label={p.label} status={p.status} message={p.message}
                            latencyMs={p.latencyMs} tier={p.tier}
                            capabilities={p.capabilities} docsUrl={p.docsUrl} />
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
              Premium providers — optional enhancements
            </h2>
            <p className="mb-2 text-xs text-muted">
              Vdearypto runs entirely on the free sources above. These add depth when a key is
              present; when one is not, its metrics are shown as unavailable rather than estimated.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {premium.map((p) => (
                <SourceCard key={p.id} label={p.label} status={p.status} message={p.message}
                            latencyMs={p.latencyMs} tier={p.tier}
                            capabilities={p.capabilities} docsUrl={p.docsUrl} />
              ))}
            </div>
          </section>

          {data.net.circuits.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Circuit breakers</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-xs text-muted">
                {data.net.circuits.map((c) => (
                  <div key={c.host} className="flex justify-between gap-4">
                    <span className="truncate">{c.host}</span>
                    <span className={c.state === 'closed' ? 'text-up' : c.state === 'open' ? 'text-down' : 'text-warn'}>
                      {c.state}{c.lastError ? ` — ${c.lastError}` : ''}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="text-xs text-muted">Checked {ago(data.checkedAt)}</div>
        </>
      )}
    </div>
  );
}
