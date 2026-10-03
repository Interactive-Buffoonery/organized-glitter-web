/** Dashboard page - displays user projects with filtering, sorting, and search */

import React, { useEffect, useMemo, useRef } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { usePostHog } from '@posthog/react';

import { ColoringDashboardPane } from '@/components/coloring/ColoringDashboardPane';
import DashboardFilters from '@/components/dashboard/DashboardFilters';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import { DashboardShell, type DashboardMode } from '@/components/dashboard/DashboardShell';
import ProjectsSection from '@/components/dashboard/ProjectsSection';
import MainLayout from '@/components/layout/MainLayout';
import {
  ColoringFilterProvider,
  getInitialColoringFiltersFromUrl,
} from '@/contexts/ColoringFilterContext';
import { FilterProvider, useFilterHelpers, useFilters } from '@/contexts/FilterContext';
import { getInitialFiltersFromNavigationContext } from '@/contexts/FilterContext/navigationContextHydration';
import { getDiamondPageCorrection } from '@/contexts/FilterContext/diamondPageCorrection';
import {
  getInitialFiltersFromUrl,
  LEGACY_URL_FILTER_PARAMS,
  URL_FILTER_PARAMS,
} from '@/contexts/FilterContext/urlHydration';
import { RecentlyEditedProvider, useRecentlyEdited } from '@/contexts/RecentlyEditedContext';
import { DashboardFilterContext } from '@/hooks/mutations/useSaveNavigationContext';
import { useDashboardNavigationContext } from '@/hooks/queries/useDashboardNavigationContext';
import { useMobileDevice } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useEnabledVerticals } from '@/hooks/useEnabledVerticals';
import { useAppReady } from '@/hooks/useAppReady';
import { notify } from '@/lib/notifications';
import { getDashboardMode, getDashboardModeSearchParams } from '@/pages/dashboardUrlParams';
import { AnalyticsEvent } from '@/services/analytics-events';
import { createLogger } from '@/utils/logger';
import { restorePageScrollY } from '@/utils/scrollPosition';

const logger = createLogger('Dashboard');

const URL_FILTER_PARAM_NAMES: ReadonlyArray<string> = [
  ...URL_FILTER_PARAMS,
  ...LEGACY_URL_FILTER_PARAMS,
];

/**
 * Whether the URL carries any filter params we recognize. When true, the URL
 * is the authoritative hydration source and the cold-mount DB fallback should
 * stay disabled, explicit deep-link/share intent must win over preferences.
 */
const hasUrlFilterParams = (searchParams: URLSearchParams): boolean =>
  URL_FILTER_PARAM_NAMES.some(name => searchParams.has(name));

const DiamondDashboardPane: React.FC = () => {
  const { isMobile } = useMobileDevice();
  const routeLocation = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { filters } = useFilters();
  const { updatePage } = useFilterHelpers();
  const { setRecentlyEditedProjectId } = useRecentlyEdited();
  const dashboardData = useDashboardData(user?.id, filters);
  const correctedPage = getDiamondPageCorrection({
    currentPage: filters.currentPage,
    totalPages: dashboardData.totalPages,
    isSuccess: dashboardData.isSuccessProjects,
    isFetching: dashboardData.isFetchingProjects,
    isPlaceholderData: dashboardData.isPlaceholderProjects,
  });
  const isCorrectingPage =
    correctedPage !== null ||
    (dashboardData.isPlaceholderProjects &&
      dashboardData.isFetchingProjects &&
      dashboardData.projects.length === 0);

  useEffect(() => {
    if (correctedPage !== null) updatePage(correctedPage, { replace: true });
  }, [correctedPage, updatePage]);

  const restoreState = routeLocation.state as {
    fromEdit?: boolean;
    editedProjectId?: string;
    editedProjectData?: unknown;
    timestamp?: number;
    navigationContext?: DashboardFilterContext;
    preservePosition?: boolean;
  } | null;

  // Unified scroll/highlight restoration. Triggers on every back navigation
  // that carries a navigationContext (plain "back" from project detail OR
  // edit-return). Scroll restore runs in both cases; the toast and recently
  // edited highlight only run on edit-return so plain back is silent.
  useEffect(() => {
    if (!restoreState?.navigationContext) return;

    let scrollTimeout: number | undefined;
    try {
      const scrollPosition =
        restoreState.navigationContext.preservationContext?.scrollPosition || 0;
      // Defer until React has painted the rehydrated grid so the scroll target exists.
      scrollTimeout = window.setTimeout(() => {
        restorePageScrollY(scrollPosition, 'smooth');
        logger.debug('Restored scroll position', { scrollPosition });

        // Clear location.state after the restore work runs so the effect
        // cleanup cannot cancel the scheduled scroll.
        navigate(routeLocation.pathname + routeLocation.search, {
          replace: true,
          state: null,
        });
      }, 100);

      if (restoreState.fromEdit && restoreState.editedProjectId) {
        setRecentlyEditedProjectId(restoreState.editedProjectId);
        window.setTimeout(() => {
          setRecentlyEditedProjectId(null);
        }, 3000);
        notify({
          kind: 'info',
          title: 'Position Restored',
          description: 'Returned to your previous location after editing.',
        });
      }
    } catch (error) {
      logger.error('Error during dashboard restoration', error);
    }

    return () => {
      if (scrollTimeout) window.clearTimeout(scrollTimeout);
    };
  }, [
    restoreState,
    navigate,
    routeLocation.pathname,
    routeLocation.search,
    setRecentlyEditedProjectId,
  ]);

  return (
    <>
      <DashboardHeader
        isFetchingProjects={dashboardData.isFetchingProjects}
        totalItems={dashboardData.totalItems}
        totalItemsIsEstimate={dashboardData.totalItemsIsEstimate}
        isLoadingProjects={dashboardData.isLoadingProjects}
        showPageTitle={false}
        showCreateButton={false}
      />

      <div
        className={`grid grid-cols-1 gap-8 ${
          !isMobile ? 'lg:[grid-template-columns:260px_minmax(0,1fr)]' : ''
        }`}
      >
        {!isMobile && (
          <div>
            <DashboardFilters />
          </div>
        )}
        <div className="min-w-0">
          <ProjectsSection dashboardData={dashboardData} isCorrectingPage={isCorrectingPage} />
        </div>
      </div>
    </>
  );
};

interface DiamondDashboardWithProviderProps {
  user: NonNullable<ReturnType<typeof useAuth>['user']>;
  hydratedNavigationContext?: DashboardFilterContext;
}

/**
 * Mounts FilterProvider with a one-shot composed initial state. The ref
 * captures `{ ...navContextHydration, ...urlHydration }` exactly once so URL
 * params (the public, shareable surface) override saved-state fields when
 * both are present. Subsequent re-renders never re-evaluate the ref.
 */
const DiamondDashboardWithProvider: React.FC<DiamondDashboardWithProviderProps> = ({
  user,
  hydratedNavigationContext,
}) => {
  const [searchParams] = useSearchParams();

  const initialFiltersRef = useRef({
    ...getInitialFiltersFromNavigationContext(hydratedNavigationContext),
    ...getInitialFiltersFromUrl(searchParams),
  });

  return (
    <FilterProvider user={user} initialFilters={initialFiltersRef.current}>
      <RecentlyEditedProvider>
        <DiamondDashboardPane />
      </RecentlyEditedProvider>
    </FilterProvider>
  );
};

function ColoringDashboardWithProvider({
  user,
}: {
  user: NonNullable<ReturnType<typeof useAuth>['user']>;
}) {
  const [searchParams] = useSearchParams();
  const initialFiltersRef = useRef(getInitialColoringFiltersFromUrl(searchParams));

  return (
    <ColoringFilterProvider user={user} initialFilters={initialFiltersRef.current}>
      <ColoringDashboardPane userId={user.id} />
    </ColoringFilterProvider>
  );
}

function DiamondDashboardRoute({
  user,
}: {
  user: NonNullable<ReturnType<typeof useAuth>['user']>;
}) {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const dashboardLocationState = location.state as {
    navigationContext?: DashboardFilterContext;
  } | null;

  // Capture the hydration decision once at mount. The internal restoration
  // effect later clears location.state via navigate(replace, {state: null}),
  // and we don't want that to flip the cold-mount DB fetch on for a second
  // pass.
  const initialDecisionRef = useRef({
    locationStateContext: dashboardLocationState?.navigationContext,
    hasUrlFilters: hasUrlFilterParams(searchParams),
  });

  // Cold-mount DB fallback (Option 2): only fetch when no faster source exists.
  // - URL params present → user has explicit filter intent; respect it.
  // - location.state present → fresh dashboard snapshot from back button; use it.
  // - Neither → load the user's last persisted snapshot from PocketBase.
  const shouldFetchSavedContext =
    Boolean(user?.id) &&
    !initialDecisionRef.current.locationStateContext &&
    !initialDecisionRef.current.hasUrlFilters;

  const savedContextQuery = useDashboardNavigationContext(user?.id, {
    enabled: shouldFetchSavedContext,
  });

  const hydratedNavigationContext = useMemo(() => {
    if (initialDecisionRef.current.locationStateContext) {
      return initialDecisionRef.current.locationStateContext;
    }
    return savedContextQuery.data ?? undefined;
  }, [savedContextQuery.data]);

  // Brief loading state only while waiting on the cold-mount DB fetch. Other
  // hydration paths (URL or location-state) render the dashboard immediately.
  if (shouldFetchSavedContext && savedContextQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  return (
    <DiamondDashboardWithProvider
      user={user}
      hydratedNavigationContext={hydratedNavigationContext}
    />
  );
}

const Dashboard: React.FC = () => {
  // Dismiss splash on page mount; verticals/saved-context still use in-app spinners.
  useAppReady();
  const { user } = useAuth();
  const posthog = usePostHog();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    diamond_painting: canUseDiamond,
    coloring_books: canUseColoring,
    isLoading: isLoadingVerticals,
  } = useEnabledVerticals(user?.id);

  const activeMode = getDashboardMode(searchParams);

  const handleModeChange = (mode: DashboardMode) => {
    if (mode === activeMode) return;

    posthog.capture(AnalyticsEvent.DASHBOARD_MODE_CHANGED, {
      from_mode: activeMode,
      to_mode: mode,
      can_use_diamond: canUseDiamond,
      can_use_coloring: canUseColoring,
    });

    setSearchParams(current => getDashboardModeSearchParams(current, mode), { replace: false });
  };

  if (!user) {
    return null;
  }

  if (!isLoadingVerticals && activeMode === 'coloring-books' && !canUseColoring) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!isLoadingVerticals && activeMode === 'diamond' && !canUseDiamond && canUseColoring) {
    return <Navigate to="/dashboard?craft=coloring" replace />;
  }

  return (
    <MainLayout currentPage="Library">
      <DashboardShell
        activeMode={activeMode}
        canUseDiamond={canUseDiamond}
        canUseColoring={canUseColoring}
        onModeChange={handleModeChange}
      >
        {isLoadingVerticals && activeMode !== 'diamond' ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="text-muted-foreground size-6 animate-spin" />
          </div>
        ) : activeMode === 'coloring-books' ? (
          <ColoringDashboardWithProvider user={user} />
        ) : (
          <DiamondDashboardRoute user={user} />
        )}
      </DashboardShell>
    </MainLayout>
  );
};

export default Dashboard;
