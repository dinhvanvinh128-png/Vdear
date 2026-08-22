'use client';
import { useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useApi } from '@/hooks/useApi';
import type { Envelope } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fmtCompact } from '@/lib/format';
import { Skeleton } from '@/components/common';

const PERIODS = ['1h', '4h', '12h', '1d'];

interface Point { time: number; valueUsd: number }

export function OpenInterestChart({ base }: { base: string }) {
  const [period, setPeriod] = useState('1h');
  const { data, loading } = useApi<Envelope<Point[]>>(`/api/open-interest/history?symbol=${base}&period=${period}&limit=72`, 30000);
  const series = (data?.data ?? []).map((p) => ({
    t: new Date(p.time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' }),
    oi: p.valueUsd,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{base} Open Interest {data?.meta?.sources?.length ? '· via Binance' : ''}</CardTitle>
        <div className="flex gap-1">
          {PERIODS.map((p) => <Button key={p} size="sm" active={period === p} onClick={() => setPeriod(p)}>{p}</Button>)}
        </div>
      </CardHeader>
      <CardContent>
        {loading && !data && <Skeleton className="h-56 w-full" />}
        {data && series.length === 0 && <div className="py-12 text-center text-sm text-muted">OI history unavailable for {base}.</div>}
        {series.length > 0 && (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="oiFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(96,165,250)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="rgb(96,165,250)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(38,44,62,0.5)" />
                <XAxis dataKey="t" tick={{ fill: '#8a94a6', fontSize: 10 }} minTickGap={40} />
                <YAxis tick={{ fill: '#8a94a6', fontSize: 10 }} width={54} tickFormatter={(v) => fmtCompact(Number(v), '$')} />
                <Tooltip
                  contentStyle={{ background: '#11141e', border: '1px solid #262c3e', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#8a94a6' }}
                  formatter={(v) => [fmtCompact(Number(v), '$'), 'Open Interest']}
                />
                <Area type="monotone" dataKey="oi" stroke="rgb(96,165,250)" fill="url(#oiFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
