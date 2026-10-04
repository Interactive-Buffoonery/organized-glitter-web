/**
 * Modern projects data fetching hook using structured service layer
 * Provides unified project queries with optimized performance and type safety
 * @author @serabi
 * @created 2025-01-16
 */

import { useMemo, useEffect, useRef } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { createLogger } from '@/utils/logger';
import { DashboardValidSortField } from '@/features/dashboard/dashboard.constants';
import { StatusBreakdown } from '@/types/dashboard';
import { queryKeys, ProjectQueryParams } from './queryKeys';
import { useRenderGuard, useThrottledLogger } from '@/utils/query/renderGuards';
import { projectsService } from '@/services/pocketbase/projects.service';
import { getFileUrl } from '@/lib/pocketbase';
import type { CompanyListItem } from '@/services/pocketbase/companies.service';
import type { ArtistListItem } from '@/services/pocketbase/artists.service';
import { ProjectFilterCriteria, ProjectQueryOptions } from '@/types/projectFilters';
import { Project } from '@/types/project';
import { userScopedQueryOptions } from './shared/queryUtils';

export interface UseProjectsParams {
  userId: string | undefined;
  filters: ProjectFilterCriteria;
  sortField: DashboardValidSortField;
  sortDirection: 'asc' | 'desc';
  currentPage: number;
  pageSize: number;
  enabled?: boolean;
}

export interface ProjectsResult {
  projects: Project[];
  totalItems: number;
  /** True when totalItems is a lower bound (items.length) because PocketBase's skipTotal optimization suppressed the count query and the returned page was full. UI renders a "+" suffix. */
  totalItemsIsEstimate: boolean;
  totalPages: number;
  statusCounts: StatusBreakdown;
}

const logger = createLogger('useProjects');

/**
 * Optimized project fetching using service layer
 */
const fetchProjects = async (
  params: ProjectQueryParams & { userId: string },
  availableCompanies?: CompanyListItem[],
  availableArtists?: ArtistListItem[]
): Promise<ProjectsResult> => {
  const { userId, filters, sortField, sortDirection, currentPage, pageSize } = params;

  // Enhanced dev logging for Dashboard performance monitoring
  if (import.meta.env.DEV) {
    logger.info('🎯 [DASHBOARD] useProjects: Starting project fetch', {
      userId,
      status: filters.status,
      currentPage,
      pageSize,
      sortField,
      sortDirection,
      hasCompanies: !!availableCompanies?.length,
      hasArtists: !!availableArtists?.length,
    });
  }

  const fetchStartTime = performance.now();

  // Create lookup maps for O(1) performance from PocketBase response objects
  const companyMap = availableCompanies?.length
    ? new Map(availableCompanies.map(c => [c.id, c.name]))
    : new Map();

  const artistMap = availableArtists?.length
    ? new Map(availableArtists.map(a => [a.id, a.name]))
    : new Map();

  const queryOptions: ProjectQueryOptions = {
    filters: { ...filters, userId },
    sort: {
      field: sortField,
      direction: sortDirection,
    },
    page: currentPage,
    pageSize,
    expand: {
      // Dashboard grid does not render tags; disable to reduce payload
      tags: false,
      company: false,
      artist: false,
      user: false,
    },
    includeStatusCounts: false,
  };

  // Use optimized service query
  const result = await projectsService.getProjects(queryOptions, companyMap, artistMap);

  const fetchEndTime = performance.now();
  const fetchDuration = fetchEndTime - fetchStartTime;

  // Enhanced dev logging for Dashboard performance monitoring
  if (import.meta.env.DEV) {
    logger.info('✅ [DASHBOARD] useProjects: Project fetch completed', {
      fetchDuration: `${Math.round(fetchDuration)}ms`,
      projectsReturned: result.projects.length,
      totalItems: result.totalItems,
      totalPages: result.totalPages,
      hasStatusCounts: !!result.statusCounts,
      statusCounts: result.statusCounts,
    });
  }

  // Resolve image URLs in hook layer (services return raw filenames per CONTRACTS.md §5)
  const projects = result.projects.map(p => ({
    ...p,
    imageUrl: p.imageUrl
      ? getFileUrl({ id: p.id, collectionName: 'projects' }, p.imageUrl, '600x400')
      : undefined,
  }));

  return {
    projects,
    totalItems: result.totalItems,
    totalItemsIsEstimate: result.totalItemsIsEstimate,
    totalPages: result.totalPages,
    statusCounts: result.statusCounts || {
      wishlist: 0,
      purchased: 0,
      stash: 0,
      kitted: 0,
      progress: 0,
      onhold: 0,
      completed: 0,
      archived: 0,
      destashed: 0,
    },
  };
};

/**
 * Modern React Query hook for fetching projects with optimized performance
 * Uses structured service layer and eliminates expensive fallback patterns
 * Following React Query dependent query pattern
 */
export const useProjects = (
  {
    userId,
    filters,
    sortField,
    sortDirection,
    currentPage,
    pageSize,
    enabled = true,
  }: UseProjectsParams,
  availableCompanies?: CompanyListItem[],
  availableArtists?: ArtistListItem[]
) => {
  const queryClient = useQueryClient();

  // Create stable filter signature to prevent object recreation
  const filtersSignature = useMemo(() => {
    if (!filters) return '';
    return JSON.stringify({
      status: filters.status,
      company: filters.company,
      artist: filters.artist,
      drillShape: filters.drillShape,
      yearFinished: filters.yearFinished,
      includeMiniKits: filters.includeMiniKits,
      includeDestashed: filters.includeDestashed,
      includeArchived: filters.includeArchived,
      searchTerm: filters.searchTerm,
      searchAllFields: filters.searchAllFields,
      selectedTags: filters.selectedTags?.slice().sort().join(',') || '',
    });
  }, [filters]);

  // Memoize stable filters based on signature
  const stableFilters = useMemo(() => filters, [filtersSignature]); // eslint-disable-line react-hooks/exhaustive-deps -- using signature for stable reference

  // Memoize query parameters with stable filter reference
  const queryParams: ProjectQueryParams = useMemo(
    () => ({
      filters: stableFilters,
      sortField,
      sortDirection,
      currentPage,
      pageSize,
    }),
    [stableFilters, sortField, sortDirection, currentPage, pageSize]
  );

  // Use render guard to track excessive re-renders.
  // Threshold accounts for React Query lifecycle updates + React 19's slightly
  // higher per-interaction commit count versus React 18 (raised from 8 → 14
  // during the React 19 upgrade; not a real regression).
  const { getRenderStats } = useRenderGuard('useProjects', 14);
  const { shouldLog } = useThrottledLogger('useProjects', 1000);

  // Stabilize metadata signatures for query key
  const companiesSignature = useMemo(
    () =>
      availableCompanies
        ?.map(c => c.id)
        .sort()
        .join(',') || '',
    [availableCompanies]
  );
  const artistsSignature = useMemo(
    () =>
      availableArtists
        ?.map(a => a.id)
        .sort()
        .join(',') || '',
    [availableArtists]
  );

  // Enhanced debug logging with render trigger analysis
  useEffect(() => {
    const { renderCount, isExcessive } = getRenderStats();
    if (shouldLog() && isExcessive) {
      logger.debug('🔄 useProjects called (modernized)', {
        userId,
        status: stableFilters.status,
        queryKey: queryKeys.projects.list(userId || '', queryParams),
        enabled: !!userId && enabled,
        renderCount,
        isExcessive,
        // Render trigger debugging
        filtersSignature,
        companiesSignature,
        artistsSignature,
        queryParamsSignature: JSON.stringify(queryParams),
        availableCompaniesCount: availableCompanies?.length || 0,
        availableArtistsCount: availableArtists?.length || 0,
      });
    }
  }, [
    userId,
    enabled,
    stableFilters.status,
    getRenderStats,
    shouldLog,
    // Use signatures instead of full objects to reduce re-renders
    filtersSignature,
    companiesSignature,
    artistsSignature,
    queryParams,
    availableCompanies?.length,
    availableArtists?.length,
  ]);

  const {
    data,
    error,
    isFetching,
    isLoading,
    isSuccess,
    isPlaceholderData,
    isRefetching,
    isStale,
    refetch,
  } = useQuery({
    ...userScopedQueryOptions({
      queryKey: [
        ...queryKeys.projects.list(userId || '', queryParams),
        companiesSignature,
        artistsSignature,
      ],
      queryFn: () =>
        fetchProjects({ userId: userId!, ...queryParams }, availableCompanies, availableArtists),
      userId,
      freshness: 'statusCount',
    }),
    enabled: !!userId && enabled,
    placeholderData: keepPreviousData,
  });

  // Stabilize prefetch dependencies and prevent prefetch during initial loading
  const shouldPrefetch = Boolean(
    userId &&
    data?.totalPages &&
    currentPage < data.totalPages &&
    !isPlaceholderData &&
    !isLoading && // Don't prefetch during initial load
    !isRefetching // Don't prefetch during refetch
  );

  // Prefetch next page for better UX with stabilized dependencies
  // Prevent redundant prefetches across quick re-renders using a content key
  const lastPrefetchKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (shouldPrefetch) {
      if (!userId) {
        return;
      }

      const nextPageParams: ProjectQueryParams = {
        ...queryParams,
        currentPage: currentPage + 1,
      };

      const prefetchKey = JSON.stringify({
        userId,
        nextPageParams,
        companiesSignature,
        artistsSignature,
      });

      if (lastPrefetchKeyRef.current === prefetchKey) {
        return; // already prefetched with same parameters
      }

      queryClient.prefetchQuery({
        queryKey: [
          ...queryKeys.projects.list(userId, nextPageParams),
          companiesSignature,
          artistsSignature,
        ],
        queryFn: () =>
          fetchProjects({ userId, ...nextPageParams }, availableCompanies, availableArtists),
        staleTime: 2 * 60 * 1000, // Same as main query
      });

      lastPrefetchKeyRef.current = prefetchKey;
      logger.debug('🔄 Prefetched next page:', currentPage + 1);
    }
  }, [
    shouldPrefetch,
    queryParams,
    queryClient,
    companiesSignature,
    artistsSignature,
    userId,
    currentPage,
    availableCompanies,
    availableArtists,
  ]);

  return {
    data,
    error,
    isFetching,
    isLoading,
    isSuccess,
    isPlaceholderData,
    isStale,
    refetch,
  };
};
