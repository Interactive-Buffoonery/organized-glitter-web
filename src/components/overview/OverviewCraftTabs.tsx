import { usePostHog } from '@posthog/react';
import { cn } from '@/lib/utils';
import { AnalyticsEvent } from '@/services/analytics-events';
import type { OverviewCraftFilter } from '@/services/pocketbase/overview.service';

interface OverviewCraftTabsProps {
  value: OverviewCraftFilter;
  canUseDiamond: boolean;
  canUseColoring: boolean;
  onValueChange: (value: OverviewCraftFilter) => void;
}

const OPTIONS: Array<{ value: OverviewCraftFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'diamond', label: 'Diamond paintings' },
  { value: 'coloring', label: 'Coloring pages' },
];

export function OverviewCraftTabs({
  value,
  canUseDiamond,
  canUseColoring,
  onValueChange,
}: OverviewCraftTabsProps) {
  const posthog = usePostHog();
  const visibleOptions = OPTIONS.filter(option => {
    if (option.value === 'all') return canUseDiamond && canUseColoring;
    if (option.value === 'diamond') return canUseDiamond;
    return canUseColoring;
  });

  if (visibleOptions.length <= 1) {
    return null;
  }

  return (
    <div
      className="border-border/70 bg-muted/35 inline-flex max-w-full rounded-xl border p-1"
      role="group"
      aria-label="Filter active projects"
    >
      {visibleOptions.map(option => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => {
              onValueChange(option.value);
              if (option.value !== value) {
                posthog.capture(AnalyticsEvent.OVERVIEW_CRAFT_FILTER_CHANGED, {
                  surface: 'overview',
                  from_craft: value,
                  to_craft: option.value,
                });
              }
            }}
            className={cn(
              'min-h-9 rounded-lg px-3 py-1.5 text-sm font-semibold tracking-tight whitespace-nowrap transition-colors pointer-coarse:min-h-11',
              'focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none',
              isActive
                ? 'bg-primary/20 text-foreground ring-primary/35 shadow-[inset_0_1px_0_hsl(var(--glass-highlight)),0_1px_4px_rgba(0,0,0,0.08)] ring-1'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
