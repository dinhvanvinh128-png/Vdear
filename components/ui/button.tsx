import * as React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'ghost' | 'outline';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand/90',
  ghost: 'text-muted hover:text-text hover:bg-panel-2',
  outline: 'border border-border text-text hover:bg-panel-2',
};
const SIZES: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-xs',
  md: 'h-9 px-3.5 text-sm',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  active?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'ghost', size = 'md', active, className, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none',
        VARIANTS[variant], SIZES[size],
        active && 'bg-panel-2 text-text ring-1 ring-brand/40',
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
