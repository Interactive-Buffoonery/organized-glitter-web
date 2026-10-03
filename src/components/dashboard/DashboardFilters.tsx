import React from 'react';
import { usePostHog } from '@posthog/react';
import FilterDropdown from '@/components/dashboard/FilterDropdown';
import TagMultiSelectFilter from '@/components/dashboard/TagMultiSelectFilter';
import ViewToggle from '@/components/dashboard/ViewToggle';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Label } from '@/components/ui/label';
import { useFilters, useFilterHelpers } from '@/contexts/FilterContext';
import { getDashboardFilterPanelSummary } from '@/contexts/FilterContext/types';
import { useAvailableYears } from '@/hooks/queries/useAvailableYears';
import { useIsMobile } from '@/hooks/use-mobile';
import { AnalyticsEvent } from '@/services/analytics-events';

interface DashboardFiltersProps {
  /**
   * Skip the outer card styling and the "Filters" heading. Used when the
   * component is embedded inside a sheet or drawer that already provides
   * its own frame and title.
   */
  hideHeader?: boolean;
  /**
   * Skip the View toggle section. Used on mobile where the view toggle
   * lives on the canvas for immediate visual feedback, inside the filter
   * sheet a user can't see the grid change, so putting it there was a UX
   * trap.
   */
  hideViewToggle?: boolean;
  /**
   * Skip the in-panel "Reset All Filters" button. Used when the surrounding
   * container provides its own reset control (e.g. the mobile drawer footer).
   */
  hideResetButton?: boolean;
}

const DashboardFiltersComponent: React.FC<DashboardFiltersProps> = React.memo(
  ({ hideHeader = false, hideViewToggle = false, hideResetButton = false }) => {
    const isMobile = useIsMobile();
    const { filters, companies, artists, tags: allTags, setFilters } = useFilters();
    const {
      updateCompany,
      updateArtist,
      updateDrillShape,
      updateYearFinished,
      resetDashboardFilterPanel,
      updateViewType,
      updateTags,
    } = useFilterHelpers();
    const posthog = usePostHog();

    const companiesOptions = companies.map(company => ({
      label: company.name,
      value: company.id,
    }));

    const artistsOptions = artists.map(artist => ({
      label: artist.name,
      value: artist.id,
    }));

    const drillShapesOptions = [
      { label: 'Round', value: 'round' },
      { label: 'Square', value: 'square' },
    ];

    const updateIncludeMiniKits = (value: boolean) => setFilters({ includeMiniKits: value });
    const updateIncludeDestashed = (value: boolean) => setFilters({ includeDestashed: value });
    const updateIncludeArchived = (value: boolean) => setFilters({ includeArchived: value });

    const { data: availableYears = [] } = useAvailableYears();
    const yearFinishedOptions = availableYears.map(year => ({
      label: year.toString(),
      value: year.toString(),
    }));

    const activeStatus = filters.activeStatus;
    const selectedCompany = filters.selectedCompany;
    const selectedArtist = filters.selectedArtist;
    const selectedDrillShape = filters.selectedDrillShape;
    const selectedTags = filters.selectedTags;
    const selectedYearFinished = filters.selectedYearFinished;
    const includeMiniKits = filters.includeMiniKits;
    const includeDestashed = filters.includeDestashed;
    const includeArchived = filters.includeArchived;
    const viewType = filters.viewType;
    const filterPanelSummary = getDashboardFilterPanelSummary(filters);

    const content = (
      <>
        {!hideHeader && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-foreground m-0 inline-flex items-center gap-2.5 text-sm font-semibold tracking-tight">
              <span
                aria-hidden="true"
                className="bg-primary inline-block h-[2px] w-[22px] rounded-sm"
              />
              Filters
            </h2>
            {filterPanelSummary.count > 0 && (
              <Badge variant="secondary">{filterPanelSummary.badgeText}</Badge>
            )}
          </div>
        )}

        <div className="space-y-4 md:space-y-5">
          <FilterDropdown
            label="Company"
            options={companiesOptions}
            value={selectedCompany}
            onChange={updateCompany}
            placeholder="All companies"
          />

          <FilterDropdown
            label="Artist"
            options={artistsOptions}
            value={selectedArtist}
            onChange={updateArtist}
            placeholder="All artists"
          />

          <FilterDropdown
            label="Drill Shape"
            options={drillShapesOptions}
            value={selectedDrillShape}
            onChange={updateDrillShape}
            placeholder="All drill shapes"
          />

          <TagMultiSelectFilter
            label="Tags"
            options={allTags?.map(tag => ({ label: tag.name, value: tag.id })) || []}
            selectedValues={selectedTags}
            onChange={updateTags}
            placeholder="All tags"
            inline={isMobile}
          />

          <FilterDropdown
            label="Year Finished"
            options={yearFinishedOptions}
            value={selectedYearFinished}
            onChange={updateYearFinished}
            placeholder="All years"
          />

          <div className="border-border/60 border-t pt-5">
            <h3 className="text-foreground mb-3 text-sm leading-relaxed font-semibold md:mb-4">
              Include in results
            </h3>
            <div className="space-y-3 md:space-y-4">
              <div className="flex items-center gap-x-3">
                <Checkbox
                  id="include-mini-kits"
                  checked={includeMiniKits}
                  onCheckedChange={checked => updateIncludeMiniKits(Boolean(checked))}
                  data-testid="include-mini-kits-checkbox"
                />
                <Label htmlFor="include-mini-kits" className="text-sm font-normal">
                  Mini Kits
                </Label>
              </div>

              <div className="flex items-center gap-x-3">
                <Checkbox
                  id="include-destashed-kits"
                  checked={includeDestashed}
                  onCheckedChange={checked => updateIncludeDestashed(Boolean(checked))}
                  disabled={activeStatus !== 'everything'}
                  data-testid="include-destashed-checkbox"
                />
                <Label
                  htmlFor="include-destashed-kits"
                  className={`text-sm font-normal ${activeStatus !== 'everything' ? 'text-muted-foreground' : ''}`}
                >
                  Destashed Kits
                </Label>
              </div>

              <div className="flex items-center gap-x-3">
                <Checkbox
                  id="include-archived-kits"
                  checked={includeArchived}
                  onCheckedChange={checked => updateIncludeArchived(Boolean(checked))}
                  disabled={activeStatus !== 'everything'}
                  data-testid="include-archived-checkbox"
                />
                <Label
                  htmlFor="include-archived-kits"
                  className={`text-sm font-normal ${activeStatus !== 'everything' ? 'text-muted-foreground' : ''}`}
                >
                  Archived Kits
                </Label>
              </div>
            </div>
          </div>

          {!hideViewToggle && (
            <div className="space-y-2 md:space-y-3">
              <h3 className="text-sm font-semibold">View</h3>
              <ViewToggle
                activeView={viewType}
                onViewChange={nextView => {
                  updateViewType(nextView);
                  posthog.capture(AnalyticsEvent.DASHBOARD_VIEW_TOGGLED, { to: nextView });
                }}
              />
            </div>
          )}

          {!hideResetButton && (
            <Button
              variant="outline"
              onClick={() => resetDashboardFilterPanel()}
              className="w-full"
              data-testid="reset-filters-button"
            >
              Reset All Filters
            </Button>
          )}
        </div>
      </>
    );

    if (hideHeader) {
      return <div data-testid="dashboard-filters">{content}</div>;
    }

    return (
      <GlassPanel className="p-4 md:sticky md:top-20 md:p-6" data-testid="dashboard-filters">
        {content}
      </GlassPanel>
    );
  }
);

DashboardFiltersComponent.displayName = 'DashboardFilters';

export default DashboardFiltersComponent;
