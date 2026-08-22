import * as React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'default' | 'up' | 'down' | 'warn' | 'info' | 'muted';

const VARIANTS: Record<Variant, string> = {
  default: 'bg-brand/15 text-brand',
  up: 'bg-up/15 text-up',
  down: 'bg-down/15 text-down',
  warn: 'bg-warn/15 text-warn',
  info: 'bg-info/15 text-info',
  muted: 'bg-panel-2 text-muted',
};

export function Badge({
  variant = 'default', className, ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
        VARIANTS[variant], className,
      )}
      {...props}
    />
  );
}
