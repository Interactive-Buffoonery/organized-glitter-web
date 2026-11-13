import { usePostHog } from '@posthog/react';
import SegmentedControl from '@/components/shared/SegmentedControl';
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
    <SegmentedControl
      value={value}
      options={visibleOptions}
      variant="glass"
      ariaLabel="Filter active projects"
      className="w-fit max-w-full"
      buttonClassName="min-h-9 flex-none px-2.5 whitespace-nowrap"
      onValueChange={next => {
        onValueChange(next);
        if (next !== value) {
          posthog.capture(AnalyticsEvent.OVERVIEW_CRAFT_FILTER_CHANGED, {
            surface: 'overview',
            from_craft: value,
            to_craft: next,
          });
        }
      }}
    />
  );
}
