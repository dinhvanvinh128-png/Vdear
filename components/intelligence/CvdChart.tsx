'use client';
import {
  Area, AreaChart, CartesianGrid, Line, ComposedChart, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import type { CvdPoint, MfiPoint } from '@/lib/engines/spotFlow';
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


/**
 * Money Flow Index against price — the fallback view.
 *
 * Shown only when no venue publishes a taker split, and labelled as MFI rather
 * than dressed up as CVD. The two answer the same question with different
 * evidence: CVD knows who crossed the spread, MFI only knows where the typical
 * price closed. Presenting them as interchangeable would be the lie this whole
 * platform is built to avoid.
 *
 * The 80/20 guides are the conventional overbought/oversold bands, drawn because
 * MFI is read against them the way RSI is.
 */
export function MfiChart({ points, height = 240 }: { points: MfiPoint[]; height?: number }) {
  if (points.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center text-sm text-muted">
        Not enough price history to compute a Money Flow Index.
      </div>
    );
  }

  const data = points.map((p) => ({
    time: new Date(p.time * 1000).toISOString().slice(5, 16).replace('T', ' '),
    mfi: p.mfi,
    price: p.close,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="time" tick={{ fill: 'rgb(var(--muted))', fontSize: 10 }}
               tickLine={false} axisLine={false} minTickGap={40} />
        <YAxis yAxisId="mfi" domain={[0, 100]} ticks={[0, 20, 50, 80, 100]}
               tick={{ fill: 'rgb(var(--muted))', fontSize: 10 }}
               tickLine={false} axisLine={false} width={34} />
        <YAxis yAxisId="price" orientation="right" domain={['auto', 'auto']}
               tick={{ fill: 'rgb(var(--muted))', fontSize: 10 }}
               tickLine={false} axisLine={false} width={62} />
        <ReferenceLine yAxisId="mfi" y={80} stroke="rgb(var(--warn))" strokeDasharray="2 4" />
        <ReferenceLine yAxisId="mfi" y={20} stroke="rgb(var(--warn))" strokeDasharray="2 4" />
        <Tooltip
          contentStyle={{
            background: 'rgb(var(--panel))', border: '1px solid rgb(var(--border))',
            borderRadius: 3, fontSize: 12,
          }}
          labelStyle={{ color: 'rgb(var(--muted))' }}
          formatter={(value: number, name: string) => [
            name === 'price' ? value.toLocaleString('en-US') : value.toFixed(1),
            name === 'mfi' ? 'Money Flow Index' : 'Price',
          ]}
        />
        <Line yAxisId="mfi" type="monotone" dataKey="mfi" stroke="rgb(var(--brand))"
              strokeWidth={1.5} dot={false} />
        <Line yAxisId="price" type="monotone" dataKey="price" stroke="rgb(var(--text))"
              strokeWidth={1} dot={false} opacity={0.55} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
