import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Search, SlidersHorizontal, X } from 'lucide-react';
import { usePostHog } from '@posthog/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import TagMultiSelectFilter from '@/components/dashboard/TagMultiSelectFilter';
import LibraryViewToggle from '@/components/shared/LibraryViewToggle';
import { COLORING_BOOK_STATUS_OPTIONS } from '@/constants/coloringBookMetadata';
import { cn } from '@/lib/utils';
import { AnalyticsEvent } from '@/services/analytics-events';
import { getSearchAnalyticsProperties } from '@/services/coloring-analytics';
import {
  getColoringFilterPanelCount,
  useColoringFilterHelpers,
  useColoringFilters,
} from '@/contexts/ColoringFilterContext';
import type { ColoringSortDirection, ColoringSortField } from '@/contexts/ColoringFilterContext';

const SORT_OPTIONS: Array<{ value: ColoringSortField; label: string }> = [
  { value: 'date_added', label: 'Date added' },
  { value: 'title', label: 'Title' },
  { value: 'publisher', label: 'Publisher' },
  { value: 'completion', label: 'Progress' },
  { value: 'last_activity', label: 'Last activity' },
];

interface ColoringFilterPanelProps {
  /**
   * Skip the outer glass-card frame and the "Filters" heading. Used when
   * the panel is embedded inside a drawer that already supplies its own
   * frame and title.
   */
  hideHeader?: boolean;
  hideResetButton?: boolean;
  hideViewToggle?: boolean;
}

function FilterSection({
  label,
  isFirst = false,
  children,
}: {
  label: string;
  isFirst?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={cn('space-y-4', !isFirst && 'border-border/60 border-t pt-6')}>
      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</h3>
      {children}
    </section>
  );
}

export function ColoringFilterPanel({
  hideHeader = false,
  hideResetButton = false,
  hideViewToggle = false,
}: ColoringFilterPanelProps = {}) {
  const posthog = usePostHog();
  const { filters, publishers, illustrators, tags, viewType, setViewType, activeFilterCount } =
    useColoringFilters();
  const {
    updateStatuses,
    updatePublishers,
    updateIllustrators,
    updateTags,
    updateMysteryOnly,
    updateIncludeArchived,
    updateIncludeDestashed,
    clearActiveFilters,
  } = useColoringFilterHelpers();

  const publisherOptions = useMemo(
    () => publishers.map(p => ({ label: p.name, value: p.id })),
    [publishers]
  );
  const illustratorOptions = useMemo(
    () => illustrators.map(illustrator => ({ label: illustrator.name, value: illustrator.id })),
    [illustrators]
  );
  const tagOptions = useMemo(() => tags.map(tag => ({ label: tag.name, value: tag.id })), [tags]);

  const panelCount = getColoringFilterPanelCount(filters);
  const captureFilterChange = useCallback(
    (filterName: string, valueCount?: number) => {
      posthog.capture(AnalyticsEvent.COLORING_BOOKS_FILTER_CHANGED, {
        craft: 'coloring',
        surface: 'coloring_books',
        filter_name: filterName,
        value_count: valueCount,
        active_filter_count: activeFilterCount,
      });
    },
    [activeFilterCount, posthog]
  );
  const handleClearActiveFilters = useCallback(() => {
    posthog.capture(AnalyticsEvent.COLORING_BOOKS_FILTERS_CLEARED, {
      craft: 'coloring',
      surface: 'coloring_books',
      active_filter_count: activeFilterCount,
    });
    clearActiveFilters();
  }, [activeFilterCount, clearActiveFilters, posthog]);
  const handleViewChange = useCallback(
    (nextView: typeof viewType) => {
      setViewType(nextView);
      posthog.capture(AnalyticsEvent.COLORING_BOOKS_VIEW_TOGGLED, {
        craft: 'coloring',
        surface: 'coloring_books',
        to: nextView,
      });
    },
    [posthog, setViewType]
  );

  const content = (
    <>
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Filters</h2>
          {panelCount > 0 && <Badge variant="secondary">{panelCount} active</Badge>}
        </div>
      )}

      <div className="space-y-6">
        <FilterSection label="Library" isFirst={hideHeader}>
          <TagMultiSelectFilter
            label="Status"
            options={COLORING_BOOK_STATUS_OPTIONS.map(status => ({
              label: status.label,
              value: status.value,
            }))}
            selectedValues={filters.selectedStatuses}
            onChange={selected => {
              updateStatuses(selected as typeof filters.selectedStatuses);
              captureFilterChange('status', selected.length);
            }}
            placeholder="All active statuses"
            itemLabel={{ singular: 'status', plural: 'statuses' }}
          />

          <TagMultiSelectFilter
            label="Publisher"
            options={publisherOptions}
            selectedValues={filters.selectedPublishers}
            onChange={selected => {
              updatePublishers(selected);
              captureFilterChange('publisher', selected.length);
            }}
            placeholder="All publishers"
            itemLabel={{ singular: 'publisher', plural: 'publishers' }}
          />

          <TagMultiSelectFilter
            label="Illustrator"
            options={illustratorOptions}
            selectedValues={filters.selectedIllustrators}
            onChange={selected => {
              updateIllustrators(selected);
              captureFilterChange('illustrator', selected.length);
            }}
            placeholder="All illustrators"
            itemLabel={{ singular: 'illustrator', plural: 'illustrators' }}
          />

          <TagMultiSelectFilter
            label="Tags"
            options={tagOptions}
            selectedValues={filters.selectedTags}
            onChange={selected => {
              updateTags(selected);
              captureFilterChange('tag', selected.length);
            }}
            placeholder="All tags"
            itemLabel={{ singular: 'tag', plural: 'tags' }}
          />
        </FilterSection>

        <FilterSection label="Book">
          <div className="flex items-center justify-between">
            <Label htmlFor="coloring-mystery-toggle" className="text-sm font-normal">
              Mystery
            </Label>
            <Switch
              id="coloring-mystery-toggle"
              checked={filters.mysteryOnly}
              onCheckedChange={checked => {
                updateMysteryOnly(checked);
                captureFilterChange('mystery_only', checked ? 1 : 0);
              }}
            />
          </div>
        </FilterSection>

        <FilterSection label="Archive">
          {filters.selectedStatuses.length > 0 && (
            <p className="text-muted-foreground text-sm">
              Selected statuses control which books appear. Clear Status to use these switches.
            </p>
          )}
          <div className="flex items-center justify-between">
            <Label htmlFor="coloring-include-archived" className="text-sm font-normal">
              Archived books
            </Label>
            <Switch
              id="coloring-include-archived"
              checked={filters.includeArchived}
              disabled={filters.selectedStatuses.length > 0}
              onCheckedChange={checked => {
                updateIncludeArchived(checked);
                captureFilterChange('include_archived', checked ? 1 : 0);
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="coloring-include-destashed" className="text-sm font-normal">
              Destashed books
            </Label>
            <Switch
              id="coloring-include-destashed"
              checked={filters.includeDestashed}
              disabled={filters.selectedStatuses.length > 0}
              onCheckedChange={checked => {
                updateIncludeDestashed(checked);
                captureFilterChange('include_destashed', checked ? 1 : 0);
              }}
            />
          </div>
        </FilterSection>

        {!hideViewToggle && (
          <FilterSection label="View">
            <LibraryViewToggle activeView={viewType} onViewChange={handleViewChange} />
          </FilterSection>
        )}

        {!hideResetButton && (
          <Button
            type="button"
            variant="outline"
            onClick={handleClearActiveFilters}
            className="w-full"
            data-testid="coloring-reset-filters"
          >
            Reset filters
          </Button>
        )}
      </div>
    </>
  );

  if (hideHeader) {
    return <div className="space-y-5">{content}</div>;
  }

  return (
    <GlassPanel
      className="space-y-5 p-4 md:sticky md:top-20 md:p-6"
      role="region"
      aria-label="Coloring filters"
    >
      {content}
    </GlassPanel>
  );
}

interface ColoringControlsRowProps {
  /**
   * When true, render a glass "Filters" trigger button alongside the search
   * + sort controls. Use on viewports where the sidebar is collapsed.
   */
  showFilterTrigger?: boolean;
}

export function ColoringControlsRow({ showFilterTrigger = false }: ColoringControlsRowProps = {}) {
  const posthog = usePostHog();
  const { filters, viewType, setViewType, activeFilterCount, markUserInteraction } =
    useColoringFilters();
  const { updateSearch, updateSort } = useColoringFilterHelpers();
  const [localSearch, setLocalSearch] = useState(filters.searchTerm);
  const lastCommittedSearch = useRef(filters.searchTerm.trim());

  // Stay in sync if filters reset from elsewhere (e.g. URL hydration, panel reset).
  useEffect(() => {
    setLocalSearch(filters.searchTerm);
    lastCommittedSearch.current = filters.searchTerm.trim();
  }, [filters.searchTerm]);

  const commitSearch = useCallback(
    (term: string) => {
      updateSearch(term);
      const normalized = term.trim();
      if (normalized === lastCommittedSearch.current) return;
      lastCommittedSearch.current = normalized;
      if (!normalized) return;
      posthog.capture(
        AnalyticsEvent.COLORING_BOOKS_SEARCH_PERFORMED,
        getSearchAnalyticsProperties(normalized, {
          craft: 'coloring',
          surface: 'coloring_books',
          active_filter_count: activeFilterCount,
          had_filters: activeFilterCount > 0,
        })
      );
    },
    [activeFilterCount, posthog, updateSearch]
  );

  useEffect(() => {
    if (localSearch === filters.searchTerm) return;
    const timeout = window.setTimeout(() => commitSearch(localSearch), 350);
    return () => window.clearTimeout(timeout);
  }, [filters.searchTerm, localSearch, commitSearch]);

  const handleSearchSubmit = useCallback(
    (e: { preventDefault: () => void }) => {
      e.preventDefault();
      commitSearch(localSearch);
    },
    [commitSearch, localSearch]
  );

  const toggleSortDirection = useCallback(() => {
    const next: ColoringSortDirection = filters.sortDirection === 'desc' ? 'asc' : 'desc';
    updateSort(filters.sortField, next);
    posthog.capture(AnalyticsEvent.COLORING_BOOKS_SORT_CHANGED, {
      craft: 'coloring',
      surface: 'coloring_books',
      sort_field: filters.sortField,
      sort_direction: next,
    });
  }, [filters.sortField, filters.sortDirection, posthog, updateSort]);
  const handleSortFieldChange = useCallback(
    (value: string) => {
      const sortField = value as ColoringSortField;
      updateSort(sortField, filters.sortDirection);
      posthog.capture(AnalyticsEvent.COLORING_BOOKS_SORT_CHANGED, {
        craft: 'coloring',
        surface: 'coloring_books',
        sort_field: sortField,
        sort_direction: filters.sortDirection,
      });
    },
    [filters.sortDirection, posthog, updateSort]
  );
  const handleViewChange = useCallback(
    (nextView: typeof viewType) => {
      setViewType(nextView);
      posthog.capture(AnalyticsEvent.COLORING_BOOKS_VIEW_TOGGLED, {
        craft: 'coloring',
        surface: 'coloring_books',
        to: nextView,
      });
    },
    [posthog, setViewType]
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <form
        onSubmit={handleSearchSubmit}
        className="min-w-[14rem] flex-1 sm:max-w-md"
        role="search"
      >
        <div className="relative">
          <Search
            className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            id="coloring-search"
            type="search"
            value={localSearch}
            onChange={e => {
              markUserInteraction();
              setLocalSearch(e.target.value);
            }}
            onBlur={() => commitSearch(localSearch)}
            placeholder="Search title or author"
            className="pl-9 pointer-coarse:min-h-11"
            aria-label="Search coloring books"
          />
        </div>
      </form>

      <div className="flex items-center gap-2">
        <Select value={filters.sortField} onValueChange={handleSortFieldChange}>
          <SelectTrigger className="w-[11rem] pointer-coarse:min-h-11" aria-label="Sort by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="pointer-coarse:size-11"
          onClick={toggleSortDirection}
          aria-label={
            filters.sortDirection === 'desc'
              ? 'Sorted descending. Switch to ascending.'
              : 'Sorted ascending. Switch to descending.'
          }
        >
          {filters.sortDirection === 'desc' ? (
            <ArrowDown className="size-4" />
          ) : (
            <ArrowUp className="size-4" />
          )}
        </Button>
      </div>

      {showFilterTrigger && (
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="min-w-0 flex-1 sm:w-48 sm:flex-none">
            <LibraryViewToggle activeView={viewType} onViewChange={handleViewChange} />
          </div>
          <ColoringFilterSheetTrigger />
        </div>
      )}
    </div>
  );
}

function ColoringFilterSheetTrigger() {
  const posthog = usePostHog();
  const { filters } = useColoringFilters();
  const { clearActiveFilters } = useColoringFilterHelpers();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  const panelCount = getColoringFilterPanelCount(filters);

  return (
    <>
      <Button
        variant="outline"
        size="icon-touch"
        className={cn('relative shrink-0', panelCount > 0 && 'border-primary text-primary')}
        onClick={() => {
          posthog.capture(AnalyticsEvent.COLORING_BOOKS_FILTER_DRAWER_OPENED, {
            craft: 'coloring',
            surface: 'coloring_books',
            active_filter_count: panelCount,
          });
          setOpen(true);
        }}
        aria-label={panelCount > 0 ? `Filters (${panelCount} active)` : 'Open filters'}
      >
        <SlidersHorizontal className="size-5" />
        {panelCount > 0 && (
          <span
            aria-hidden="true"
            className="bg-primary text-primary-foreground absolute -top-1 -right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] leading-none font-bold"
          >
            {panelCount}
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
            Narrow your coloring books by status, creator, format, tags, and details.
          </DrawerDescription>
          <div className="flex h-full flex-col">
            <header className="flex items-start justify-between px-4 pt-2 pb-3">
              <div>
                <h2 id={titleId} className="text-lg font-semibold">
                  Filters
                </h2>
                <p id={descriptionId} className="text-muted-foreground mt-0.5 text-xs">
                  {panelCount === 0 ? 'No filters active' : `${panelCount} active`}
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
              <ColoringFilterPanel hideHeader hideResetButton hideViewToggle />
            </div>
            <footer className="bg-background flex items-center justify-end gap-3 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  posthog.capture(AnalyticsEvent.COLORING_BOOKS_FILTERS_CLEARED, {
                    craft: 'coloring',
                    surface: 'coloring_books',
                    active_filter_count: panelCount,
                  });
                  clearActiveFilters();
                }}
                disabled={panelCount === 0}
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
}
