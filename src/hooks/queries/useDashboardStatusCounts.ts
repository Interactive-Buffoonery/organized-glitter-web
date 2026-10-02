import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FilterState } from '@/contexts/FilterContext';
import { userScopedQueryOptions } from './shared/queryUtils';
import { projectsService } from '@/services/pocketbase/projects.service';
import { ProjectFilterStatus } from '@/types/project';
import { StatusBreakdown } from '@/types/dashboard';
import {
  buildProjectStatusCountFilters,
  buildProjectStatusCountServiceFilters,
  buildProjectStatusCountsQueryKey,
} from './projectCollectionQuery';

const EMPTY_STATUS_COUNTS: StatusBreakdown = {
  wishlist: 0,
  purchased: 0,
  stash: 0,
  kitted: 0,
  progress: 0,
  onhold: 0,
  completed: 0,
  archived: 0,
  destashed: 0,
};

export type DashboardDisplayedStatusCounts = Record<ProjectFilterStatus, number>;

export const buildStatusCountFilters = buildProjectStatusCountFilters;

export const buildDisplayedStatusCounts = (
  rawCounts: StatusBreakdown,
  filters: Pick<FilterState, 'includeArchived' | 'includeDestashed'>
): DashboardDisplayedStatusCounts => {
  const rawTotal = Object.values(rawCounts).reduce((sum, count) => sum + count, 0);
  const everything =
    rawTotal -
    (filters.includeArchived ? 0 : rawCounts.archived) -
    (filters.includeDestashed ? 0 : rawCounts.destashed);

  return {
    everything,
    wishlist: rawCounts.wishlist,
    purchased: rawCounts.purchased,
    stash: rawCounts.stash,
    kitted: rawCounts.kitted,
    progress: rawCounts.progress,
    onhold: rawCounts.onhold,
    completed: rawCounts.completed,
    archived: rawCounts.archived,
    destashed: rawCounts.destashed,
  };
};

export const useDashboardStatusCounts = (userId: string | undefined, filters: FilterState) => {
  const { data, error, isLoading } = useQuery(
    userScopedQueryOptions({
      queryKey: buildProjectStatusCountsQueryKey(userId || '', filters),
      queryFn: async () => {
        if (!userId) {
          return EMPTY_STATUS_COUNTS;
        }

        const result = await projectsService.getBatchStatusCounts(
          buildProjectStatusCountServiceFilters(userId, filters),
          {
            skipStatusExclusionCheckboxes: true,
          }
        );

        return result.counts;
      },
      userId,
      freshness: 'statusCount',
    })
  );

  const rawCounts = data || EMPTY_STATUS_COUNTS;
  const displayedCounts = useMemo(
    () =>
      buildDisplayedStatusCounts(rawCounts, {
        includeArchived: filters.includeArchived,
        includeDestashed: filters.includeDestashed,
      }),
    [filters.includeArchived, filters.includeDestashed, rawCounts]
  );

  return {
    rawCounts,
    displayedCounts,
    isLoading,
    error,
  };
};
