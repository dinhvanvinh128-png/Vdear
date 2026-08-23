'use client';
import { useRealtimePrice } from '@/hooks/useRealtimePrice';
import { fmtUsd } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toCanonical } from '@/lib/symbols';

/**
 * Live price straight from the public venue streams.
 *
 * Falls back to the server-rendered price whenever the streams are not
 * connected — the value shown is always real, never a placeholder, and the
 * venue count says how many streams are actually contributing.
 */
export function LivePrice({
  base, fallback, className,
}: { base: string; fallback: number | null; className?: string }) {
  const { consensus, prices, status } = useRealtimePrice(toCanonical(base));
  const live = consensus != null && consensus > 0;
  const value = live ? consensus : fallback;
  const openVenues = Object.values(status).filter((s) => s === 'open').length;

  return (
    <span className={cn('inline-flex items-baseline gap-2', className)}>
      <span className="tnum font-bold">{fmtUsd(value)}</span>
      {live ? (
        <span className="inline-flex items-center gap-1 text-[10px] text-up" title={
          Object.entries(prices)
            .map(([ex, p]) => `${ex}: ${fmtUsd(p as number)}`)
            .join('\n')
        }>
          <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-up" />
          LIVE · {openVenues} venue{openVenues === 1 ? '' : 's'}
        </span>
      ) : (
        <span className="text-[10px] text-muted">snapshot</span>
      )}
    </span>
  );
}
