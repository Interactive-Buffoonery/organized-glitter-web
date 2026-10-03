import { useMemo } from 'react';
import { cn } from '@/lib/utils';

const TEXT_LINK_CLASSES =
  'text-foreground decoration-primary/50 hover:decoration-primary text-sm font-medium underline decoration-2 underline-offset-4 transition-colors focus-visible:ring-ring/50 focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:outline-none';
import type { DashboardValidSortField } from '@/features/dashboard/dashboard.constants';
import { findSortOption, type SortDirection } from '@/features/dashboard/sort-options';

interface ResultsSummaryBarProps {
  totalItems: number;
  /** When true, totalItems is a lower bound (PocketBase's skipTotal path). Render a "+" suffix. */
  totalItemsIsEstimate?: boolean;
  isLoading: boolean;
  sortField: DashboardValidSortField;
  sortDirection: SortDirection;
  activeFilterCount: number;
  activeFilterLabel: string | null;
  onClearAll: () => void;
}

const ResultsSummaryBar = ({
  totalItems,
  totalItemsIsEstimate = false,
  isLoading,
  sortField,
  sortDirection,
  activeFilterCount,
  activeFilterLabel,
  onClearAll,
}: ResultsSummaryBarProps) => {
  const sortOption = useMemo(
    () => findSortOption(sortField, sortDirection),
    [sortField, sortDirection]
  );

  const countLabel = isLoading
    ? 'Loading projects…'
    : `${totalItems.toLocaleString()}${totalItemsIsEstimate ? '+' : ''} ${totalItems === 1 ? 'project' : 'projects'}`;

  return (
    <div
      className={cn(
        'text-muted-foreground flex flex-col gap-1 border-b pb-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1'
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-x-3">
        <span className="text-foreground font-medium">{countLabel}</span>
        <span aria-hidden="true">·</span>
        <span>
          Sorted by <span className="text-foreground">{sortOption.label}</span>
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 sm:contents">
        {activeFilterLabel && (
          <>
            <span className="hidden sm:inline" aria-hidden="true">
              ·
            </span>
            <span className="min-w-0 truncate">{activeFilterLabel}</span>
          </>
        )}
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className={cn(TEXT_LINK_CLASSES, 'sm:ml-auto')}
          >
            Clear All
          </button>
        )}
      </div>
    </div>
  );
};

export default ResultsSummaryBar;
