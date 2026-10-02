import { useEffect, useId, useState } from 'react';
import { usePostHog } from '@posthog/react';
import { SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { useFilters, useFilterHelpers } from '@/contexts/FilterContext';
import { getDashboardFilterPanelSummary } from '@/contexts/FilterContext/types';
import { useIsMobile } from '@/hooks/use-mobile';
import { AnalyticsEvent } from '@/services/analytics-events';
import DashboardFilters from '@/components/dashboard/DashboardFilters';
import { cn } from '@/lib/utils';

interface DashboardFilterSheetProps {
  totalItems: number;
  /** When true, totalItems is a lower bound (PocketBase's skipTotal path). Render a "+" suffix. */
  totalItemsIsEstimate?: boolean;
  isLoadingProjects: boolean;
}

const DashboardFilterSheet = ({
  totalItems,
  totalItemsIsEstimate = false,
  isLoadingProjects,
}: DashboardFilterSheetProps) => {
  const isMobile = useIsMobile();
  const { filters } = useFilters();
  const { resetDashboardFilterPanel } = useFilterHelpers();
  const posthog = usePostHog();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    posthog.capture(AnalyticsEvent.DASHBOARD_FILTER_DRAWER_OPENED, { surface: 'mobile' });
  }, [open, posthog]);

  if (!isMobile) return null;

  const filterPanelSummary = getDashboardFilterPanelSummary(filters);

  const triggerLabel =
    filterPanelSummary.count > 0 ? filterPanelSummary.triggerLabel : 'Open filters';

  const countLabel = isLoadingProjects
    ? 'Loading…'
    : `${totalItems.toLocaleString()}${totalItemsIsEstimate ? '+' : ''} ${totalItems === 1 ? 'project' : 'projects'}`;

  return (
    <>
      <Button
        variant="outline"
        size="icon-touch"
        className={cn(
          'relative shrink-0',
          filterPanelSummary.count > 0 && 'border-primary text-primary'
        )}
        onClick={() => setOpen(true)}
        aria-label={triggerLabel}
      >
        <SlidersHorizontal className="size-5" />
        {filterPanelSummary.count > 0 && (
          <span
            aria-hidden="true"
            className="bg-primary text-primary-foreground absolute -top-1 -right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] leading-none font-bold"
          >
            {filterPanelSummary.count}
          </span>
        )}
      </Button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent
          className="h-[70dvh]"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
        >
          <DrawerTitle className="sr-only">Filters</DrawerTitle>
          <DrawerDescription className="sr-only">
            Narrow the Library results by company, artist, tag, drill shape, and more.
          </DrawerDescription>
          <div className="flex h-full flex-col">
            <header className="flex items-start justify-between px-4 pt-2 pb-3">
              <div>
                <h2 id={titleId} className="text-lg font-semibold">
                  Filters
                </h2>
                <p id={descriptionId} className="text-muted-foreground mt-0.5 text-xs">
                  {filterPanelSummary.count === 0
                    ? 'No filters active'
                    : filterPanelSummary.activeText}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-touch"
                className="shrink-0"
                onClick={() => setOpen(false)}
                aria-label="Close filters"
              >
                <X className="size-5" />
              </Button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              <DashboardFilters hideHeader hideViewToggle hideResetButton />
            </div>
            <footer className="bg-background flex items-center justify-between gap-3 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <span
                aria-live="polite"
                className="text-muted-foreground min-w-0 flex-1 truncate text-sm"
              >
                Showing <span className="text-foreground font-medium">{countLabel}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => resetDashboardFilterPanel()}
                disabled={filterPanelSummary.count === 0}
              >
                Reset
              </Button>
              <Button variant="glass" size="sm" onClick={() => setOpen(false)}>
                Close filters
              </Button>
            </footer>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
};

export default DashboardFilterSheet;
