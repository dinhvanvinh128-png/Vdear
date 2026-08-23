'use client';
import {
  Area, AreaChart, CartesianGrid, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { CvdPoint } from '@/lib/engines/spotFlow';
import { fmtCompact } from '@/lib/format';

/**
 * CVD against price.
 *
 * Plotted on the same axis range deliberately: the divergence between the two
 * lines IS the signal the accumulation/distribution engine keys off, so it has
 * to be visible rather than inferred from two separate charts.
 */
export function CvdChart({ points, height = 240 }: { points: CvdPoint[]; height?: number }) {
  if (points.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center text-sm text-muted">
        No taker-split data available for this pair.
      </div>
    );
  }

  const data = points.map((p) => ({
    time: new Date(p.time * 1000).toISOString().slice(5, 16).replace('T', ' '),
    cvd: p.cumulative,
    price: p.close,
    delta: p.delta,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="cvdFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--info))" stopOpacity={0.35} />
            <stop offset="100%" stopColor="rgb(var(--info))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="time" tick={{ fill: 'rgb(var(--muted))', fontSize: 10 }}
               tickLine={false} axisLine={false} minTickGap={40} />
        <YAxis yAxisId="cvd" tick={{ fill: 'rgb(var(--muted))', fontSize: 10 }}
               tickLine={false} axisLine={false} width={54}
               tickFormatter={(v: number) => fmtCompact(v, '$')} />
        <YAxis yAxisId="price" orientation="right" domain={['auto', 'auto']}
               tick={{ fill: 'rgb(var(--muted))', fontSize: 10 }}
               tickLine={false} axisLine={false} width={62} />
        <Tooltip
          contentStyle={{
            background: 'rgb(var(--panel))', border: '1px solid rgb(var(--border))',
            borderRadius: 3, fontSize: 12,
          }}
          labelStyle={{ color: 'rgb(var(--muted))' }}
          formatter={(value: number, name: string) => [
            name === 'price' ? value.toLocaleString('en-US') : fmtCompact(value, '$'),
            name === 'cvd' ? 'Cumulative delta' : name === 'price' ? 'Price' : name,
          ]}
        />
        <Area yAxisId="cvd" type="monotone" dataKey="cvd" stroke="rgb(var(--info))"
              strokeWidth={1.5} fill="url(#cvdFill)" dot={false} />
        <Line yAxisId="price" type="monotone" dataKey="price" stroke="rgb(var(--text))"
              strokeWidth={1} dot={false} opacity={0.55} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Per-bar volume delta — where the buying and selling actually landed. */
export function DeltaBars({ points, height = 120 }: { points: CvdPoint[]; height?: number }) {
  if (points.length === 0) return null;
  const data = points.slice(-60).map((p) => ({
    time: new Date(p.time * 1000).toISOString().slice(5, 16).replace('T', ' '),
    delta: p.delta,
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="time" hide />
        <YAxis tick={{ fill: 'rgb(var(--muted))', fontSize: 10 }} tickLine={false}
               axisLine={false} width={54} tickFormatter={(v: number) => fmtCompact(v, '$')} />
        <Tooltip
          contentStyle={{
            background: 'rgb(var(--panel))', border: '1px solid rgb(var(--border))',
            borderRadius: 3, fontSize: 12,
          }}
          formatter={(v: number) => [fmtCompact(v, '$'), 'Delta']}
        />
        <Area type="step" dataKey="delta" stroke="rgb(var(--brand))"
              fill="rgb(var(--brand))" fillOpacity={0.2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
