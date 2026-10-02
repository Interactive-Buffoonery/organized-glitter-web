import { useId, useMemo, useState } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { usePostHog } from '@posthog/react';

import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import {
  OVERVIEW_SORT_OPTIONS,
  type OverviewSortId,
  type OverviewSortOption,
} from '@/features/overview/sort-options';
import { AnalyticsEvent } from '@/services/analytics-events';

interface OverviewSortControlProps {
  value: OverviewSortId;
  onValueChange: (value: OverviewSortId) => void;
}

interface OverviewSortOptionsProps {
  value: OverviewSortId;
  onSelect: (option: OverviewSortOption) => void;
  titleId: string;
}

function OverviewSortOptions({ value, onSelect, titleId }: OverviewSortOptionsProps) {
  return (
    <div role="radiogroup" aria-labelledby={titleId} className="space-y-1">
      {OVERVIEW_SORT_OPTIONS.map(option => {
        const isSelected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(option)}
            className={cn(
              'focus-visible:ring-ring flex min-h-11 w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none',
              'hover:bg-muted/60',
              isSelected && 'bg-primary/10'
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border-2',
                isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/40'
              )}
            >
              {isSelected && <span className="bg-background size-1.5 rounded-full" />}
            </span>
            <span className="min-w-0">
              <span className="text-foreground block text-sm font-medium">{option.label}</span>
              <span className="text-muted-foreground block text-xs">{option.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function OverviewSortControl({ value, onValueChange }: OverviewSortControlProps) {
  const posthog = usePostHog();
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const titleId = useId();
  const descriptionId = useId();
  const selectedOption = useMemo(
    () => OVERVIEW_SORT_OPTIONS.find(option => option.id === value) ?? OVERVIEW_SORT_OPTIONS[0],
    [value]
  );

  const handleSelect = (option: OverviewSortOption) => {
    onValueChange(option.id);
    if (option.id !== value) {
      posthog.capture(AnalyticsEvent.OVERVIEW_SORT_CHANGED, {
        surface: 'overview',
        sort_field: option.id,
      });
    }
    setOpen(false);
  };

  const trigger = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-10 gap-2"
      aria-label={`Sort activity by ${selectedOption.label}`}
    >
      <ArrowUpDown className="size-4" aria-hidden="true" />
      <span>{selectedOption.label}</span>
    </Button>
  );

  if (isMobile) {
    return (
      <>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 gap-2"
          aria-label={`Sort activity by ${selectedOption.label}`}
          onClick={() => setOpen(true)}
        >
          <ArrowUpDown className="size-4" aria-hidden="true" />
          <span>{selectedOption.label}</span>
        </Button>
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent
            className="max-h-[85dvh] px-4 pb-6"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
          >
            <DrawerTitle id={titleId} className="mt-6">
              Sort activity
            </DrawerTitle>
            <DrawerDescription id={descriptionId} className="mt-1">
              Choose how active projects and pages are ordered.
            </DrawerDescription>
            <div className="mt-4">
              <OverviewSortOptions value={value} onSelect={handleSelect} titleId={titleId} />
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="end">
        <h3 id={titleId} className="px-2 pb-2 text-sm font-semibold">
          Sort activity
        </h3>
        <OverviewSortOptions value={value} onSelect={handleSelect} titleId={titleId} />
      </PopoverContent>
    </Popover>
  );
}
