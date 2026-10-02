import { useEffect, useId } from 'react';
import { usePostHog } from '@posthog/react';
import { cn } from '@/lib/utils';
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { useFilters, useFilterHelpers } from '@/contexts/FilterContext';
import { AnalyticsEvent } from '@/services/analytics-events';
import { SORT_OPTION_GROUPS, type SortOption } from '@/features/dashboard/sort-options';

interface SortSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resultCount?: number;
}

interface SortListProps {
  selectedId: string;
  onSelect: (option: SortOption) => void;
  titleId: string;
  descriptionId: string;
  resultCount?: number;
}

const SortList = ({ selectedId, onSelect, titleId, descriptionId, resultCount }: SortListProps) => {
  const description =
    typeof resultCount === 'number'
      ? `Currently sorting ${resultCount} ${resultCount === 1 ? 'project' : 'projects'}`
      : 'Choose how projects are ordered';

  return (
    <div className="flex h-full flex-col">
      <header className="px-4 pt-2 pb-3 md:px-6 md:pt-0">
        <h2 id={titleId} className="text-lg font-semibold">
          Sort Projects
        </h2>
        <p id={descriptionId} className="text-muted-foreground mt-1 text-sm">
          {description}
        </p>
      </header>

      <div
        role="radiogroup"
        aria-labelledby={titleId}
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 md:px-4"
      >
        {SORT_OPTION_GROUPS.map(group => (
          <section key={group.id} className="mt-5 first:mt-0">
            <h3 className="text-muted-foreground px-1 pb-2 text-xs font-semibold tracking-wide uppercase">
              {group.heading}
            </h3>
            <ul className="bg-card overflow-hidden rounded-lg border">
              {group.options.map((option, index) => {
                const isSelected = option.id === selectedId;
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => onSelect(option)}
                      className={cn(
                        'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
                        'hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none focus-visible:ring-inset',
                        index > 0 && 'border-t',
                        isSelected && 'bg-primary/10'
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border-2',
                          isSelected
                            ? 'border-primary bg-primary'
                            : 'border-muted-foreground/40 bg-transparent'
                        )}
                      >
                        {isSelected && <span className="bg-background size-1.5 rounded-full" />}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span
                          className={cn(
                            'text-sm font-medium',
                            isSelected ? 'text-foreground' : 'text-foreground'
                          )}
                        >
                          {option.label}
                        </span>
                        <span className="text-muted-foreground text-xs">{option.subtitle}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
};

const SortSheet = ({ open, onOpenChange, resultCount }: SortSheetProps) => {
  const isMobile = useIsMobile();
  const posthog = usePostHog();
  const { filters } = useFilters();
  const { updateSort } = useFilterHelpers();
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    posthog.capture(AnalyticsEvent.DASHBOARD_SORT_SHEET_OPENED);
  }, [open, posthog]);

  const selectedId = `${filters.sortField}_${filters.sortDirection}`;

  const handleSelect = (option: SortOption) => {
    updateSort(option.field, option.direction);
    posthog.capture(AnalyticsEvent.DASHBOARD_SORT_CHANGED, {
      field: option.field,
      direction: option.direction,
      surface: 'header',
    });
    onOpenChange(false);
  };

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          className="h-[85dvh]"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
        >
          <DrawerTitle className="sr-only">Sort Projects</DrawerTitle>
          <DrawerDescription className="sr-only">Choose how projects are ordered</DrawerDescription>
          <SortList
            selectedId={selectedId}
            onSelect={handleSelect}
            titleId={titleId}
            descriptionId={descriptionId}
            resultCount={resultCount}
          />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full p-0 sm:max-w-md">
        <SheetTitle className="sr-only">Sort Projects</SheetTitle>
        <SheetDescription className="sr-only">Choose how projects are ordered</SheetDescription>
        <div className="flex h-full flex-col pt-6">
          <SortList
            selectedId={selectedId}
            onSelect={handleSelect}
            titleId={titleId}
            descriptionId={descriptionId}
            resultCount={resultCount}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default SortSheet;
