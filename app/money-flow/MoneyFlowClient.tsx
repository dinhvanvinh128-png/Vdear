'use client';
import { useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataFreshness, Skeleton, ErrorState, PctChange } from '@/components/common';
import { CoinPicker } from '@/components/CoinPicker';
import { ScoreBreakdown } from '@/components/intelligence/ScoreBreakdown';
import { ScoreGauge, ScorePill } from '@/components/intelligence/ScoreGauge';
import { AccDistBadge, RegimeBadge, SignalBadge } from '@/components/intelligence/RegimeBadge';
import { CvdChart, DeltaBars } from '@/components/intelligence/CvdChart';
import { QualityNotice } from '@/components/intelligence/QualityNotice';
import { fmtUsd } from '@/lib/format';
import type { Envelope } from '@/lib/types';
import type { Intelligence } from '@/lib/services/intelligence';
import type { MarketRegime, SignalState } from '@/lib/scoring/config';
import type { MoneyFlowScore } from '@/lib/scoring/moneyFlow';

interface FlowRow {
  symbol: string; price: number | null; priceChange24h: number | null;
  moneyFlow: MoneyFlowScore; regime: MarketRegime;
  signal: { state: SignalState; label: string; confidence: number };
  accDist: string; confidence: number;
}

export function MoneyFlowClient() {
  const [symbol, setSymbol] = useState('BTC');
  const list = useApi<Envelope<FlowRow[]>>('/api/money-flow?symbols=BTC,ETH,SOL,BNB,XRP', 60_000);
  const detail = useApi<Envelope<Intelligence>>(`/api/scores/${symbol}`, 30_000);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Money Flow"
        subtitle="Where capital is moving — spot flow, breadth, stablecoin liquidity, on-chain and whale activity, weighted into one score."
        right={<CoinPicker value={symbol} onChange={setSymbol} />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Money Flow Score by asset</CardTitle>
          {list.data && <DataFreshness meta={list.data.meta} />}
        </CardHeader>
        <CardContent>
          {list.loading && !list.data && <Skeleton className="h-40 w-full" />}
          {list.error && !list.data && <ErrorState message={list.error} />}
          {list.data && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-border">
                    <th className="px-2 py-2 text-left font-medium">Asset</th>
                    <th className="px-2 py-2 text-right font-medium">Price</th>
                    <th className="px-2 py-2 text-right font-medium">24h</th>
                    <th className="px-2 py-2 text-right font-medium">Money Flow</th>
                    <th className="px-2 py-2 text-right font-medium">Coverage</th>
                    <th className="px-2 py-2 text-left font-medium">Regime</th>
                    <th className="px-2 py-2 text-left font-medium">Signal</th>
                    <th className="px-2 py-2 text-left font-medium">Phase</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.data.map((r) => (
                    <tr key={r.symbol}
                        className="cursor-pointer border-b border-border/50 last:border-0 hover:bg-panel-2/40"
                        onClick={() => setSymbol(r.symbol)}>
                      <td className="px-2 py-2 font-semibold text-text">{r.symbol}</td>
                      <td className="px-2 py-2 text-right tnum text-muted">{fmtUsd(r.price)}</td>
                      <td className="px-2 py-2 text-right"><PctChange value={r.priceChange24h} /></td>
                      <td className="px-2 py-2 text-right"><ScorePill score={r.moneyFlow.score} /></td>
                      <td className="px-2 py-2 text-right tnum text-muted">
                        {Math.round(r.moneyFlow.coverage * 100)}%
                      </td>
                      <td className="px-2 py-2"><RegimeBadge regime={r.regime} /></td>
                      <td className="px-2 py-2"><SignalBadge state={r.signal.state} confidence={r.signal.confidence} /></td>
                      <td className="px-2 py-2"><AccDistBadge phase={r.accDist} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {detail.loading && !detail.data && <Skeleton className="h-72 w-full" />}
      {detail.data && (
        <>
          <QualityNotice quality={detail.data.data.quality} />
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{symbol} cumulative delta</CardTitle>
                <DataFreshness meta={detail.data.meta} />
              </CardHeader>
              <CardContent>
                <CvdChart points={detail.data.data.spotFlow?.points ?? []} />
                <DeltaBars points={detail.data.data.spotFlow?.points ?? []} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>{symbol} breakdown</CardTitle></CardHeader>
              <CardContent><ScoreBreakdown moneyFlow={detail.data.data.moneyFlow} /></CardContent>
            </Card>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ScoreGauge label="Stablecoin liquidity" score={detail.data.data.stablecoinScore} />
            <ScoreGauge label="DeFi liquidity" score={detail.data.data.defiScore} />
            <ScoreGauge label="Whale flow" score={detail.data.data.whale?.score ?? null}
                        sublabel={detail.data.data.whale?.tiers.join(' + ')} />
            <ScoreGauge label="Derivatives confirmation"
                        score={detail.data.data.derivatives?.score ?? null}
                        sublabel={detail.data.data.derivatives?.regime} />
          </div>
        </>
      )}
    </div>
  );
}
