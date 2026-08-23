'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/useApi';
import type { AggregatedTicker, Envelope } from '@/lib/types';
import { fmtPrice } from '@/lib/format';

interface Alert { id: string; base: string; op: '>' | '<'; price: number; triggered?: boolean }
const KEY = 'vdear-alerts';

export default function PriceAlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [form, setForm] = useState({ base: 'BTC', op: '>', price: '' });
  const [perm, setPerm] = useState<NotificationPermission>('default');
  const fired = useRef<Set<string>>(new Set());
  const { data } = useApi<Envelope<AggregatedTicker[]>>('/api/coins?market=futures&limit=500', 8000);

  useEffect(() => {
    try { const r = localStorage.getItem(KEY); if (r) setAlerts(JSON.parse(r)); } catch { /* ignore */ }
    if (typeof Notification !== 'undefined') setPerm(Notification.permission);
  }, []);
  const persist = (next: Alert[]) => {
    setAlerts(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const priceMap = useMemo(() => {
    const m = new Map<string, number>();
    (data?.data ?? []).forEach((c) => m.set(c.base, c.vdearIndex));
    return m;
  }, [data]);

  // Check alerts on each price refresh (client-side, while the page is open).
  useEffect(() => {
    if (priceMap.size === 0) return;
    let changed = false;
    const next = alerts.map((a) => {
      if (a.triggered) return a;
      const p = priceMap.get(a.base.toUpperCase());
      if (p == null) return a;
      const hit = a.op === '>' ? p >= a.price : p <= a.price;
      if (hit && !fired.current.has(a.id)) {
        fired.current.add(a.id);
        changed = true;
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(`VDEAR alert: ${a.base} ${a.op} $${fmtPrice(a.price)}`, { body: `Now $${fmtPrice(p)}` });
        }
        return { ...a, triggered: true };
      }
      return a;
    });
    if (changed) persist(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceMap]);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const base = form.base.trim().toUpperCase().replace(/USDT$/, '');
    const price = parseFloat(form.price);
    if (!base || !(price > 0)) return;
    persist([...alerts, { id: crypto.randomUUID(), base, op: form.op as '>' | '<', price }]);
    setForm({ ...form, price: '' });
  };

  const askPerm = async () => {
    if (typeof Notification === 'undefined') return;
    setPerm(await Notification.requestPermission());
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Price Alerts"
        subtitle="Browser alerts fire while VDEAR is open. Email/Telegram delivery is a later phase."
        right={perm !== 'granted'
          ? <Button size="sm" variant="outline" onClick={askPerm}><Bell className="h-4 w-4" /> Enable notifications</Button>
          : <Badge variant="up">Notifications on</Badge>}
      />
      <Card>
        <CardHeader><CardTitle>New alert</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={add} className="flex flex-wrap items-center gap-2">
            <input value={form.base} onChange={(e) => setForm({ ...form, base: e.target.value })} placeholder="Coin"
              className="h-9 w-24 rounded-lg border border-border bg-panel-2 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand/40" />
            <select value={form.op} onChange={(e) => setForm({ ...form, op: e.target.value })}
              className="h-9 rounded-lg border border-border bg-panel-2 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand/40">
              <option value=">">rises above</option>
              <option value="<">falls below</option>
            </select>
            <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Price $"
              className="h-9 w-32 rounded-lg border border-border bg-panel-2 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand/40" />
            <Button type="submit" variant="primary" size="sm">Add alert</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Active alerts</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {alerts.length === 0 && <div className="py-6 text-center text-sm text-muted">No alerts yet.</div>}
          {alerts.map((a) => {
            const p = priceMap.get(a.base.toUpperCase());
            return (
              <div key={a.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
                <span className="font-semibold">{a.base} {a.op === '>' ? '≥' : '≤'} ${fmtPrice(a.price)}</span>
                <span className="flex items-center gap-3">
                  <span className="text-muted">{p != null ? `now $${fmtPrice(p)}` : '—'}</span>
                  {a.triggered && <Badge variant="up">Triggered</Badge>}
                  <button onClick={() => persist(alerts.filter((x) => x.id !== a.id))} className="text-muted hover:text-down">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
