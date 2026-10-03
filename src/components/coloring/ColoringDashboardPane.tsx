import { useCallback, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import {
  getActiveColoringFilterCount,
  useColoringFilterHelpers,
  useColoringFilters,
  setColoringPaginationParams,
} from '@/contexts/ColoringFilterContext';
import { useColoringList } from '@/hooks/coloring/useColoringList';
import { useMobileDevice } from '@/hooks/use-mobile';
import { useAppReady } from '@/hooks/useAppReady';
import LibraryPagination from '@/components/ui/LibraryPagination';
import { Button } from '@/components/ui/button';

import { ColoringBookGrid } from './ColoringBookGrid';
import { ColoringControlsRow, ColoringFilterPanel } from './ColoringFilterStrip';

interface ColoringDashboardPaneProps {
  userId: string;
}

export function ColoringDashboardPane({ userId }: ColoringDashboardPaneProps) {
  const location = useLocation();
  const locationPathname = location.pathname;
  const locationSearch = location.search;
  const { isMobile } = useMobileDevice();
  const {
    books,
    isLoading,
    isFetching,
    isPlaceholderData,
    isSuccess,
    isError,
    refetch,
    page,
    pageSize,
    totalItems,
    totalPages,
  } = useColoringList({ userId });
  const { filters, viewType } = useColoringFilters();
  const { clearActiveFilters, updatePage, updatePageSize, updateSort } = useColoringFilterHelpers();
  // Dismiss splash on mount; coloring list still uses in-app loading UI.
  useAppReady();

  const hasActiveFilters = useMemo(() => getActiveColoringFilterCount(filters) > 0, [filters]);
  const lastValidPage = Math.max(1, totalPages ?? 1);
  const isCorrectingPage =
    isSuccess &&
    !isFetching &&
    !isPlaceholderData &&
    totalPages !== undefined &&
    filters.currentPage > lastValidPage;
  const getPageHref = useCallback(
    (nextPage: number) => {
      const params = setColoringPaginationParams(
        new URLSearchParams(locationSearch),
        nextPage,
        filters.pageSize
      );
      const search = params.toString();
      return `${locationPathname}${search ? `?${search}` : ''}`;
    },
    [filters.pageSize, locationPathname, locationSearch]
  );

  useEffect(() => {
    if (isCorrectingPage) {
      updatePage(lastValidPage, { replace: true });
    }
  }, [isCorrectingPage, lastValidPage, updatePage]);

  return (
    <>
      <ColoringControlsRow showFilterTrigger={isMobile} />

      <div
        className={`grid grid-cols-1 gap-8 ${
          !isMobile ? 'lg:[grid-template-columns:260px_minmax(0,1fr)]' : ''
        }`}
      >
        {!isMobile && (
          <div>
            <ColoringFilterPanel />
          </div>
        )}
        <div className="min-w-0">
          {isError && books.length === 0 ? (
            <div
              className="border-border/60 border-y px-6 py-12 text-center"
              role="alert"
              aria-atomic="true"
            >
              <h2 className="text-card-foreground text-xl font-semibold">
                Unable to load coloring books
              </h2>
              <p className="text-muted-foreground mt-2 text-sm">Try again in a moment.</p>
              <Button
                type="button"
                variant="outline"
                className="mt-5"
                disabled={isFetching}
                onClick={() => void refetch()}
              >
                {isFetching ? <Loader2 className="animate-spin" aria-hidden /> : null}
                {isFetching ? 'Trying again' : 'Try again'}
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {isError ? (
                <div
                  className="border-border/60 flex flex-col items-center justify-between gap-3 border-y px-4 py-4 text-center sm:flex-row sm:text-left"
                  role="alert"
                  aria-atomic="true"
                >
                  <p className="text-muted-foreground text-sm">
                    Could not refresh coloring books. Showing the last loaded results.
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isFetching}
                    onClick={() => void refetch()}
                  >
                    {isFetching ? <Loader2 className="animate-spin" aria-hidden /> : null}
                    {isFetching ? 'Trying again' : 'Try again'}
                  </Button>
                </div>
              ) : null}

              <ColoringBookGrid
                books={books}
                isLoading={isLoading || isPlaceholderData || isCorrectingPage}
                hasActiveFilters={hasActiveFilters}
                onClearFilters={clearActiveFilters}
                viewType={viewType}
                sortField={filters.sortField}
                sortDirection={filters.sortDirection}
                onSort={updateSort}
              />

              {!isCorrectingPage && totalItems !== undefined && totalItems > 0 ? (
                <LibraryPagination
                  currentPage={page}
                  totalPages={totalPages ?? 0}
                  pageSize={pageSize}
                  totalItems={totalItems}
                  onPageChange={updatePage}
                  onPageSizeChange={updatePageSize}
                  getPageHref={getPageHref}
                  itemLabel="book"
                  itemsLabel="books"
                  disabled={isError}
                  isLoading={isFetching}
                />
              ) : null}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
