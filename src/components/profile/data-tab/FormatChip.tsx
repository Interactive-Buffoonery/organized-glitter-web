import * as React from 'react';
import { cn } from '@/lib/utils';

type FormatChipProps = React.HTMLAttributes<HTMLSpanElement>;

export function FormatChip({ className, children, ...props }: FormatChipProps) {
  return (
    <span
      className={cn(
        'border-border/60 bg-muted/60 text-foreground',
        'inline-flex items-center rounded-sm border px-1.5 py-0.5',
        'font-mono text-[10px] leading-none tracking-tight uppercase',
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
