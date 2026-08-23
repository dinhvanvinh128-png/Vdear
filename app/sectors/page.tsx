'use client';
import { useApi } from '@/hooks/useApi';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { DataFreshness, Skeleton, ErrorState } from '@/components/common';
import { SectorRotation } from '@/components/intelligence/SectorRotation';
import type { Envelope } from '@/lib/types';
import type { SectorResult } from '@/lib/services/sectors';

export default function SectorsPage() {
  const { data, loading, error } = useApi<Envelope<SectorResult>>('/api/sectors', 120_000);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sector Rotation"
        subtitle="Where money is rotating: Layer 1, Layer 2, DeFi, AI, RWA, Meme, Gaming, DePIN, Infrastructure, Oracle."
        right={data ? <DataFreshness meta={data.meta} /> : undefined}
      />

      {loading && !data && <Skeleton className="h-72 w-full" />}
      {error && !data && <ErrorState message={error} />}

      {data?.data.rotation && <SectorRotation rotation={data.data.rotation} />}

      {data && !data.data.rotation && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted">
            <div className="font-semibold text-warn">Sector data unavailable</div>
            {data.data.unavailable.map((u, i) => (
              <div key={i} className="mt-1 text-xs">{u.source} — {u.reason}</div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
