import { toProjectFilterCriteria } from '@/services/pocketbase/projectQueryBuilder';
import type { FilterState } from '@/contexts/FilterContext';
import type { DashboardValidSortField } from '@/features/dashboard/dashboard.constants';
import type { ProjectFilterCriteria, ProjectFilters } from '@/types/projectFilters';
import {
  queryKeys,
  type DashboardStatusCountsParams,
  type ProjectUndatedCountParams,
  type ProjectUndatedSentinelField,
} from './queryKeys';

export type ProjectCollectionFilterInput = FilterState;

const UNDATED_SENTINEL_FIELD_BY_SORT_FIELD: Partial<
  Record<DashboardValidSortField, ProjectUndatedSentinelField>
> = {
  date_purchased: 'date_purchased_has_value',
  date_received: 'date_received_has_value',
  date_started: 'date_started_has_value',
  date_finished: 'date_completed_has_value',
  width: 'width_has_value',
};

const buildProjectCollectionCriteria = (
  filters: ProjectCollectionFilterInput
): ProjectFilterCriteria => toProjectFilterCriteria(filters);

export const buildProjectStatusCountFilters = (
  filters: ProjectCollectionFilterInput
): DashboardStatusCountsParams['filters'] => {
  // Status counts intentionally share the trimmed search gate used by list queries.
  const criteria = buildProjectCollectionCriteria(filters);

  return {
    company: criteria.company,
    artist: criteria.artist,
    drillShape: criteria.drillShape,
    yearFinished: criteria.yearFinished,
    includeMiniKits: criteria.includeMiniKits,
    searchTerm: criteria.searchTerm,
    searchAllFields: criteria.searchAllFields,
    selectedTags: criteria.selectedTags,
  };
};

export const buildProjectStatusCountServiceFilters = (
  userId: string,
  filters: ProjectCollectionFilterInput
): ProjectFilters => ({
  userId,
  ...buildProjectStatusCountFilters(filters),
});

export const buildProjectStatusCountsQueryKey = (
  userId: string,
  filters: ProjectCollectionFilterInput
) =>
  queryKeys.projects.statusCounts(userId, {
    filters: buildProjectStatusCountFilters(filters),
  });

export const getProjectUndatedSentinelField = (
  sortField: DashboardValidSortField
): ProjectUndatedSentinelField | null => UNDATED_SENTINEL_FIELD_BY_SORT_FIELD[sortField] ?? null;

export const buildProjectUndatedCountFilters = (
  filters: ProjectCollectionFilterInput
): ProjectFilterCriteria => buildProjectCollectionCriteria(filters);

const buildProjectUndatedCountParams = (
  sortField: DashboardValidSortField,
  filters: ProjectCollectionFilterInput
): ProjectUndatedCountParams => ({
  sentinelField: getProjectUndatedSentinelField(sortField),
  filters: buildProjectUndatedCountFilters(filters),
});

export const buildProjectUndatedCountQueryKey = (
  userId: string,
  sortField: DashboardValidSortField,
  filters: ProjectCollectionFilterInput
) => queryKeys.projects.undatedCount(userId, buildProjectUndatedCountParams(sortField, filters));
