/**
 * URL parameter hydration for dashboard filter state.
 *
 * Centralizes which URL search params map to which FilterState fields. Add a
 * mapping entry for each new result-defining filter so parsing, serialization,
 * and URL-only defaults stay together.
 *
 * @author @serabi
 * @created 2026-04-12
 */

import { isValidTabStatus } from '@/utils/project/tabDisplayNames';
import {
  DASHBOARD_VALID_SORT_FIELDS,
  normalizeProjectSearchTerm,
} from '@/features/dashboard/dashboard.constants';
import { LIBRARY_PAGE_SIZES } from '@/constants/pagination';
import { getDefaultFilters, type FilterState } from './types';

/**
 * Legacy params kept for backwards-compatible parsing only.
 */
export const LEGACY_URL_FILTER_PARAMS = ['tag'] as const;

/**
 * The subset of FilterState fields that may be initialized from URL params.
 * Narrower than Partial<FilterState> so callers cannot smuggle view mode in
 * through the URL hydration path.
 */
export type UrlHydratedFilters = Partial<
  Pick<
    FilterState,
    | 'selectedCompany'
    | 'activeStatus'
    | 'selectedArtist'
    | 'selectedTags'
    | 'searchTerm'
    | 'selectedDrillShape'
    | 'selectedYearFinished'
    | 'includeMiniKits'
    | 'includeDestashed'
    | 'includeArchived'
    | 'searchAllFields'
    | 'sortField'
    | 'sortDirection'
    | 'currentPage'
    | 'pageSize'
  >
>;

const isValidSortField = (value: string): value is FilterState['sortField'] =>
  (DASHBOARD_VALID_SORT_FIELDS as readonly string[]).includes(value);

const isValidYear = (value: string): boolean => /^\d{4}$/.test(value) && Number(value) > 0;

const parsePositiveSafeInteger = (value: string | null): number | undefined => {
  if (value === null || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export function getDiamondPaginationFromUrl(searchParams: URLSearchParams) {
  const page = parsePositiveSafeInteger(searchParams.get('page'));
  const pageSize = parsePositiveSafeInteger(searchParams.get('pageSize'));
  return {
    currentPage: page ?? 1,
    pageSize:
      pageSize !== undefined && (LIBRARY_PAGE_SIZES as readonly number[]).includes(pageSize)
        ? pageSize
        : 25,
  };
}

export function setDiamondPaginationParams(
  searchParams: URLSearchParams,
  currentPage: number,
  pageSize: number
): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  const normalizedPage = Number.isSafeInteger(currentPage) && currentPage > 0 ? currentPage : 1;
  const normalizedSize = (LIBRARY_PAGE_SIZES as readonly number[]).includes(pageSize)
    ? pageSize
    : 25;
  if (normalizedPage > 1) {
    next.set('page', String(normalizedPage));
    next.set('pageSize', String(normalizedSize));
  } else {
    next.delete('page');
    if (normalizedSize === 25) next.delete('pageSize');
    else next.set('pageSize', String(normalizedSize));
  }
  return next;
}

const parseSelectedTagsFromUrl = (searchParams: URLSearchParams): string[] => {
  const canonicalTags = searchParams
    .getAll('tags')
    .flatMap(value => value.split(','))
    .map(value => value.trim())
    .filter(Boolean);

  if (canonicalTags.length > 0) {
    return Array.from(new Set(canonicalTags));
  }

  const legacyTag = searchParams.get('tag');
  if (!legacyTag) {
    return [];
  }

  return [legacyTag];
};

/** Each mapping owns the URL name, state field, parser, and canonical values. */
const filterParam = <K extends keyof UrlHydratedFilters>(
  field: K,
  parse: (params: URLSearchParams) => FilterState[K] | undefined,
  serialize: (value: FilterState[K]) => string[]
) => ({
  read(params: URLSearchParams, overrides: UrlHydratedFilters) {
    const value = parse(params);
    if (value !== undefined) overrides[field] = value;
  },
  write(params: URLSearchParams, name: string, filters: FilterState) {
    const values = serialize(filters[field]);
    if (values.length === 1) params.set(name, values[0]);
    else {
      params.delete(name);
      values.forEach(value => params.append(name, value));
    }
  },
  defaultValue(defaults: FilterState, filters: UrlHydratedFilters) {
    filters[field] = defaults[field];
  },
});

const URL_FILTER_MAP = {
  status: filterParam(
    'activeStatus',
    params => {
      const value = params.get('status');
      return value !== null && isValidTabStatus(value) ? value : undefined;
    },
    value => (value === 'everything' ? [] : [value])
  ),
  company: filterParam(
    'selectedCompany',
    params => params.get('company') ?? undefined,
    value => (value === 'all' || value === '' ? [] : [value])
  ),
  artist: filterParam(
    'selectedArtist',
    params => params.get('artist') ?? undefined,
    value => (value === 'all' || value === '' ? [] : [value])
  ),
  tags: filterParam(
    'selectedTags',
    params => {
      const tags = parseSelectedTagsFromUrl(params);
      return tags.length > 0 ? tags : undefined;
    },
    value => value.filter(Boolean)
  ),
  search: filterParam(
    'searchTerm',
    params => {
      const value = params.get('search');
      return value === null ? undefined : normalizeProjectSearchTerm(value);
    },
    value => {
      const normalized = normalizeProjectSearchTerm(value);
      return normalized === '' ? [] : [normalized];
    }
  ),
  drillShape: filterParam(
    'selectedDrillShape',
    params => {
      const value = params.get('drillShape');
      return value === 'round' || value === 'square' ? value : undefined;
    },
    value => (value === 'round' || value === 'square' ? [value] : [])
  ),
  yearFinished: filterParam(
    'selectedYearFinished',
    params => {
      const value = params.get('yearFinished');
      return value !== null && isValidYear(value) ? value : undefined;
    },
    value => (isValidYear(value) ? [value] : [])
  ),
  includeMiniKits: filterParam(
    'includeMiniKits',
    params => (params.get('includeMiniKits') === 'false' ? false : undefined),
    value => (value ? [] : ['false'])
  ),
  includeDestashed: filterParam(
    'includeDestashed',
    params => (params.get('includeDestashed') === 'true' ? true : undefined),
    value => (value ? ['true'] : [])
  ),
  includeArchived: filterParam(
    'includeArchived',
    params => (params.get('includeArchived') === 'true' ? true : undefined),
    value => (value ? ['true'] : [])
  ),
  searchAllFields: filterParam(
    'searchAllFields',
    params => (params.get('searchAllFields') === 'true' ? true : undefined),
    value => (value ? ['true'] : [])
  ),
  sort: filterParam(
    'sortField',
    params => {
      const value = params.get('sort');
      return value !== null && isValidSortField(value) ? value : undefined;
    },
    value => (value === 'last_updated' ? [] : [value])
  ),
  dir: filterParam(
    'sortDirection',
    params => {
      const value = params.get('dir');
      return value === 'asc' || value === 'desc' ? value : undefined;
    },
    value => (value === 'desc' ? [] : [value])
  ),
};

const mappedParams = Object.keys(URL_FILTER_MAP) as Array<keyof typeof URL_FILTER_MAP>;

/** Canonical params; legacy `tag` is accepted only during parsing. */
export const URL_FILTER_PARAMS = [...mappedParams, 'page', 'pageSize'] as const;

const getDefaultUrlFilters = (): UrlHydratedFilters => {
  const defaults = getDefaultFilters();
  const filters: UrlHydratedFilters = {
    currentPage: defaults.currentPage,
    pageSize: defaults.pageSize,
  };
  for (const name of mappedParams) URL_FILTER_MAP[name].defaultValue(defaults, filters);
  return filters;
};

export function setDiamondDashboardParams(
  searchParams: URLSearchParams,
  filters: FilterState
): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  next.delete('tag');
  next.delete('tags');
  for (const name of mappedParams) URL_FILTER_MAP[name].write(next, name, filters);

  const params = setDiamondPaginationParams(next, filters.currentPage, filters.pageSize);
  if (!URL_FILTER_PARAMS.some(param => params.has(param))) params.set('page', '1');
  return params;
}

export function getDiamondUrlStateFromUrl(searchParams: URLSearchParams): UrlHydratedFilters {
  return { ...getDefaultUrlFilters(), ...getInitialFiltersFromUrl(searchParams) };
}

/**
 * Parse a partial URL override. Invalid values leave defaults intact. Repeated
 * or comma-delimited tag IDs are deduplicated in order; legacy `tag` is used
 * only when no canonical IDs remain, preserving its original text.
 */
export function getInitialFiltersFromUrl(searchParams: URLSearchParams): UrlHydratedFilters {
  const overrides: UrlHydratedFilters = {};
  for (const name of mappedParams) URL_FILTER_MAP[name].read(searchParams, overrides);
  if (searchParams.has('page') || searchParams.has('pageSize')) {
    Object.assign(overrides, getDiamondPaginationFromUrl(searchParams));
  }
  return overrides;
}
