import * as React from 'react';
import { cn } from '@/lib/utils';

type GlassPanelProps = React.HTMLAttributes<HTMLDivElement>;

const GlassPanel = React.forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'relative overflow-hidden rounded-2xl',
        'border border-[hsl(var(--glass-border))]',
        'bg-[hsl(var(--glass-bg))]',
        'shadow-[inset_0_1px_0_hsl(var(--glass-highlight)),0_10px_30px_rgba(0,0,0,0.08)]',
        'backdrop-blur-xl backdrop-saturate-150',
        'dark:shadow-[inset_0_1px_0_hsl(var(--glass-highlight)),0_16px_40px_rgba(0,0,0,0.35)]',
        className
      )}
      {...props}
    />
  )
);
GlassPanel.displayName = 'GlassPanel';

export { GlassPanel };
