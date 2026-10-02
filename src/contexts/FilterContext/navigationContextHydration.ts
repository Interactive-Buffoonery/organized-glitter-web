/**
 * Saved navigation context → FilterState hydration.
 *
 * Mirrors `urlHydration.ts` but accepts the broader `DashboardFilterContext`
 * shape that gets persisted to PocketBase and forwarded through React Router
 * navigation state. The saved context also restores view type, which remains
 * a local presentation preference rather than part of shareable result URLs.
 *
 * Each field is validated before it is applied so a stale or malformed record
 * cannot seed garbage into FilterState. Anything that does not validate is
 * silently dropped and the corresponding default wins.
 */

import { DashboardFilterContext } from '@/hooks/mutations/useSaveNavigationContext';
import {
  DashboardValidSortField,
  DASHBOARD_VALID_SORT_FIELDS,
} from '@/features/dashboard/dashboard.constants';
import { isValidTabStatus } from '@/utils/project/tabDisplayNames';
import type { DashboardViewType, FilterState } from './types';

const VALID_VIEW_TYPES: ReadonlyArray<DashboardViewType> = ['grid', 'list', 'table'];
const VALID_SORT_DIRECTIONS = ['asc', 'desc'] as const;

const isValidSortField = (value: string): value is DashboardValidSortField =>
  (DASHBOARD_VALID_SORT_FIELDS as readonly string[]).includes(value);

const isValidSortDirection = (value: string): value is 'asc' | 'desc' =>
  (VALID_SORT_DIRECTIONS as readonly string[]).includes(value);

const isValidViewType = (value: unknown): value is DashboardViewType =>
  typeof value === 'string' && (VALID_VIEW_TYPES as readonly string[]).includes(value);

const isPositiveInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

/**
 * Build a Partial<FilterState> from a previously-saved navigation context.
 * Returns an empty object when no context is provided so callers can spread
 * the result unconditionally.
 */
export function getInitialFiltersFromNavigationContext(
  navigationContext?: DashboardFilterContext | null
): Partial<FilterState> {
  if (!navigationContext) return {};

  const overrides: Partial<FilterState> = {};
  const { filters } = navigationContext;

  if (filters) {
    if (filters.status && isValidTabStatus(filters.status)) {
      overrides.activeStatus = filters.status;
    }
    if (typeof filters.company === 'string') overrides.selectedCompany = filters.company;
    if (typeof filters.artist === 'string') overrides.selectedArtist = filters.artist;
    if (typeof filters.drillShape === 'string') overrides.selectedDrillShape = filters.drillShape;
    if (typeof filters.yearFinished === 'string') {
      overrides.selectedYearFinished = filters.yearFinished;
    }
    if (typeof filters.includeMiniKits === 'boolean') {
      overrides.includeMiniKits = filters.includeMiniKits;
    }
    if (typeof filters.includeDestashed === 'boolean') {
      overrides.includeDestashed = filters.includeDestashed;
    }
    if (typeof filters.includeArchived === 'boolean') {
      overrides.includeArchived = filters.includeArchived;
    }
    if (typeof filters.searchTerm === 'string') overrides.searchTerm = filters.searchTerm;
    if (typeof filters.searchAllFields === 'boolean') {
      overrides.searchAllFields = filters.searchAllFields;
    }
    if (Array.isArray(filters.selectedTags)) {
      overrides.selectedTags = filters.selectedTags.filter(
        (tag): tag is string => typeof tag === 'string' && tag.length > 0
      );
    }
  }

  if (
    typeof navigationContext.sortField === 'string' &&
    isValidSortField(navigationContext.sortField)
  ) {
    overrides.sortField = navigationContext.sortField;
  }
  if (
    typeof navigationContext.sortDirection === 'string' &&
    isValidSortDirection(navigationContext.sortDirection)
  ) {
    overrides.sortDirection = navigationContext.sortDirection;
  }
  if (isPositiveInt(navigationContext.currentPage)) {
    overrides.currentPage = navigationContext.currentPage;
  }
  if (isPositiveInt(navigationContext.pageSize)) {
    overrides.pageSize = navigationContext.pageSize;
  }

  const ctxWithViewType = navigationContext as DashboardFilterContext & {
    viewType?: unknown;
  };
  if (isValidViewType(ctxWithViewType.viewType)) {
    overrides.viewType = ctxWithViewType.viewType;
  }

  return overrides;
}
