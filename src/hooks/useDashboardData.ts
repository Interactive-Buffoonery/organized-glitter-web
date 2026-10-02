/**
 * Dashboard data fetching hook with consistent metadata integration
 * Provides unified data fetching for Dashboard components with proper query key consistency
 * @author @serabi
 * @created 2025-07-04
 * @updated 2025-07-10
 */

import { useMemo } from 'react';
import { useProjects } from '@/hooks/queries/useProjects';
import { useDashboardTelemetry } from '@/hooks/useDashboardTelemetry';
import { FilterState } from '@/contexts/FilterContext';
import { useMetadata } from '@/contexts/MetadataContext';
import { toProjectFilterCriteria } from '@/services/pocketbase/projectQueryBuilder';

export const useDashboardData = (userId: string | undefined, filters: FilterState) => {
  // Use the debounced search term passed from context to avoid double debouncing
  // Projects query starts immediately when userId is available (parallel with metadata)

  // Get metadata for consistent query key generation across all useProjects calls
  const { companies, artists } = useMetadata();

  // Stabilize metadata arrays with optimized ID-based memoization
  const companiesSignature = useMemo(
    () =>
      companies
        ?.map(c => c.id)
        .sort()
        .join(',') || '',
    [companies]
  );

  const artistsSignature = useMemo(
    () =>
      artists
        ?.map(a => a.id)
        .sort()
        .join(',') || '',
    [artists]
  );

  // Pass PocketBase response objects directly to useProjects.
  // Key on the content signatures (not the array refs) so that MetadataContext
  // refetches returning identical ID sets don't churn the downstream query key
  // and trigger avoidable re-renders in useProjects. Matches the same
  // signature-keyed pattern used at useProjects.ts:214.
  const allCompanies = useMemo(() => {
    return Array.isArray(companies) ? companies : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- content-signature memoization
  }, [companiesSignature]);

  const allArtists = useMemo(() => {
    return Array.isArray(artists) ? artists : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- content-signature memoization
  }, [artistsSignature]);

  // Stabilize selectedTags array with content-based signature
  const selectedTagsSignature = useMemo(
    () => filters.selectedTags?.slice().sort().join(',') || '',
    [filters.selectedTags]
  );

  const filterCriteria = useMemo(
    () => toProjectFilterCriteria(filters),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depend on filter fields, not the FilterState ref, to avoid recomputing on pagination/sort changes
    [
      filters.activeStatus,
      filters.selectedCompany,
      filters.selectedArtist,
      filters.selectedDrillShape,
      filters.selectedYearFinished,
      filters.includeMiniKits,
      filters.includeDestashed,
      filters.includeArchived,
      filters.searchAllFields,
      filters.searchTerm,
      filters.selectedTags,
    ]
  );

  // Fetch data as soon as userId is available, no longer gated on metadata completion
  // This allows projects to load in parallel with companies/artists/tags
  const shouldFetchData = Boolean(userId);

  // Stabilize all useProjects parameters in a single memoized object
  const projectsParamsWithEnabled = useMemo(
    () => ({
      userId,
      filters: filterCriteria,
      sortField: filters.sortField,
      sortDirection: filters.sortDirection,
      currentPage: filters.currentPage,
      pageSize: filters.pageSize,
      enabled: shouldFetchData,
    }),
    [
      userId,
      filterCriteria,
      filters.sortField,
      filters.sortDirection,
      filters.currentPage,
      filters.pageSize,
      shouldFetchData,
    ]
  );

  // Pass metadata to useProjects for consistent query key generation
  const projectsQuery = useProjects(projectsParamsWithEnabled, allCompanies, allArtists);

  useDashboardTelemetry({
    userId,
    filters,
    filterCriteria,
    companiesSignature,
    artistsSignature,
    selectedTagsSignature,
    companiesCount: allCompanies.length,
    artistsCount: allArtists.length,
    projectsQuery,
  });

  return {
    projects: projectsQuery.data?.projects || [],
    totalItems: projectsQuery.data?.totalItems || 0,
    totalItemsIsEstimate: projectsQuery.data?.totalItemsIsEstimate ?? false,
    totalPages: projectsQuery.data?.totalPages || 0,
    isLoadingProjects: projectsQuery.isLoading,
    isFetchingProjects: projectsQuery.isFetching,
    isSuccessProjects: projectsQuery.isSuccess,
    isPlaceholderProjects: projectsQuery.isPlaceholderData,
    errorProjects: projectsQuery.error,
    refetchProjects: projectsQuery.refetch,
  };
};
