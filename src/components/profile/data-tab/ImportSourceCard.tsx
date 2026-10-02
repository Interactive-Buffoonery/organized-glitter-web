import * as React from 'react';
import { cn } from '@/lib/utils';
import { ImportStepRail, type ImportStep } from './ImportStepRail';

interface ImportSourceCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  formats: React.ReactNode;
  step: ImportStep;
  children: React.ReactNode;
  className?: string;
}

export function ImportSourceCard({
  icon: Icon,
  title,
  description,
  formats,
  step,
  children,
  className,
}: ImportSourceCardProps) {
  return (
    <article
      className={cn(
        'border-border/50 bg-card/40 rounded-xl border p-5 sm:p-6',
        'shadow-[inset_0_1px_0_hsl(var(--glass-highlight))]',
        className
      )}
    >
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Icon className="text-primary size-4 shrink-0" aria-hidden />
          <h3 className="text-foreground text-base font-semibold tracking-tight">{title}</h3>
          <span className="flex flex-wrap items-center gap-1">{formats}</span>
        </div>
        {description && (
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">{description}</p>
        )}
        <ImportStepRail currentStep={step} className="pt-1" />
      </header>
      <div className="mt-5 space-y-4">{children}</div>
    </article>
  );
}
