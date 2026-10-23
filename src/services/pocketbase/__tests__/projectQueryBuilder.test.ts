import { describe, expect, it, vi } from 'vitest';

import type { FilterState } from '@/contexts/FilterContext';
import { buildProjectFilter, toProjectFilters } from '@/services/pocketbase/projectQueryBuilder';

vi.mock('@/lib/pocketbase', () => ({
  pb: {
    filter: (expr: string, params?: Record<string, unknown>) => {
      if (!params) return expr;
      let result = expr;
      for (const [key, value] of Object.entries(params)) {
        result = result.replace(`{:${key}}`, String(value));
      }
      return result;
    },
  },
}));

const makeFilterState = (overrides: Partial<FilterState> = {}): FilterState =>
  ({
    activeStatus: 'progress',
    selectedCompany: 'company-1',
    selectedArtist: 'artist-1',
    selectedDrillShape: 'round',
    selectedYearFinished: '2026',
    includeMiniKits: true,
    includeDestashed: false,
    includeArchived: false,
    searchTerm: '',
    searchAllFields: false,
    selectedTags: ['tag-2', 'tag-1'],
    sortField: 'last_updated',
    sortDirection: 'desc',
    currentPage: 1,
    pageSize: 24,
    viewType: 'grid',
    ...overrides,
  }) as FilterState;

describe('project query builder adapters', () => {
  it('adds userId only for the full service filter contract', () => {
    expect(toProjectFilters('user-1', makeFilterState())).toMatchObject({
      userId: 'user-1',
      status: 'progress',
      selectedTags: ['tag-2', 'tag-1'],
    });
  });
});

describe('buildProjectFilter', () => {
  it('builds the base project filter from the service contract', () => {
    expect(
      buildProjectFilter({
        userId: 'user-123',
        status: 'progress',
        company: 'company-1',
        artist: 'artist-1',
        drillShape: 'round',
        yearFinished: '2026',
        includeMiniKits: false,
        includeDestashed: false,
        includeArchived: false,
        searchTerm: 'sparkle',
        searchAllFields: true,
        selectedTags: ['tag-1', 'tag-2'],
      })
    ).toBe(
      'user = user-123 && status = progress && company = company-1 && artist = artist-1 && drill_shape = round && date_completed >= 2026-01-01 00:00:00 && date_completed <= 2026-12-31 23:59:59 && kit_category != mini && status != destashed && status != archived && (title ~ %sparkle% || general_notes ~ %sparkle% || source_url ~ %sparkle%) && (project_tags_via_project.tag ?= tag-1 || project_tags_via_project.tag ?= tag-2)'
    );
  });
});
