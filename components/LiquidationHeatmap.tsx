'use client';
import { useEffect, useRef, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import type { Envelope, LiquidationZone } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fmtPrice, fmtCompact } from '@/lib/format';
import { Skeleton, DataFreshness } from '@/components/common';
import { CHART_FONT_FAMILY, themeColor } from '@/lib/theme';

interface Heatmap {
  yAxis: number[];
  points: [number, number, number][];
  candles: { time: number; open: number; high: number; low: number; close: number }[];
}
interface HeatmapData {
  source: 'coinglass' | 'estimated';
  currentPrice: number;
  heatmap?: Heatmap;
  column?: LiquidationZone[];
  note: string;
}

const RANGES = ['12h', '24h', '3d', '7d', '30d'];

/** CoinGlass 2D heatmap (canvas) when available; estimated bands otherwise. */
export function LiquidationHeatmap({ coin }: { coin: string }) {
  const [range, setRange] = useState('24h');
  const { data, loading } = useApi<Envelope<HeatmapData>>(`/api/liquidations/heatmap?coin=${coin}&range=${range}`, 20000);
  const d = data?.data;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!d || d.source !== 'coinglass' || !d.heatmap) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const { yAxis, points, candles } = d.heatmap;
    const W = cv.clientWidth || 600;
    const H = 420;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext('2d');
    if (!ctx || yAxis.length === 0) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const rows = yAxis.length;
    const cols = Math.max(candles.length, ...points.map((p) => p[0] + 1), 1);
    const padR = 62;
    const plotW = W - padR;
    const cw = plotW / cols;
    const ch = H / rows;
    const maxVal = Math.max(1, ...points.map((p) => p[2]));

    // liquidation cells (yellow→red by intensity, log-scaled)
    for (const [xi, yi, val] of points) {
      const t = Math.log(1 + val) / Math.log(1 + maxVal);
      const x = xi * cw;
      const y = (rows - 1 - yi) * ch; // high prices on top
      ctx.fillStyle = `hsla(${60 - 60 * t}, 100%, ${18 + 42 * t}%, ${0.25 + 0.7 * t})`;
      ctx.fillRect(x, y, Math.ceil(cw) + 1, Math.ceil(ch) + 1);
    }

    const minY = yAxis[0];
    const maxY = yAxis[yAxis.length - 1];
    const priceToY = (p: number) => (1 - (p - minY) / (maxY - minY || 1)) * H;

    // price close overlay
    if (candles.length > 1) {
      ctx.beginPath();
      candles.forEach((c, i) => {
        const x = (i / (candles.length - 1)) * plotW;
        const y = priceToY(c.close);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.strokeStyle = 'rgba(232,236,244,0.85)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    // current price line
    const cy = priceToY(d.currentPrice);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = themeColor('brand', 0.9);
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(plotW, cy); ctx.stroke();
    ctx.setLineDash([]);

    // price axis labels
    ctx.fillStyle = themeColor('muted');
    ctx.font = `10px ${CHART_FONT_FAMILY}`;
    ctx.textAlign = 'left';
    for (let i = 0; i <= 6; i++) {
      const p = minY + ((maxY - minY) * i) / 6;
      const y = priceToY(p);
      ctx.fillText('$' + fmtPrice(p), plotW + 4, Math.min(H - 2, Math.max(9, y + 3)));
    }
  }, [d]);

  const cellColor = (z: LiquidationZone) => {
    const a = 0.15 + z.intensity * 0.7;
    return z.side === 'short' ? `rgba(255,76,97,${a})` : `rgba(22,199,132,${a})`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{coin} Liquidation Heatmap</CardTitle>
        <div className="flex items-center gap-2">
          {d && <Badge variant={d.source === 'coinglass' ? 'info' : 'warn'}>{d.source === 'coinglass' ? 'CoinGlass' : 'Estimated'}</Badge>}
          <div className="hidden gap-1 sm:flex">
            {RANGES.map((r) => <Button key={r} size="sm" active={range === r} onClick={() => setRange(r)}>{r}</Button>)}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && !d && <Skeleton className="h-72 w-full" />}

        {d && d.source === 'coinglass' && d.heatmap && (
          <canvas ref={canvasRef} className="w-full" style={{ height: 420 }} />
        )}

        {d && d.source === 'estimated' && (
          <div className="space-y-0.5">
            {(d.column ?? []).map((z, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-right text-xs tnum text-muted">${fmtPrice(z.price)}</span>
                <div className="h-5 flex-1 rounded" style={{ background: cellColor(z) }} title={`${fmtCompact(z.estValueUsd, '$')} est.`} />
                <span className="w-8 shrink-0 text-[10px] uppercase text-muted">{z.side === 'short' ? 'S' : 'L'}</span>
              </div>
            ))}
          </div>
        )}

        {d && <p className="mt-3 text-[11px] text-muted">{d.note}</p>}
        <div className="mt-2"><DataFreshness meta={data?.meta} /></div>
      </CardContent>
    </Card>
  );
}
