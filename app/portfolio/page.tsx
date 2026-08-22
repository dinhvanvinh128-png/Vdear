'use client';
import { useEffect, useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Stat } from '@/components/common';
import { useApi } from '@/hooks/useApi';
import type { AggregatedTicker, Envelope } from '@/lib/types';
import { fmtUsd, fmtPct } from '@/lib/format';

interface Holding { base: string; qty: number; entry: number }
const KEY = 'vdear-portfolio';
const PIE = ['#6366f1', '#22d3ee', '#16c784', '#f5bf42', '#ff4c61', '#a78bfa', '#60a5fa', '#f472b6'];

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [form, setForm] = useState({ base: '', qty: '', entry: '' });
  const { data } = useApi<Envelope<AggregatedTicker[]>>('/api/coins?market=futures&limit=500', 15000);

  useEffect(() => {
    try { const r = localStorage.getItem(KEY); if (r) setHoldings(JSON.parse(r)); } catch { /* ignore */ }
  }, []);
  const persist = (next: Holding[]) => {
    setHoldings(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const priceMap = useMemo(() => {
    const m = new Map<string, number>();
    (data?.data ?? []).forEach((c) => m.set(c.base, c.vdearIndex));
    return m;
  }, [data]);

  const rows = holdings.map((h) => {
    const price = priceMap.get(h.base.toUpperCase()) ?? 0;
    const invested = h.qty * h.entry;
    const value = h.qty * price;
    const pnl = value - invested;
    const roi = invested > 0 ? (pnl / invested) * 100 : 0;
    return { ...h, price, invested, value, pnl, roi };
  });
  const totalInvested = rows.reduce((s, r) => s + r.invested, 0);
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const totalPnl = totalValue - totalInvested;
  const totalRoi = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
  const pie = rows.filter((r) => r.value > 0).map((r) => ({ name: r.base, value: r.value }));

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const base = form.base.trim().toUpperCase().replace(/USDT$/, '');
    const qty = parseFloat(form.qty);
    const entry = parseFloat(form.entry);
    if (!base || !(qty > 0) || !(entry > 0)) return;
    persist([...holdings, { base, qty, entry }]);
    setForm({ base: '', qty: '', entry: '' });
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Portfolio" subtitle="Track holdings against live VDEAR index prices. Stored locally on this device." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Invested" value={fmtUsd(totalInvested)} />
        <Stat label="Current Value" value={fmtUsd(totalValue)} />
        <Stat label="P / L" value={fmtUsd(totalPnl)} tone={totalPnl >= 0 ? 'up' : 'down'} />
        <Stat label="ROI" value={fmtPct(totalRoi)} tone={totalRoi >= 0 ? 'up' : 'down'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Holdings</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={add} className="mb-3 flex flex-wrap gap-2">
              <input placeholder="Coin (BTC)" value={form.base} onChange={(e) => setForm({ ...form, base: e.target.value })}
                className="h-9 w-28 rounded-lg border border-border bg-panel-2 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand/40" />
              <input placeholder="Quantity" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })}
                className="h-9 w-28 rounded-lg border border-border bg-panel-2 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand/40" />
              <input placeholder="Avg entry $" value={form.entry} onChange={(e) => setForm({ ...form, entry: e.target.value })}
                className="h-9 w-32 rounded-lg border border-border bg-panel-2 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand/40" />
              <Button type="submit" variant="primary" size="sm">Add</Button>
            </form>
            {rows.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted">No holdings yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="text-xs text-muted">
                    <tr className="border-b border-border">
                      <th className="px-2 py-2 text-left font-medium">Coin</th>
                      <th className="px-2 py-2 text-right font-medium">Qty</th>
                      <th className="px-2 py-2 text-right font-medium">Entry</th>
                      <th className="px-2 py-2 text-right font-medium">Price</th>
                      <th className="px-2 py-2 text-right font-medium">Value</th>
                      <th className="px-2 py-2 text-right font-medium">P/L</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-b border-border/60">
                        <td className="px-2 py-2 font-semibold">{r.base}</td>
                        <td className="px-2 py-2 text-right tnum">{r.qty}</td>
                        <td className="px-2 py-2 text-right tnum">{fmtUsd(r.entry)}</td>
                        <td className="px-2 py-2 text-right tnum">{r.price ? fmtUsd(r.price) : 'N/A'}</td>
                        <td className="px-2 py-2 text-right tnum">{fmtUsd(r.value)}</td>
                        <td className={`px-2 py-2 text-right tnum ${r.pnl >= 0 ? 'text-up' : 'text-down'}`}>
                          {fmtUsd(r.pnl)} <span className="text-[11px]">({fmtPct(r.roi)})</span>
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button onClick={() => persist(holdings.filter((_, j) => j !== i))} className="text-muted hover:text-down">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Allocation</CardTitle></CardHeader>
          <CardContent>
            {pie.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted">Add holdings to see allocation.</div>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                      {pie.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#11141e', border: '1px solid #262c3e', borderRadius: 8, fontSize: 12 }}
                      formatter={(v, n) => [fmtUsd(Number(v)), String(n)]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
