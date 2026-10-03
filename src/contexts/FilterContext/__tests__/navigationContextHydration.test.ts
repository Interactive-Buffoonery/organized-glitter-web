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
  it('returns an empty object when no context is provided', () => {
    expect(getInitialFiltersFromNavigationContext()).toEqual({});
    expect(getInitialFiltersFromNavigationContext(null)).toEqual({});
  });

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

  it('drops unknown status values so the default wins', () => {
    const result = getInitialFiltersFromNavigationContext(
      buildContext({
        filters: { ...buildContext().filters, status: 'garbage' },
      })
    );
    expect(result.activeStatus).toBeUndefined();
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

  it('coerces non-string tag entries out of selectedTags', () => {
    const result = getInitialFiltersFromNavigationContext(
      buildContext({
        filters: {
          ...buildContext().filters,
          selectedTags: ['tag-a', '', null as unknown as string, 'tag-b'],
        },
      })
    );
    expect(result.selectedTags).toEqual(['tag-a', 'tag-b']);
  });

  it('hydrates viewType when a recognized value is included', () => {
    const result = getInitialFiltersFromNavigationContext({
      ...buildContext(),
      viewType: 'list',
    } as unknown as DashboardFilterContext);
    expect(result.viewType).toBe('list');
  });

  it('drops unknown viewType values silently', () => {
    const result = getInitialFiltersFromNavigationContext({
      ...buildContext(),
      viewType: 'tiles',
    } as unknown as DashboardFilterContext);
    expect(result.viewType).toBeUndefined();
  });

  it('ignores boolean fields when types are wrong', () => {
    const result = getInitialFiltersFromNavigationContext(
      buildContext({
        filters: {
          ...buildContext().filters,
          includeMiniKits: 'yes' as unknown as boolean,
          includeDestashed: 1 as unknown as boolean,
        },
      })
    );
    expect(result.includeMiniKits).toBeUndefined();
    expect(result.includeDestashed).toBeUndefined();
  });
});
