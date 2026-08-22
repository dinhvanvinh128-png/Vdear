'use client';
import { useEffect, useRef, useState } from 'react';
import type { AggregatedTicker, Candle, Envelope } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const TFS = ['5m', '15m', '30m', '1h', '4h', '1d', '1w'];
type ChartType = 'candles' | 'line' | 'area';

/**
 * Candlestick/line/area chart with volume, powered by TradingView Lightweight
 * Charts (loaded client-side). Falls back to a message if data is unavailable.
 */
export function PriceChart({ base, market = 'futures' }: { base: string; market?: 'spot' | 'futures' }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [tf, setTf] = useState('4h');
  const [type, setType] = useState<ChartType>('candles');
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty'>('loading');
  const [usedSource, setUsedSource] = useState<string>('');

  useEffect(() => {
    let disposed = false;
    let chart: import('lightweight-charts').IChartApi | null = null;

    (async () => {
      setStatus('loading');
      const [{ createChart, ColorType }, res] = await Promise.all([
        import('lightweight-charts'),
        fetch(`/api/klines/${base}?tf=${tf}&market=${market}&limit=400`, { cache: 'no-store' }),
      ]);
      if (disposed || !wrap.current) return;
      const env = (await res.json()) as Envelope<Candle[]>;
      const candles = env.data ?? [];
      setUsedSource(env.meta?.sources?.[0] ?? '');
      if (candles.length === 0) { setStatus('empty'); return; }

      wrap.current.innerHTML = '';
      chart = createChart(wrap.current, {
        layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#8a94a6', fontFamily: 'Inter, sans-serif' },
        grid: { vertLines: { color: 'rgba(38,44,62,0.5)' }, horzLines: { color: 'rgba(38,44,62,0.5)' } },
        rightPriceScale: { borderColor: '#262c3e' },
        timeScale: { borderColor: '#262c3e', timeVisible: true, secondsVisible: false },
        crosshair: { mode: 0 },
        height: 420,
        autoSize: true,
      });

      if (type === 'candles') {
        const s = chart.addCandlestickSeries({
          upColor: '#16c784', downColor: '#ff4c61', borderVisible: false,
          wickUpColor: '#16c784', wickDownColor: '#ff4c61',
        });
        s.setData(candles.map((c) => ({ time: c.time as never, open: c.open, high: c.high, low: c.low, close: c.close })));
      } else if (type === 'line') {
        const s = chart.addLineSeries({ color: '#6366f1', lineWidth: 2 });
        s.setData(candles.map((c) => ({ time: c.time as never, value: c.close })));
      } else {
        const s = chart.addAreaSeries({ lineColor: '#6366f1', topColor: 'rgba(99,102,241,0.4)', bottomColor: 'rgba(99,102,241,0.02)', lineWidth: 2 });
        s.setData(candles.map((c) => ({ time: c.time as never, value: c.close })));
      }

      const vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '' });
      vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      vol.setData(candles.map((c) => ({
        time: c.time as never, value: c.volume,
        color: c.close >= c.open ? 'rgba(22,199,132,0.4)' : 'rgba(255,76,97,0.4)',
      })));

      chart.timeScale().fitContent();
      setStatus('ready');
    })().catch(() => { if (!disposed) setStatus('empty'); });

    return () => { disposed = true; if (chart) chart.remove(); };
  }, [base, tf, type, market]);

  return (
    <div className="rounded-xl border border-border bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
        <div className="flex flex-wrap gap-1">
          {TFS.map((t) => (
            <Button key={t} size="sm" variant="ghost" active={tf === t} onClick={() => setTf(t)}>{t}</Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {usedSource && <span className="text-[11px] text-muted">via {usedSource}</span>}
          <div className="flex gap-1">
            {(['candles', 'line', 'area'] as ChartType[]).map((t) => (
              <Button key={t} size="sm" variant="ghost" active={type === t} onClick={() => setType(t)}>{t}</Button>
            ))}
          </div>
        </div>
      </div>
      <div className="relative p-2">
        <div ref={wrap} className={cn('h-[420px] w-full', status !== 'ready' && 'opacity-40')} />
        {status === 'loading' && <div className="absolute inset-0 grid place-items-center text-sm text-muted">Loading chart…</div>}
        {status === 'empty' && <div className="absolute inset-0 grid place-items-center text-sm text-muted">Chart data unavailable for {base}.</div>}
      </div>
    </div>
  );
}
