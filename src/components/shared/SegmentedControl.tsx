import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type SegmentedOptionIcon = React.ComponentType<{ className?: string }>;

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  accessibleLabel?: string;
  icon?: SegmentedOptionIcon;
  srOnlyLabel?: boolean;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: Array<SegmentedControlOption<T>>;
  onValueChange: (value: T) => void;
  className?: string;
  buttonClassName?: string;
  ariaLabel?: string;
  disabled?: boolean;
  /**
   * Visual style. `solid` is the default (bold purple active state). `glass` swaps
   * the bold solid for a subtle iOS-style glass lozenge so the control sits well
   * inside translucent panels.
   */
  variant?: 'solid' | 'glass';
}

function SegmentedControl<T extends string>({
  value,
  options,
  onValueChange,
  className,
  buttonClassName,
  ariaLabel,
  disabled = false,
  variant = 'solid',
}: SegmentedControlProps<T>) {
  if (variant === 'glass') {
    return (
      <div
        role="group"
        aria-label={ariaLabel}
        className={cn(
          'relative flex w-full rounded-xl p-1',
          'border border-[hsl(var(--glass-border))] bg-[hsl(var(--glass-bg))]',
          'shadow-[inset_0_1px_0_hsl(var(--glass-highlight)),0_1px_3px_rgba(0,0,0,0.06)]',
          'backdrop-blur-xl backdrop-saturate-150',
          disabled && 'opacity-60',
          className
        )}
      >
        {options.map(option => {
          const Icon = option.icon;
          const isActive = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled || option.disabled}
              aria-pressed={isActive}
              aria-label={option.accessibleLabel}
              onClick={() => onValueChange(option.value)}
              className={cn(
                'relative flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-1.5 pointer-coarse:min-h-11',
                'text-sm font-medium transition-all',
                'focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none',
                'disabled:pointer-events-none',
                isActive
                  ? cn(
                      'text-foreground',
                      'bg-[hsl(var(--primary)/0.18)]',
                      'shadow-[inset_0_1px_0_hsl(var(--glass-highlight)),0_1px_4px_rgba(0,0,0,0.08)]',
                      'ring-1 ring-[hsl(var(--primary)/0.35)]'
                    )
                  : 'text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--glass-highlight)/0.5)]',
                buttonClassName
              )}
            >
              {Icon ? <Icon className="size-4 shrink-0" /> : null}
              <span className={cn(option.srOnlyLabel && 'sr-only')}>{option.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn('flex w-full rounded-md shadow-sm', className)}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option, index) => {
        const Icon = option.icon;
        const isFirst = index === 0;
        const isLast = index === options.length - 1;
        const isActive = option.value === value;

        return (
          <Button
            key={option.value}
            type="button"
            variant={isActive ? 'default' : 'outline'}
            disabled={disabled || option.disabled}
            aria-label={option.accessibleLabel}
            className={cn(
              'min-w-0 flex-1 gap-2 px-3 py-2 pointer-coarse:min-h-11',
              isFirst ? 'rounded-l-md' : 'rounded-l-none',
              isLast ? 'rounded-r-md' : 'rounded-r-none',
              buttonClassName
            )}
            aria-pressed={isActive}
            onClick={() => onValueChange(option.value)}
          >
            {Icon ? <Icon className="size-4 shrink-0" /> : null}
            <span className={cn(option.srOnlyLabel && 'sr-only')}>{option.label}</span>
          </Button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
