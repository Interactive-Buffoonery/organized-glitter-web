import { describe, expect, it } from 'vitest';
import { buildDisplayedStatusCounts, buildStatusCountFilters } from '../useDashboardStatusCounts';
import { getDefaultFilters } from '@/contexts/FilterContext/types';

describe('useDashboardStatusCounts helpers', () => {
  it('builds count filters without status, sort, pagination, or view concerns', () => {
    const filters = {
      ...getDefaultFilters(),
      activeStatus: 'progress',
      selectedCompany: 'dac',
      selectedArtist: 'artist-1',
      selectedDrillShape: 'square',
      selectedYearFinished: '2026',
      includeMiniKits: false,
      searchTerm: 'winter',
      searchAllFields: true,
      selectedTags: ['tag-1'],
      sortField: 'kit_name',
      sortDirection: 'asc',
      currentPage: 3,
      pageSize: 50,
      viewType: 'table',
    };

    expect(buildStatusCountFilters(filters)).toEqual({
      company: 'dac',
      artist: 'artist-1',
      drillShape: 'square',
      yearFinished: '2026',
      includeMiniKits: false,
      searchTerm: 'winter',
      searchAllFields: true,
      selectedTags: ['tag-1'],
    });
  });

  it('uses the shared trimmed search gate', () => {
    expect(buildStatusCountFilters({ ...getDefaultFilters(), searchTerm: ' a ' }).searchTerm).toBe(
      undefined
    );
    expect(buildStatusCountFilters({ ...getDefaultFilters(), searchTerm: ' ab ' }).searchTerm).toBe(
      'ab'
    );
  });

  it('derives the All count from raw totals and exclusion toggles', () => {
    const displayedCounts = buildDisplayedStatusCounts(
      {
        wishlist: 2,
        purchased: 3,
        stash: 4,
        kitted: 1,
        progress: 5,
        onhold: 1,
        completed: 6,
        archived: 7,
        destashed: 8,
      },
      {
        includeArchived: false,
        includeDestashed: false,
      }
    );

    expect(displayedCounts.everything).toBe(22);
    expect(displayedCounts.archived).toBe(7);
    expect(displayedCounts.destashed).toBe(8);
  });
});
