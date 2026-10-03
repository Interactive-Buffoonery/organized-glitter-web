import { pb } from '@/lib/pocketbase';
import type { FilterState } from '@/contexts/FilterContext';
import {
  normalizeProjectSearchTerm,
  type DashboardValidSortField,
} from '@/features/dashboard/dashboard.constants';
import type {
  ProjectExpandOptions,
  ProjectFilterCriteria,
  ProjectFilters,
  ProjectSort,
} from '@/types/projectFilters';

/**
 * The slice of FilterState relevant to filtering projects. Pagination, sort,
 * and scroll-restore fields live elsewhere in FilterState and are not part
 * of the service-layer filter contract.
 */
export type ProjectFilterInput = Pick<
  FilterState,
  | 'activeStatus'
  | 'selectedCompany'
  | 'selectedArtist'
  | 'selectedDrillShape'
  | 'selectedYearFinished'
  | 'includeMiniKits'
  | 'includeDestashed'
  | 'includeArchived'
  | 'searchTerm'
  | 'searchAllFields'
  | 'selectedTags'
>;

export type ProjectQueryBuilderOptions = {
  sort: ProjectSort;
  expand?: ProjectExpandOptions;
};

export type ProjectFilterBuildOptions = {
  statusOverride?: ProjectFilters['status'];
  skipStatusExclusionCheckboxes?: boolean;
};

export type ProjectQueryConfig = {
  filter: string;
  sort: string;
  expand?: string;
};

const POCKETBASE_SORT_MAP: Record<DashboardValidSortField, string> = {
  last_updated: 'updated',
  date_purchased: 'date_purchased_has_value,date_purchased',
  date_finished: 'date_completed_has_value,date_completed',
  date_started: 'date_started_has_value,date_started',
  date_received: 'date_received_has_value,date_received',
  kit_name: 'title_sort',
  company: 'company_sort_order,company_name_sort',
  artist: 'artist_sort_order,artist_name_sort',
  status: 'status_order',
  width: 'width_has_value,width',
};

const ALWAYS_ASC_SEGMENTS = new Set([
  'date_purchased_has_value',
  'date_received_has_value',
  'date_started_has_value',
  'date_completed_has_value',
  'width_has_value',
  'company_sort_order',
  'artist_sort_order',
]);

/**
 * Adapts the web UI's filter state into ProjectFilterCriteria; the user-less
 * slice of the service-layer filter contract. Applies the search-term gate
 * (see CONTEXT.md -> "Search term gate") so every filter consumer inherits
 * identical search semantics.
 */
export const toProjectFilterCriteria = (input: ProjectFilterInput): ProjectFilterCriteria => {
  const usableSearch = normalizeProjectSearchTerm(input.searchTerm ?? '') || undefined;

  return {
    status: input.activeStatus,
    company: input.selectedCompany,
    artist: input.selectedArtist,
    drillShape: input.selectedDrillShape,
    yearFinished: input.selectedYearFinished,
    includeMiniKits: input.includeMiniKits,
    includeDestashed: input.includeDestashed,
    includeArchived: input.includeArchived,
    searchTerm: usableSearch,
    searchAllFields: input.searchAllFields === true,
    selectedTags: input.selectedTags,
  };
};

/**
 * Adapts the web UI's filter state into the full ProjectFilters contract,
 * including userId. Use when calling a service method that needs the
 * complete filter.
 */
export const toProjectFilters = (userId: string, input: ProjectFilterInput): ProjectFilters => ({
  ...toProjectFilterCriteria(input),
  userId,
});

function buildSearchCondition(searchTerm?: string, searchAllFields?: boolean): string | null {
  const raw = searchTerm?.trim();
  if (!raw) return null;

  const hasWildcards = raw.includes('%') || raw.includes('_');
  const term = hasWildcards ? raw : `%${raw}%`;

  if (searchAllFields === true) {
    return [
      pb.filter('title ~ {:term}', { term }),
      pb.filter('general_notes ~ {:term}', { term }),
      pb.filter('source_url ~ {:term}', { term }),
    ]
      .join(' || ')
      .replace(/^(.+)$/, '($1)');
  }

  return pb.filter('title ~ {:term}', { term });
}

function buildProjectSortString(sort: ProjectSort): string {
  const segments = (POCKETBASE_SORT_MAP[sort.field] ?? 'updated').split(',');
  const dir = sort.direction === 'desc' ? '-' : '+';
  const directed = segments.map(segment =>
    ALWAYS_ASC_SEGMENTS.has(segment) ? `+${segment}` : `${dir}${segment}`
  );
  const last = directed[directed.length - 1];

  if (!last?.endsWith('title_sort')) {
    directed.push(`${dir}title_sort`);
  }

  return directed.join(',');
}

function buildExpandString(expand?: ProjectExpandOptions): string | undefined {
  const expandParts: string[] = [];

  if (expand?.tags) expandParts.push('project_tags_via_project.tag');
  if (expand?.company) expandParts.push('company');
  if (expand?.artist) expandParts.push('artist');
  if (expand?.user) expandParts.push('user');

  return expandParts.length > 0 ? expandParts.join(',') : undefined;
}

export function buildProjectFilter(
  filters: ProjectFilters,
  options: ProjectFilterBuildOptions = {}
): string {
  const conditions: string[] = [];

  if (filters.userId) {
    conditions.push(pb.filter('user = {:userId}', { userId: filters.userId }));
  }

  const statusToFilter = options.statusOverride ?? filters.status;
  if (statusToFilter && statusToFilter !== 'everything') {
    conditions.push(pb.filter('status = {:status}', { status: statusToFilter }));
  }

  if (filters.company && filters.company !== 'all') {
    conditions.push(pb.filter('company = {:company}', { company: filters.company }));
  }

  if (filters.artist && filters.artist !== 'all') {
    conditions.push(pb.filter('artist = {:artist}', { artist: filters.artist }));
  }

  if (filters.drillShape && filters.drillShape !== 'all') {
    conditions.push(pb.filter('drill_shape = {:drillShape}', { drillShape: filters.drillShape }));
  }

  if (filters.yearFinished && filters.yearFinished !== 'all') {
    const year = parseInt(filters.yearFinished, 10);
    if (!Number.isNaN(year)) {
      conditions.push(pb.filter('date_completed >= {:start}', { start: `${year}-01-01 00:00:00` }));
      conditions.push(pb.filter('date_completed <= {:end}', { end: `${year}-12-31 23:59:59` }));
    }
  }

  if (filters.includeMiniKits === false) {
    conditions.push(pb.filter('kit_category != {:mini}', { mini: 'mini' }));
  }

  if (options.skipStatusExclusionCheckboxes !== true) {
    const currentStatus = filters.status ?? options.statusOverride;

    if (filters.includeDestashed !== true && currentStatus !== 'destashed') {
      conditions.push(pb.filter('status != {:status}', { status: 'destashed' }));
    }

    if (filters.includeArchived !== true && currentStatus !== 'archived') {
      conditions.push(pb.filter('status != {:status}', { status: 'archived' }));
    }
  }

  const searchCondition = buildSearchCondition(filters.searchTerm, filters.searchAllFields);
  if (searchCondition) {
    conditions.push(searchCondition);
  }

  if (filters.selectedTags && filters.selectedTags.length > 0) {
    const tagConditions = filters.selectedTags.map(tagId =>
      pb.filter('project_tags_via_project.tag ?= {:tagId}', { tagId })
    );
    conditions.push(`(${tagConditions.join(' || ')})`);
  }

  return conditions.join(' && ');
}

export function buildProjectQueryConfig(
  filters: ProjectFilters,
  options: ProjectQueryBuilderOptions
): ProjectQueryConfig {
  return {
    filter: buildProjectFilter(filters),
    sort: buildProjectSortString(options.sort),
    expand: buildExpandString(options.expand),
  };
}
