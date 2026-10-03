/**
 * Coloring filter types
 *
 * Sibling of `src/contexts/FilterContext/types.ts`. Coloring uses a deliberately
 * separate taxonomy from the diamond vertical (per #282), so this is a parallel
 * instance, not a generalization.
 */

import type { ColoringBooksStatusOptions } from '@/types/pocketbase.types';
import { LIBRARY_PAGE_SIZES } from '@/constants/pagination';

export type ColoringSortField =
  | 'date_added'
  | 'title'
  | 'publisher'
  | 'completion'
  | 'last_activity';

export type ColoringSortDirection = 'asc' | 'desc';

export type ColoringViewType = 'grid' | 'list' | 'table';

const VALID_COLORING_VIEW_TYPES: readonly ColoringViewType[] = ['grid', 'list', 'table'] as const;

export const COLORING_VIEW_TYPE_STORAGE_KEY = 'coloring-dashboard-view-type';

function readPersistedColoringViewType(): ColoringViewType | null {
  try {
    if (typeof window === 'undefined') return null;
    const saved = window.localStorage.getItem(COLORING_VIEW_TYPE_STORAGE_KEY);
    return saved !== null && (VALID_COLORING_VIEW_TYPES as readonly string[]).includes(saved)
      ? (saved as ColoringViewType)
      : null;
  } catch {
    return null;
  }
}

export function getDefaultColoringViewType(isMobilePhone = false): ColoringViewType {
  return readPersistedColoringViewType() ?? (isMobilePhone ? 'list' : 'grid');
}

export interface ColoringFilterState {
  selectedStatuses: ColoringBooksStatusOptions[];
  selectedPublishers: string[];
  selectedIllustrators: string[];
  selectedTags: string[];
  mysteryOnly: boolean;
  includeArchived: boolean;
  includeDestashed: boolean;
  searchTerm: string;
  sortField: ColoringSortField;
  sortDirection: ColoringSortDirection;
  currentPage: number;
  pageSize: number;
}

export type PersistedColoringFilterState = Omit<ColoringFilterState, 'currentPage'>;

export const VALID_COLORING_SORT_FIELDS: readonly ColoringSortField[] = [
  'date_added',
  'title',
  'publisher',
  'completion',
  'last_activity',
] as const;

export function getDefaultColoringFilters(): ColoringFilterState {
  return {
    selectedStatuses: [],
    selectedPublishers: [],
    selectedIllustrators: [],
    selectedTags: [],
    mysteryOnly: false,
    includeArchived: false,
    includeDestashed: false,
    searchTerm: '',
    sortField: 'date_added',
    sortDirection: 'desc',
    currentPage: 1,
    pageSize: 50,
  };
}

export function normalizeColoringStatusFilters(filters: ColoringFilterState): ColoringFilterState {
  if (
    filters.selectedStatuses.length === 0 ||
    (!filters.includeArchived && !filters.includeDestashed)
  ) {
    return filters;
  }
  return { ...filters, includeArchived: false, includeDestashed: false };
}

export function normalizeColoringPagination(
  currentPage: unknown,
  pageSize: unknown
): Pick<ColoringFilterState, 'currentPage' | 'pageSize'> {
  const defaults = getDefaultColoringFilters();
  const normalizedPage =
    typeof currentPage === 'number' && Number.isInteger(currentPage) && currentPage > 0
      ? currentPage
      : defaults.currentPage;
  const normalizedPageSize =
    typeof pageSize === 'number' && (LIBRARY_PAGE_SIZES as readonly number[]).includes(pageSize)
      ? pageSize
      : defaults.pageSize;

  return { currentPage: normalizedPage, pageSize: normalizedPageSize };
}

export function getActiveColoringFilterCount(filters: ColoringFilterState): number {
  let count = 0;
  if (filters.mysteryOnly) count++;
  if (filters.selectedStatuses.length === 0 && filters.includeArchived) count++;
  if (filters.selectedStatuses.length === 0 && filters.includeDestashed) count++;
  if (filters.searchTerm.trim() !== '') count++;
  count += filters.selectedStatuses.length;
  count += filters.selectedPublishers.length;
  count += filters.selectedIllustrators.length;
  count += filters.selectedTags.length;
  return count;
}

export function getColoringFilterPanelCount(filters: ColoringFilterState): number {
  let count = 0;
  if (filters.mysteryOnly) count++;
  if (filters.selectedStatuses.length === 0 && filters.includeArchived) count++;
  if (filters.selectedStatuses.length === 0 && filters.includeDestashed) count++;
  count += filters.selectedStatuses.length;
  count += filters.selectedPublishers.length;
  count += filters.selectedIllustrators.length;
  count += filters.selectedTags.length;
  return count;
}

const ACTIVE_KEYS: Array<keyof ColoringFilterState> = [
  'selectedStatuses',
  'selectedPublishers',
  'selectedIllustrators',
  'selectedTags',
  'mysteryOnly',
  'includeArchived',
  'includeDestashed',
  'searchTerm',
];

export function getActiveColoringFilterResetPatch(): Partial<ColoringFilterState> {
  const defaults = getDefaultColoringFilters();
  return Object.fromEntries(
    ACTIVE_KEYS.map(key => [key, defaults[key]])
  ) as Partial<ColoringFilterState>;
}
