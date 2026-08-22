'use client';
import { useApi } from '@/hooks/useApi';
import type { HealthReport } from '@/lib/services/health';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/common';
import { ago } from '@/lib/format';
import { cn } from '@/lib/utils';

const DOT: Record<string, string> = {
  online: 'bg-up', error: 'bg-down', not_configured: 'bg-muted',
};
const LABEL: Record<string, string> = {
  online: 'ONLINE', error: 'ERROR', not_configured: 'NOT CONFIGURED',
};

export default function StatusPage() {
  const { data, loading } = useApi<HealthReport>('/api/health', 15000);

  return (
    <div className="space-y-4">
      <PageHeader title="API Health Monitor" subtitle="Live status of every data source. A down exchange never crashes the dashboard — it fails over to the rest." />
      {loading && !data && <Skeleton className="h-48 w-full" />}
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.sources.map((s) => (
              <Card key={s.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={cn('h-2.5 w-2.5 rounded-full', DOT[s.status], s.status === 'online' && 'animate-pulseDot')} />
                      <span className="font-semibold">{s.label}</span>
                    </div>
                    {s.message && <div className="mt-1 text-[11px] text-muted">{s.message}</div>}
                  </div>
                  <div className="text-right">
                    <div className={cn('text-xs font-bold', s.status === 'online' ? 'text-up' : s.status === 'error' ? 'text-down' : 'text-muted')}>
                      {LABEL[s.status]}
                    </div>
                    {s.latencyMs != null && <div className="text-[11px] text-muted">{s.latencyMs}ms</div>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader><CardTitle>Cache</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted">
              {data.cache.entries} cached entries · {data.cache.inflight} in-flight · checked {ago(data.checkedAt)}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
