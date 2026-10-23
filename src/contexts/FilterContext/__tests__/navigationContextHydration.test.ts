import { describe, it, expect } from 'vitest';
import { getInitialFiltersFromNavigationContext } from '../navigationContextHydration';
import type { DashboardFilterContext } from '@/hooks/mutations/useSaveNavigationContext';

const buildContext = (overrides: Partial<DashboardFilterContext> = {}): DashboardFilterContext => ({
  filters: {
    status: 'wishlist',
    company: 'company-1',
    artist: 'artist-1',
    drillShape: 'round',
    yearFinished: '2025',
    includeMiniKits: false,
    includeDestashed: true,
    includeArchived: true,
    searchTerm: 'aurora',
    searchAllFields: true,
    selectedTags: ['tag-a', 'tag-b'],
  },
  sortField: 'kit_name',
  sortDirection: 'asc',
  currentPage: 3,
  pageSize: 50,
  preservationContext: {
    scrollPosition: 220,
    timestamp: 1700000000000,
  },
  ...overrides,
});

describe('getInitialFiltersFromNavigationContext', () => {
  it('hydrates every supported field from a complete context', () => {
    const result = getInitialFiltersFromNavigationContext(buildContext());

    expect(result).toEqual({
      activeStatus: 'wishlist',
      selectedCompany: 'company-1',
      selectedArtist: 'artist-1',
      selectedDrillShape: 'round',
      selectedYearFinished: '2025',
      includeMiniKits: false,
      includeDestashed: true,
      includeArchived: true,
      searchTerm: 'aurora',
      searchAllFields: true,
      selectedTags: ['tag-a', 'tag-b'],
      sortField: 'kit_name',
      sortDirection: 'asc',
      currentPage: 3,
      pageSize: 50,
    });
  });

  it('drops unknown sort fields and directions', () => {
    const result = getInitialFiltersFromNavigationContext(
      buildContext({
        sortField: 'not_a_real_field',
        sortDirection: 'sideways',
      } as unknown as Partial<DashboardFilterContext>)
    );
    expect(result.sortField).toBeUndefined();
    expect(result.sortDirection).toBeUndefined();
  });

  it('drops non-positive pagination values', () => {
    const result = getInitialFiltersFromNavigationContext(
      buildContext({ currentPage: 0, pageSize: -10 })
    );
    expect(result.currentPage).toBeUndefined();
    expect(result.pageSize).toBeUndefined();
  });
});
