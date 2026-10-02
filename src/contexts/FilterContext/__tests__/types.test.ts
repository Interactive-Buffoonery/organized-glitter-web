import { describe, expect, it } from 'vitest';
import { getActiveFilterResetPatch, getDefaultFilters } from '../types';

describe('getActiveFilterResetPatch', () => {
  it('clears active filters while preserving dashboard presentation settings', () => {
    const patch = getActiveFilterResetPatch();
    const base = {
      ...getDefaultFilters(),
      activeStatus: 'completed' as const,
      selectedCompany: 'company-1',
      selectedArtist: 'artist-1',
      selectedDrillShape: 'square',
      selectedYearFinished: '2025',
      includeMiniKits: false,
      includeDestashed: true,
      includeArchived: true,
      searchTerm: 'aurora',
      searchAllFields: true,
      selectedTags: ['tag-1', 'tag-2'],
      sortField: 'company' as const,
      sortDirection: 'asc' as const,
      pageSize: 50,
      viewType: 'table' as const,
    };

    const next = {
      ...base,
      ...patch,
    };

    expect(next.activeStatus).toBe('everything');
    expect(next.selectedCompany).toBe('all');
    expect(next.selectedArtist).toBe('all');
    expect(next.selectedDrillShape).toBe('all');
    expect(next.selectedYearFinished).toBe('all');
    expect(next.includeMiniKits).toBe(true);
    expect(next.includeDestashed).toBe(false);
    expect(next.includeArchived).toBe(false);
    expect(next.searchTerm).toBe('');
    expect(next.searchAllFields).toBe(false);
    expect(next.selectedTags).toEqual([]);

    expect(next.sortField).toBe('company');
    expect(next.sortDirection).toBe('asc');
    expect(next.pageSize).toBe(50);
    expect(next.viewType).toBe('table');
  });
});
