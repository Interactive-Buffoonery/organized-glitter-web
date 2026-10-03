import { describe, expect, it, vi } from 'vitest';

import {
  buildProjectFilter,
  buildProjectQueryConfig,
  toProjectFilterCriteria,
  toProjectFilters,
} from '@/services/pocketbase/projectQueryBuilder';
import type { FilterState } from '@/contexts/FilterContext';

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
  it('drops search terms shorter than two characters', () => {
    expect(
      toProjectFilterCriteria(makeFilterState({ searchTerm: 'a' })).searchTerm
    ).toBeUndefined();
  });

  it('trims and keeps usable search terms', () => {
    expect(toProjectFilterCriteria(makeFilterState({ searchTerm: '  ab  ' })).searchTerm).toBe(
      'ab'
    );
  });

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

  it('skips archived and destashed exclusions for status count queries when requested', () => {
    expect(
      buildProjectFilter(
        {
          userId: 'user-123',
          includeDestashed: false,
          includeArchived: false,
        },
        { skipStatusExclusionCheckboxes: true }
      )
    ).toBe('user = user-123');
  });

  it('can override the status clause for count-style queries', () => {
    expect(
      buildProjectFilter(
        {
          userId: 'user-123',
          status: 'progress',
          includeDestashed: true,
          includeArchived: true,
        },
        { statusOverride: 'completed' }
      )
    ).toBe('user = user-123 && status = completed');
  });
});

describe('buildProjectQueryConfig', () => {
  it('returns PocketBase-ready filter, sort, and expand strings', () => {
    expect(
      buildProjectQueryConfig(
        { userId: 'user-123', status: 'progress' },
        {
          sort: { field: 'date_purchased', direction: 'desc' },
          expand: { tags: true, company: true, artist: false, user: false },
        }
      )
    ).toEqual({
      filter: 'user = user-123 && status = progress && status != destashed && status != archived',
      sort: '+date_purchased_has_value,-date_purchased,-title_sort',
      expand: 'project_tags_via_project.tag,company',
    });
  });

  it('omits expand when no expand options are enabled', () => {
    expect(
      buildProjectQueryConfig(
        { userId: 'user-123' },
        { sort: { field: 'kit_name', direction: 'asc' } }
      ).expand
    ).toBeUndefined();
  });
});
