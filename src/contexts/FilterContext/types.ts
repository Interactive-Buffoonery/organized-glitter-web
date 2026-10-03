/**
 * Filter types
 * @author @serabi
 * @created 2025-08-02
 */

import { DashboardValidSortField } from '@/features/dashboard/dashboard.constants';
import { ProjectFilterStatus } from '@/types/project';

/**
 * Canonical dashboard view-type union. `FilterContext` is the single source of
 * truth for which view the dashboard is showing; all other `ViewType` aliases
 * in the codebase should align with this.
 */
export type DashboardViewType = 'grid' | 'list' | 'table';

/**
 * Valid values accepted from persisted storage. Used for runtime validation
 * when reading back the user's last-selected view.
 */
const VALID_VIEW_TYPES: readonly DashboardViewType[] = ['grid', 'list', 'table'] as const;

/**
 * localStorage key for the device-scoped view-type preference. Kept centralized
 * so the read (here) and the write effect in `FilterContext.tsx` can't drift.
 */
export const VIEW_TYPE_STORAGE_KEY = 'dashboard-view-type';

/**
 * Read the persisted view type from localStorage. Wrapped in try/catch so SSR
 * and Safari private-mode (where `localStorage` can throw on access) don't
 * blow up initial render. Unknown values fall back to `null` so the caller
 * can apply its own default.
 */
const readPersistedViewType = (): DashboardViewType | null => {
  try {
    if (typeof window === 'undefined') return null;
    const saved = window.localStorage.getItem(VIEW_TYPE_STORAGE_KEY);
    return saved !== null && (VALID_VIEW_TYPES as readonly string[]).includes(saved)
      ? (saved as DashboardViewType)
      : null;
  } catch {
    return null;
  }
};

/**
 * Core filter state
 */
export interface FilterState {
  // Server-side filters
  activeStatus: ProjectFilterStatus;
  selectedCompany: string;
  selectedArtist: string;
  selectedDrillShape: string;
  selectedYearFinished: string;
  includeMiniKits: boolean;
  includeDestashed: boolean;
  includeArchived: boolean;
  searchTerm: string;
  /** Explicit opt-in for multi-field contains search */
  searchAllFields: boolean;
  selectedTags: string[];

  // Sorting
  sortField: DashboardValidSortField;
  sortDirection: 'asc' | 'desc';

  // Pagination
  currentPage: number;
  pageSize: number;

  // View
  viewType: DashboardViewType;
}

interface ActiveFilterCountOptions {
  includeSearchTerm?: boolean;
  includeSearchAllFields?: boolean;
}

const countFilters = (
  filters: FilterState,
  { includeSearchTerm = true, includeSearchAllFields = true }: ActiveFilterCountOptions = {}
): number => {
  let count = 0;

  if (filters.activeStatus !== 'everything') count++;
  if (filters.selectedCompany !== 'all') count++;
  if (filters.selectedArtist !== 'all') count++;
  if (filters.selectedDrillShape !== 'all') count++;
  if (filters.selectedYearFinished !== 'all') count++;
  if (!filters.includeMiniKits) count++;
  if (filters.includeDestashed) count++;
  if (filters.includeArchived) count++;
  if (includeSearchTerm && filters.searchTerm) count++;
  if (includeSearchAllFields && filters.searchAllFields) count++;
  count += filters.selectedTags.length;

  return count;
};

/**
 * Global active-filter count used by results summaries and any UI that should
 * reflect every narrowing control, including header-owned search state.
 */
export const getActiveFilterCount = (filters: FilterState): number => countFilters(filters);

export const getActiveFilterSummary = (filters: FilterState) => {
  const count = getActiveFilterCount(filters);
  const tagCount = filters.selectedTags.length;
  const nonTagCount = count - tagCount;

  if (tagCount > 0 && nonTagCount === 0) {
    return `${tagCount} ${tagCount === 1 ? 'tag' : 'tags'} selected`;
  }

  if (tagCount > 0 && nonTagCount > 0) {
    return `${tagCount} ${tagCount === 1 ? 'tag' : 'tags'} selected • ${nonTagCount} ${nonTagCount === 1 ? 'filter' : 'filters'} active`;
  }

  if (count === 0) {
    return null;
  }

  return `${count} ${count === 1 ? 'filter' : 'filters'} active`;
};

/**
 * Count only the controls rendered inside the dashboard filter panel/sheet.
 * Search and "Search All Fields" live in the header, so including them here
 * produces misleading badges and reset affordances.
 */
const getDashboardFilterPanelCount = (filters: FilterState): number =>
  countFilters(filters, {
    includeSearchTerm: false,
    includeSearchAllFields: false,
  });

export const getDashboardFilterPanelSummary = (filters: FilterState) => {
  const count = getDashboardFilterPanelCount(filters);
  const tagCount = filters.selectedTags.length;
  const nonTagCount = count - tagCount;

  if (tagCount > 0 && nonTagCount === 0) {
    return {
      count,
      badgeText: `${tagCount} ${tagCount === 1 ? 'Tag' : 'Tags'}`,
      activeText: `${tagCount} ${tagCount === 1 ? 'tag' : 'tags'} selected`,
      triggerLabel: `Open filters. ${tagCount} ${tagCount === 1 ? 'tag' : 'tags'} selected`,
    };
  }

  if (tagCount > 0 && nonTagCount > 0) {
    const tagText = `${tagCount} ${tagCount === 1 ? 'tag' : 'tags'} selected`;
    const filterText = `${nonTagCount} ${nonTagCount === 1 ? 'filter' : 'filters'} active`;

    return {
      count,
      badgeText: `${tagCount} ${tagCount === 1 ? 'Tag' : 'Tags'} • ${nonTagCount} Active`,
      activeText: `${tagText} • ${filterText}`,
      triggerLabel: `Open filters. ${tagText} • ${filterText}`,
    };
  }

  return {
    count,
    badgeText: `${count} Active`,
    activeText: `${count} ${count === 1 ? 'filter' : 'filters'} active`,
    triggerLabel: `Open filters. ${count} ${count === 1 ? 'filter' : 'filters'} active`,
  };
};

const DASHBOARD_FILTER_PANEL_KEYS: Array<keyof FilterState> = [
  'activeStatus',
  'selectedCompany',
  'selectedArtist',
  'selectedDrillShape',
  'selectedYearFinished',
  'includeMiniKits',
  'includeDestashed',
  'includeArchived',
  'selectedTags',
];

const ACTIVE_FILTER_KEYS: Array<keyof FilterState> = [
  ...DASHBOARD_FILTER_PANEL_KEYS,
  'searchTerm',
  'searchAllFields',
];

/**
 * Reset only the fields owned by the dashboard filter panel. Header-owned
 * search/sort state is intentionally preserved so "Reset All Filters" does not
 * wipe controls the user cannot currently see inside the panel.
 */
export const getDashboardFilterPanelResetPatch = (): Partial<FilterState> => {
  const defaults = getDefaultFilters();
  return Object.fromEntries(
    DASHBOARD_FILTER_PANEL_KEYS.map(key => [key, defaults[key]])
  ) as Partial<FilterState>;
};

/**
 * Clear only active narrowing filters while preserving dashboard presentation
 * preferences like sort, view type, and page size.
 */
export const getActiveFilterResetPatch = (): Partial<FilterState> => {
  const defaults = getDefaultFilters();
  return Object.fromEntries(
    ACTIVE_FILTER_KEYS.map(key => [key, defaults[key]])
  ) as Partial<FilterState>;
};

/**
 * Default filter state factory.
 *
 * View type resolution order:
 *   1. Persisted `localStorage['dashboard-view-type']` (validated against the
 *      3-value union), if present and valid.
 *   2. Device default: `'list'` on mobile phones, `'grid'` otherwise.
 *
 * No migration is needed for pre-existing `'grid'` / `'list'` storage values;
 * they remain valid under the widened union. Invalid/unknown values fall
 * through to the device default.
 */
export const getDefaultFilters = (isMobilePhone = false): FilterState => {
  const persistedViewType = readPersistedViewType();
  const defaultViewType: DashboardViewType = isMobilePhone ? 'list' : 'grid';

  return {
    activeStatus: 'everything',
    selectedCompany: 'all',
    selectedArtist: 'all',
    selectedDrillShape: 'all',
    selectedYearFinished: 'all',
    includeMiniKits: true,
    includeDestashed: false,
    includeArchived: false,
    searchTerm: '',
    searchAllFields: false,
    selectedTags: [],
    sortField: 'last_updated',
    sortDirection: 'desc',
    currentPage: 1,
    pageSize: 25,
    viewType: persistedViewType ?? defaultViewType,
  };
};
