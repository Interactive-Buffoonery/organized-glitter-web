import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ImportStep = 1 | 2 | 3;

interface ImportStepRailProps {
  currentStep: ImportStep;
  labels?: [string, string, string];
  className?: string;
}

const DEFAULT_LABELS: [string, string, string] = ['Select', 'Review', 'Import'];

export function ImportStepRail({
  currentStep,
  labels = DEFAULT_LABELS,
  className,
}: ImportStepRailProps) {
  return (
    <ol
      aria-label="Import progress"
      className={cn('flex items-center gap-2 text-xs sm:gap-3', className)}
    >
      {labels.map((label, index) => {
        const stepNumber = (index + 1) as ImportStep;
        const isComplete = stepNumber < currentStep;
        const isCurrent = stepNumber === currentStep;
        const isFuture = stepNumber > currentStep;

        return (
          <React.Fragment key={label}>
            <li aria-current={isCurrent ? 'step' : undefined} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn(
                  'inline-flex size-5 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums transition-colors',
                  isComplete && 'border-primary bg-primary text-primary-foreground',
                  isCurrent && 'border-primary text-primary ring-primary/25 bg-transparent ring-2',
                  isFuture && 'border-border text-muted-foreground/70 bg-transparent'
                )}
              >
                {isComplete ? (
                  <Check className="size-3" aria-label="completed" />
                ) : (
                  <span>{stepNumber}</span>
                )}
              </span>
              <span
                className={cn(
                  'font-medium tracking-wide uppercase transition-colors',
                  'text-[10px] sm:text-xs',
                  isComplete && 'text-primary',
                  isCurrent && 'text-foreground',
                  isFuture && 'text-muted-foreground/70'
                )}
              >
                {label}
              </span>
            </li>
            {index < labels.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  'bg-border relative h-px flex-1 overflow-hidden rounded-sm',
                  'min-w-[12px] sm:min-w-[24px]'
                )}
              >
                <span
                  className={cn(
                    'bg-primary absolute inset-y-0 left-0 transition-[width] duration-300 ease-out',
                    stepNumber < currentStep ? 'w-full' : 'w-0'
                  )}
                />
              </span>
            )}
          </React.Fragment>
        );
      })}
    </ol>
  );
}
