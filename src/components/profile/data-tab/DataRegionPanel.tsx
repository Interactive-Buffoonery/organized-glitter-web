import * as React from 'react';
import { ArrowDownToLine, ArrowUpFromLine, History } from 'lucide-react';
import { GlassPanel } from '@/components/ui/glass-panel';
import { cn } from '@/lib/utils';

type DataRegionDirection = 'out' | 'in' | 'restore';

interface DataRegionPanelProps {
  direction: DataRegionDirection;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  'aria-busy'?: boolean;
}

const DIRECTION_META: Record<
  DataRegionDirection,
  {
    Icon: React.ComponentType<{ className?: string }>;
    tint: string;
    glow: string;
  }
> = {
  out: {
    Icon: ArrowUpFromLine,
    tint: 'text-primary',
    glow: 'bg-primary/10',
  },
  in: {
    Icon: ArrowDownToLine,
    tint: 'text-primary',
    glow: 'bg-primary/10',
  },
  restore: {
    Icon: History,
    tint: 'text-muted-foreground',
    glow: 'bg-muted-foreground/10',
  },
};

export function DataRegionPanel({
  direction,
  title,
  description,
  children,
  className,
  'aria-busy': ariaBusy,
}: DataRegionPanelProps) {
  const headingId = React.useId();
  const { Icon, tint, glow } = DIRECTION_META[direction];

  return (
    <GlassPanel
      role="region"
      aria-labelledby={headingId}
      aria-busy={ariaBusy}
      className={cn('p-6 md:p-8', className)}
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
        <span
          aria-hidden
          className={cn(
            'inline-flex size-11 shrink-0 items-center justify-center rounded-xl',
            'border border-[hsl(var(--glass-border))]',
            glow
          )}
        >
          <Icon className={cn('size-5', tint)} />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <h2 id={headingId} className="text-foreground text-xl font-semibold tracking-tight">
            {title}
          </h2>
          {description && (
            <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">{description}</p>
          )}
        </div>
      </header>
      <div className="mt-6 space-y-6">{children}</div>
    </GlassPanel>
  );
}
