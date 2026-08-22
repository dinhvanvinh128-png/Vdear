'use client';
import { useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { CoinPicker } from '@/components/CoinPicker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/useApi';
import type { Envelope, Trade } from '@/lib/types';
import { fmtPrice, fmtCompact, ago } from '@/lib/format';
import { Skeleton } from '@/components/common';
import { ADAPTER_MAP } from '@/lib/exchanges/registry';

const THRESHOLDS = [100_000, 500_000, 1_000_000, 5_000_000];

/** Large recent trades across exchanges (real fills filtered by USD size). */
export default function WhalePage() {
  const [coin, setCoin] = useState('BTC');
  const [minUsd, setMinUsd] = useState(100_000);
  const { data, loading } = useApi<Envelope<{ trades: Trade[] }>>(
    `/api/trades/${coin}?market=futures&limit=100&minUsd=${minUsd}`, 6000,
  );
  const trades = data?.data.trades ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Whale Trades"
        subtitle="Large recent fills aggregated across Binance, OKX, Bybit and Bitget"
        right={<CoinPicker value={coin} onChange={setCoin} />}
      />
      <div className="flex flex-wrap gap-1">
        {THRESHOLDS.map((t) => (
          <Button key={t} size="sm" active={minUsd === t} onClick={() => setMinUsd(t)}>
            {fmtCompact(t, '$')}+
          </Button>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle>{coin} large trades</CardTitle><span className="text-xs text-muted">{trades.length} shown</span></CardHeader>
        <CardContent>
          {loading && !data && <Skeleton className="h-56 w-full" />}
          {data && trades.length === 0 && (
            <div className="py-8 text-center text-sm text-muted">No fills above {fmtCompact(minUsd, '$')} in the recent window.</div>
          )}
          {trades.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-border">
                    <th className="px-2 py-2 text-left font-medium">Time</th>
                    <th className="px-2 py-2 text-right font-medium">Price</th>
                    <th className="px-2 py-2 text-right font-medium">Value</th>
                    <th className="px-2 py-2 text-center font-medium">Side</th>
                    <th className="px-2 py-2 text-right font-medium">Exchange</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t, i) => (
                    <tr key={i} className="border-b border-border/60">
                      <td className="px-2 py-2 text-muted">{ago(t.timestamp)}</td>
                      <td className="px-2 py-2 text-right tnum">${fmtPrice(t.price)}</td>
                      <td className="px-2 py-2 text-right tnum font-semibold">{fmtCompact(t.price * t.size, '$')}</td>
                      <td className="px-2 py-2 text-center">
                        <Badge variant={t.side === 'buy' ? 'up' : 'down'}>{t.side.toUpperCase()}</Badge>
                      </td>
                      <td className="px-2 py-2 text-right text-muted">{ADAPTER_MAP[t.exchange]?.label ?? t.exchange}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-[11px] text-muted">
            Based on each exchange&apos;s recent public trades (REST snapshot). For a continuous whale feed,
            a WebSocket aggregated-trade stream is the Phase 10 upgrade. <Link href="/status" className="underline">Source status</Link>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
