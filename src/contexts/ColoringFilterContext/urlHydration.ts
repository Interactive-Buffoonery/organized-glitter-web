/**
 * URL parameter hydration for coloring filter state.
 *
 * Mirrors `src/contexts/FilterContext/urlHydration.ts` for the coloring vertical.
 */

import {
  VALID_COLORING_SORT_FIELDS,
  getDefaultColoringFilters,
  normalizeColoringPagination,
  type ColoringFilterState,
  type ColoringSortDirection,
  type ColoringSortField,
} from './types';
import { ColoringBooksStatusOptions } from '@/types/pocketbase.types';
import { LIBRARY_PAGE_SIZES } from '@/constants/pagination';

export const URL_COLORING_FILTER_PARAMS = [
  'status',
  'publishers',
  'illustrators',
  'tags',
  'mystery',
  'includeArchived',
  'includeDestashed',
  'q',
  'sort',
  'dir',
  'page',
  'pageSize',
] as const;

export type UrlHydratedColoringFilters = Partial<ColoringFilterState>;

const isValidSortField = (value: string): value is ColoringSortField =>
  (VALID_COLORING_SORT_FIELDS as readonly string[]).includes(value);

const isValidSortDirection = (value: string): value is ColoringSortDirection =>
  value === 'asc' || value === 'desc';

const parseMulti = (searchParams: URLSearchParams, key: string): string[] => {
  const ids = searchParams
    .getAll(key)
    .flatMap(value => value.split(','))
    .map(value => value.trim())
    .filter(Boolean);
  return Array.from(new Set(ids));
};

const parsePositiveSafeInteger = (value: string | null): number | undefined => {
  if (value === null || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export function getColoringPaginationFromUrl(
  searchParams: URLSearchParams
): Pick<ColoringFilterState, 'currentPage' | 'pageSize'> {
  const defaults = getDefaultColoringFilters();
  const page = parsePositiveSafeInteger(searchParams.get('page'));
  const pageSize = parsePositiveSafeInteger(searchParams.get('pageSize'));

  return normalizeColoringPagination(
    page ?? defaults.currentPage,
    pageSize !== undefined && (LIBRARY_PAGE_SIZES as readonly number[]).includes(pageSize)
      ? pageSize
      : defaults.pageSize
  );
}

export function setColoringPaginationParams(
  searchParams: URLSearchParams,
  currentPage: number,
  pageSize: number
): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  const normalized = normalizeColoringPagination(currentPage, pageSize);

  if (normalized.currentPage > 1) {
    next.set('page', normalized.currentPage.toString());
    next.set('pageSize', normalized.pageSize.toString());
  } else {
    next.delete('page');
    if (normalized.pageSize === getDefaultColoringFilters().pageSize) {
      next.delete('pageSize');
    } else {
      next.set('pageSize', normalized.pageSize.toString());
    }
  }

  return next;
}

export function getInitialColoringFiltersFromUrl(
  searchParams: URLSearchParams
): UrlHydratedColoringFilters {
  const overrides: UrlHydratedColoringFilters = {};

  const statuses = parseMulti(searchParams, 'status').filter(value =>
    (Object.values(ColoringBooksStatusOptions) as string[]).includes(value)
  );
  if (statuses.length > 0) {
    overrides.selectedStatuses = statuses as ColoringBooksStatusOptions[];
  }

  const legacyOwnership = searchParams.get('ownership');
  if (legacyOwnership === 'wishlist') {
    overrides.selectedStatuses = [ColoringBooksStatusOptions.wishlist];
  }

  const publishers = parseMulti(searchParams, 'publishers');
  if (publishers.length > 0) overrides.selectedPublishers = publishers;

  const illustrators = parseMulti(searchParams, 'illustrators');
  if (illustrators.length > 0) overrides.selectedIllustrators = illustrators;

  const tags = parseMulti(searchParams, 'tags');
  if (tags.length > 0) overrides.selectedTags = tags;

  const mystery = searchParams.get('mystery');
  if (mystery === 'true') overrides.mysteryOnly = true;

  const includeArchived = searchParams.get('includeArchived');
  if (includeArchived === 'true' && !overrides.selectedStatuses?.length) {
    overrides.includeArchived = true;
  }

  const includeDestashed = searchParams.get('includeDestashed');
  if (includeDestashed === 'true' && !overrides.selectedStatuses?.length) {
    overrides.includeDestashed = true;
  }

  const q = searchParams.get('q');
  if (q !== null) overrides.searchTerm = q;

  const sort = searchParams.get('sort');
  if (sort !== null && isValidSortField(sort)) overrides.sortField = sort;

  const dir = searchParams.get('dir');
  if (dir !== null && isValidSortDirection(dir)) overrides.sortDirection = dir;

  if (searchParams.has('page') || searchParams.has('pageSize')) {
    Object.assign(overrides, getColoringPaginationFromUrl(searchParams));
  }

  return overrides;
}
