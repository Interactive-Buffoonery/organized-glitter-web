import { useQuery } from '@tanstack/react-query';
import { projectsService } from '@/services/pocketbase/projects.service';
import type { FilterState } from '@/contexts/FilterContext';
import type { DashboardValidSortField } from '@/features/dashboard/dashboard.constants';
import {
  buildProjectUndatedCountFilters,
  buildProjectUndatedCountQueryKey,
  getProjectUndatedSentinelField,
} from './projectCollectionQuery';

/**
 * Queries the total count of projects missing a value for the current sort
 * field (respecting the user's other active filters). Used by divider labels
 * like "Kits with no purchase date (16 kits)" so the count matches the full
 * filtered view, not just the current page.
 *
 * Returns null when the sort field doesn't have a corresponding sentinel
 * (kit_name, last_updated, status, company, artist). Callers should treat
 * null as "no count available" and render the divider label without a count.
 */
export const useUndatedProjectCount = (
  userId: string | undefined,
  sortField: DashboardValidSortField,
  filters: FilterState
) => {
  const sentinelField = getProjectUndatedSentinelField(sortField);
  const filterCriteria = buildProjectUndatedCountFilters(filters);

  const { data, error, isLoading } = useQuery({
    queryKey: buildProjectUndatedCountQueryKey(userId ?? '', sortField, filters),
    queryFn: async () => {
      if (!userId || !sentinelField) return null;
      return projectsService.getUndatedCount({ ...filterCriteria, userId }, sentinelField);
    },
    enabled: !!userId && !!sentinelField,
    staleTime: 30_000,
  });

  return {
    count: data ?? null,
    isLoading,
    error,
  };
};
