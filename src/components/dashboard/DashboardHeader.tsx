import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { usePostHog } from '@posthog/react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, PlusCircle } from 'lucide-react';
import SearchProjects from '@/components/dashboard/SearchProjects';
import SortSheet from '@/components/dashboard/SortSheet';
import DashboardFilterSheet from '@/components/dashboard/DashboardFilterSheet';
import DashboardQuickViews from '@/components/dashboard/DashboardQuickViews';
import ViewToggle from '@/components/dashboard/ViewToggle';
import { useFilters, useFilterHelpers } from '@/contexts/FilterContext';
import { Checkbox } from '@/components/ui/checkbox';
import { useMobileDevice } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { AnalyticsEvent } from '@/services/analytics-events';
import { findSortOption } from '@/features/dashboard/sort-options';

interface DashboardHeaderProps {
  isFetchingProjects: boolean;
  totalItems: number;
  totalItemsIsEstimate?: boolean;
  isLoadingProjects: boolean;
  showPageTitle?: boolean;
  showCreateButton?: boolean;
}

const DashboardHeader = ({
  isFetchingProjects,
  totalItems,
  totalItemsIsEstimate = false,
  isLoadingProjects,
  showPageTitle = true,
  showCreateButton = true,
}: DashboardHeaderProps) => {
  const { filters, searchDraftResetVersion } = useFilters();
  const { updateSearch, updateSearchAllFields, updateViewType } = useFilterHelpers();
  const { isTablet } = useMobileDevice();
  const posthog = usePostHog();
  const previousSearchRef = useRef(filters.searchTerm);
  const [isSortSheetOpen, setIsSortSheetOpen] = useState(false);
  const searchAllFieldsMobileId = useId();
  const searchAllFieldsDesktopId = useId();

  const isSearchPending = isFetchingProjects && filters.searchTerm.length > 0;

  const currentSortOption = useMemo(
    () => findSortOption(filters.sortField, filters.sortDirection),
    [filters.sortField, filters.sortDirection]
  );

  const hasNonSearchFilters = useMemo(
    () =>
      filters.activeStatus !== 'everything' ||
      filters.selectedCompany !== 'all' ||
      filters.selectedArtist !== 'all' ||
      filters.selectedDrillShape !== 'all' ||
      filters.selectedYearFinished !== 'all' ||
      !filters.includeMiniKits ||
      filters.includeDestashed ||
      filters.includeArchived ||
      filters.searchAllFields ||
      filters.selectedTags.length > 0,
    [filters]
  );

  useEffect(() => {
    if (previousSearchRef.current === filters.searchTerm) {
      return;
    }

    previousSearchRef.current = filters.searchTerm;

    posthog.capture(AnalyticsEvent.DASHBOARD_SEARCH_PERFORMED, {
      term_length: filters.searchTerm.length,
      had_filters: hasNonSearchFilters,
    });
  }, [filters.searchTerm, hasNonSearchFilters, posthog]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <SearchProjects
              searchTerm={filters.searchTerm}
              resetVersion={searchDraftResetVersion}
              onSearchChange={updateSearch}
              isPending={isSearchPending}
            />
          </div>
          <Button
            variant="outline"
            size="icon-touch"
            className="shrink-0"
            onClick={() => setIsSortSheetOpen(true)}
            aria-label={`Sort projects. Current sort: ${currentSortOption.label}`}
          >
            <ArrowUpDown className="size-5" />
          </Button>
          <DashboardFilterSheet
            totalItems={totalItems}
            totalItemsIsEstimate={totalItemsIsEstimate}
            isLoadingProjects={isLoadingProjects}
          />
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle
            activeView={filters.viewType}
            onViewChange={nextView => {
              updateViewType(nextView);
              posthog.capture(AnalyticsEvent.DASHBOARD_VIEW_TOGGLED, { to: nextView });
            }}
          />
          <DashboardQuickViews compact />
        </div>
        {isTablet && (
          <label
            htmlFor={searchAllFieldsMobileId}
            className="text-muted-foreground flex cursor-pointer items-center gap-2 text-sm select-none"
          >
            <Checkbox
              id={searchAllFieldsMobileId}
              checked={filters.searchAllFields}
              onCheckedChange={v => updateSearchAllFields(Boolean(v))}
            />
            <span>Also search notes + source URLs (slower)</span>
          </label>
        )}
      </div>

      <div className="hidden lg:block">
        {showPageTitle && (
          <div>
            <h1 className="font-handwritten text-3xl leading-tight tracking-tight md:text-4xl">
              Dashboard
            </h1>
          </div>
        )}

        <div className={cn('flex flex-wrap items-center gap-3', showPageTitle && 'mt-4')}>
          <div className="w-full max-w-md xl:w-auto xl:min-w-[16rem] xl:flex-1">
            <SearchProjects
              searchTerm={filters.searchTerm}
              resetVersion={searchDraftResetVersion}
              onSearchChange={updateSearch}
              isPending={isSearchPending}
            />
          </div>
          <label
            htmlFor={searchAllFieldsDesktopId}
            className="text-muted-foreground order-last flex w-full cursor-pointer items-center gap-2 pl-4 text-sm select-none xl:order-none xl:w-auto xl:pl-0"
          >
            <Checkbox
              id={searchAllFieldsDesktopId}
              checked={filters.searchAllFields}
              onCheckedChange={v => updateSearchAllFields(Boolean(v))}
            />
            <span>Also search notes + source URLs (slower)</span>
          </label>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => setIsSortSheetOpen(true)}
            aria-label={`Sort projects. Current sort: ${currentSortOption.label}`}
          >
            <ArrowUpDown className="mr-2 size-4" />
            <span className="text-muted-foreground">Sort:</span>
            <span className="ml-1 font-medium">{currentSortOption.label}</span>
          </Button>
          <DashboardQuickViews />
          {showCreateButton && (
            <Button asChild variant="default" size="sm" className="pointer-coarse:min-h-11">
              <Link to="/projects/new">
                <PlusCircle className="mr-2 size-4" />
                Add New Project
              </Link>
            </Button>
          )}
        </div>
      </div>

      <SortSheet
        open={isSortSheetOpen}
        onOpenChange={setIsSortSheetOpen}
        resultCount={totalItems}
      />
    </div>
  );
};

export default DashboardHeader;
