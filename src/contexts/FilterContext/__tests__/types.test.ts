import { describe, expect, it } from 'vitest';
import {
  getActiveFilterResetPatch,
  getDefaultFilters,
  getDashboardFilterPanelSummary,
  getDashboardFilterPanelResetPatch,
} from '../types';

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

describe('dashboard filter panel search scope', () => {
  it('counts destashed and archived kits only under All', () => {
    const flags = { includeDestashed: true, includeArchived: true };

    expect(getDashboardFilterPanelSummary({ ...getDefaultFilters(), ...flags }).count).toBe(2);
    expect(
      getDashboardFilterPanelSummary({
        ...getDefaultFilters(),
        ...flags,
        activeStatus: 'wishlist',
      }).count
    ).toBe(1);
  });

  it('counts broader search but excludes the search text', () => {
    const summary = getDashboardFilterPanelSummary({
      ...getDefaultFilters(),
      searchTerm: 'garden',
      searchAllFields: true,
    });
    expect(summary.count).toBe(1);
    expect(summary.triggerLabel).toBe('Open filters. 1 filter active');
  });
  it('resets broader search while preserving search text and ordering', () => {
    const filters = {
      ...getDefaultFilters(),
      searchTerm: 'garden',
      searchAllFields: true,
      sortField: 'title' as const,
    };
    const next = { ...filters, ...getDashboardFilterPanelResetPatch() };
    expect(next.searchAllFields).toBe(false);
    expect(next.searchTerm).toBe('garden');
    expect(next.sortField).toBe('title');
  });
});
