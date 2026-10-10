import { notify } from '@/lib/notifications';
import { useMemo, useEffect, useState, useCallback, memo } from 'react';

import { OverviewActivityList } from '@/components/overview/OverviewActivityList';
import { OverviewCraftTabs } from '@/components/overview/OverviewCraftTabs';
import { OverviewRightRail } from '@/components/overview/OverviewRightRail';
import { OverviewSortControl } from '@/components/overview/OverviewSortControl';
import { WelcomeSection } from '@/components/overview/WelcomeSection';
import { Button } from '@/components/ui/button';
import { OverviewErrorBoundary } from '@/components/error/ComponentErrorBoundaries';
import {
  DEFAULT_OVERVIEW_SORT,
  OVERVIEW_SORT_OPTIONS,
  sortOverviewItems,
  type OverviewSortId,
} from '@/features/overview/sort-options';
import MainLayout from '@/components/layout/MainLayout';
import { useProfileData } from '@/hooks/queries/useUserProfileQuery';
import { useOverviewData } from '@/hooks/queries/useOverviewData';
import { useAppReady } from '@/hooks/useAppReady';
import { useAuth } from '@/hooks/useAuth';
import { useEnabledVerticals } from '@/hooks/useEnabledVerticals';
import { usePerformanceMonitoring } from '@/hooks/usePerformanceMonitoring';
import type { OverviewCraftFilter, OverviewFeedItem } from '@/services/pocketbase/overview.service';
import { OverviewService } from '@/services/pocketbase/overview.service';
import { logger } from '@/utils/logger';
import { AlertCircle } from 'lucide-react';

const ACTIVE_CRAFT_STORAGE_KEY = 'og.overview.activeCraftFilter';
const ACTIVE_SORT_STORAGE_KEY = 'og.overview.activeSort';

const isCraftFilter = (value: string | null): value is OverviewCraftFilter =>
  value === 'all' || value === 'diamond' || value === 'coloring';

const isOverviewSort = (value: string | null): value is OverviewSortId =>
  OVERVIEW_SORT_OPTIONS.some(option => option.id === value);

const readInitialCraftFilter = (): OverviewCraftFilter => {
  if (typeof window === 'undefined') {
    return 'all';
  }

  const stored = window.localStorage.getItem(ACTIVE_CRAFT_STORAGE_KEY);
  return isCraftFilter(stored) ? stored : 'all';
};

const readInitialSort = (): OverviewSortId => {
  if (typeof window === 'undefined') {
    return DEFAULT_OVERVIEW_SORT;
  }

  const stored = window.localStorage.getItem(ACTIVE_SORT_STORAGE_KEY);
  return isOverviewSort(stored) ? stored : DEFAULT_OVERVIEW_SORT;
};

const isVisibleOverviewItem = (item: OverviewFeedItem): boolean =>
  item.kind === 'diamond-project' || item.kind === 'coloring-page';

const getFallbackCraftFilter = (
  activeCraftFilter: OverviewCraftFilter,
  canUseDiamond: boolean,
  canUseColoring: boolean
): OverviewCraftFilter => {
  if (activeCraftFilter === 'diamond' && !canUseDiamond) return canUseColoring ? 'coloring' : 'all';
  if (activeCraftFilter === 'coloring' && !canUseColoring) return canUseDiamond ? 'diamond' : 'all';
  if (activeCraftFilter === 'all' && !canUseDiamond && canUseColoring) return 'coloring';
  if (activeCraftFilter === 'all' && canUseDiamond && !canUseColoring) return 'diamond';
  return activeCraftFilter;
};

const ErrorIcon = memo(() => <AlertCircle className="size-8 text-red-600 dark:text-red-400" />);
ErrorIcon.displayName = 'ErrorIcon';

const Overview = () => {
  useEffect(() => {
    const mountTime = performance.now();
    logger.debug(`[Overview] Overview mounted at: ${mountTime}`, { component: 'Overview' });

    return () => {
      logger.debug(`[Overview] Overview unmounted at: ${performance.now()}`, {
        component: 'Overview',
      });
    };
  }, []);

  const { user, isLoading: authLoading } = useAuth();
  const { profile, isLoading: profileLoading } = useProfileData(user?.id);
  const {
    diamond_painting: canUseDiamond,
    coloring_books: canUseColoring,
    isLoading: verticalsLoading,
  } = useEnabledVerticals(user?.id);

  // Dismiss splash on mount; auth/profile still use in-app loading UI.
  useAppReady();

  const { logPerformanceReport } = usePerformanceMonitoring({
    enabled: true,
    componentName: 'Overview Page',
    trackToAnalytics: false,
  });

  const criticalUserEmail = user?.email || '';
  const displayName = useMemo(() => profile?.username || '', [profile?.username]);
  const [activeCraftFilter, setActiveCraftFilter] =
    useState<OverviewCraftFilter>(readInitialCraftFilter);
  const [activeSort, setActiveSort] = useState<OverviewSortId>(readInitialSort);

  const visibleCraftFilter = getFallbackCraftFilter(
    activeCraftFilter,
    canUseDiamond,
    canUseColoring
  );
  const overviewQuery = useOverviewData({
    verticals: { diamond_painting: canUseDiamond, coloring_books: canUseColoring },
    enabled: !verticalsLoading,
  });
  const overviewData = overviewQuery.data ?? OverviewService.empty();
  const visibleItems = useMemo(() => {
    const renderableItems = overviewData.items.filter(isVisibleOverviewItem);
    const filteredItems =
      visibleCraftFilter === 'all'
        ? renderableItems
        : renderableItems.filter(item => item.craft === visibleCraftFilter);
    return sortOverviewItems(filteredItems, activeSort);
  }, [activeSort, overviewData.items, visibleCraftFilter]);

  const handleCraftFilterChange = useCallback((nextFilter: OverviewCraftFilter) => {
    setActiveCraftFilter(nextFilter);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ACTIVE_CRAFT_STORAGE_KEY, nextFilter);
    }
  }, []);

  const handleSortChange = useCallback((nextSort: OverviewSortId) => {
    setActiveSort(nextSort);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ACTIVE_SORT_STORAGE_KEY, nextSort);
    }
  }, []);

  useEffect(() => {
    if (!overviewQuery.isLoading && import.meta.env.DEV) {
      const loadTime = performance.now();
      logger.debug(`[Overview] Overview data loaded at: ${loadTime}`, {
        component: 'Overview',
        itemsCount: overviewData.items.length,
      });
      const timerId = setTimeout(logPerformanceReport, 100);
      return () => clearTimeout(timerId);
    }
  }, [overviewQuery.isLoading, overviewData.items.length, logPerformanceReport]);

  useEffect(() => {
    if (overviewQuery.error && user?.id && overviewQuery.isError) {
      const error = overviewQuery.error;
      const isCancellation = (() => {
        if (error instanceof Error && error.name === 'AbortError') return true;
        const errorMessage = error instanceof Error ? error.message : String(error);
        const lower = errorMessage.toLowerCase();
        if (
          lower.includes('canceled') ||
          lower.includes('cancelled') ||
          lower.includes('aborted')
        ) {
          return true;
        }
        if (error && typeof error === 'object') {
          const errorObj = error as { code?: string };
          if (errorObj.code === 'ERR_CANCELED' || errorObj.code === 'ABORT_ERR') return true;
        }
        return false;
      })();

      if (!isCancellation) {
        notify({
          kind: 'error',
          title: 'Overview unavailable',
          description: 'Failed to load your active projects. Please try again.',
        });
      }
    }
  }, [overviewQuery.error, user?.id, overviewQuery.isError]);

  if (authLoading) {
    return (
      <MainLayout currentPage="Overview">
        <div
          className="flex min-h-[60vh] items-center justify-center"
          role="status"
          aria-live="polite"
        >
          <div
            className="border-t-primary size-12 animate-spin rounded-full border-4"
            aria-hidden="true"
          />
          <p className="text-muted-foreground ml-3">Loading…</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout currentPage="Overview">
      <OverviewErrorBoundary onCacheRefresh={overviewQuery.refetch} hasInfrastructureError={false}>
        <div className="container mx-auto px-4 py-8 lg:py-12">
          <WelcomeSection
            displayName={displayName}
            avatarUrl={profile?.avatarUrl || null}
            avatarType={null}
            email={criticalUserEmail}
            isLoadingProfile={profileLoading}
          />

          <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
            <section aria-labelledby="in-progress-heading">
              <div className="mb-6 flex flex-col items-start gap-5">
                <h2
                  id="in-progress-heading"
                  className="text-foreground m-0 inline-flex items-center gap-2.5 text-sm font-semibold tracking-tight"
                >
                  <span
                    aria-hidden="true"
                    className="bg-primary inline-block h-[2px] w-[22px] rounded-sm"
                  />
                  In progress
                </h2>
                <div className="flex w-full flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <OverviewCraftTabs
                    value={visibleCraftFilter}
                    canUseDiamond={canUseDiamond}
                    canUseColoring={canUseColoring}
                    onValueChange={handleCraftFilterChange}
                  />
                  <OverviewSortControl value={activeSort} onValueChange={handleSortChange} />
                </div>
              </div>

              {overviewQuery.isError && overviewData.items.length === 0 ? (
                <div className="space-y-6 py-12 text-center">
                  <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
                    <ErrorIcon />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-foreground text-lg font-medium">Unable to load Overview</h3>
                    <p className="text-muted-foreground mx-auto max-w-md">
                      There was a problem loading your active projects. Please try again.
                    </p>
                  </div>
                  <div className="flex flex-col justify-center gap-3 sm:flex-row">
                    <Button type="button" onClick={() => overviewQuery.refetch()} variant="glass">
                      Try again
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => window.location.reload()}
                    >
                      Refresh page
                    </Button>
                  </div>
                </div>
              ) : (
                <OverviewActivityList
                  items={visibleItems}
                  activeCraftFilter={visibleCraftFilter}
                  isLoading={overviewQuery.isLoading || verticalsLoading}
                  isError={overviewQuery.isError}
                  onRetry={() => overviewQuery.refetch()}
                />
              )}
            </section>

            <OverviewRightRail
              snapshot={overviewData.snapshot}
              canUseDiamond={canUseDiamond}
              canUseColoring={canUseColoring}
              isLoading={overviewQuery.isLoading || verticalsLoading}
            />
          </div>
        </div>
      </OverviewErrorBoundary>
    </MainLayout>
  );
};

export default Overview;
