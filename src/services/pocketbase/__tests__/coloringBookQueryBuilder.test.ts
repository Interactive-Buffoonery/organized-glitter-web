import { describe, expect, it, vi } from 'vitest';

import {
  buildColoringBookListFilter,
  buildColoringBookListQueryConfig,
  buildColoringBookListSort,
  toColoringBookListCriteria,
  type ColoringBookListCriteria,
} from '@/services/pocketbase/coloringBookQueryBuilder';
import type { ColoringFilterState } from '@/contexts/ColoringFilterContext';

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

const makeCriteria = (
  overrides: Partial<ColoringBookListCriteria> = {}
): ColoringBookListCriteria => ({
  statuses: [],
  publisherIds: [],
  illustratorIds: [],
  tagIds: [],
  mysteryOnly: false,
  includeArchived: false,
  includeDestashed: false,
  ...overrides,
});

const makeFilterState = (overrides: Partial<ColoringFilterState> = {}): ColoringFilterState => ({
  selectedStatuses: [],
  selectedPublishers: [],
  selectedIllustrators: [],
  selectedTags: [],
  mysteryOnly: false,
  includeArchived: false,
  includeDestashed: false,
  searchTerm: '',
  sortField: 'date_added',
  sortDirection: 'desc',
  currentPage: 1,
  pageSize: 50,
  ...overrides,
});

describe('toColoringBookListCriteria', () => {
  it('adapts UI filter state into the coloring book list contract', () => {
    expect(
      toColoringBookListCriteria(
        makeFilterState({
          selectedStatuses: ['in_progress'],
          selectedPublishers: ['publisher-1'],
          selectedIllustrators: ['illustrator-1'],
          selectedTags: ['tag-1'],
          mysteryOnly: true,
          includeArchived: true,
          includeDestashed: true,
          searchTerm: '  forest  ',
        })
      )
    ).toEqual({
      statuses: ['in_progress'],
      publisherIds: ['publisher-1'],
      illustratorIds: ['illustrator-1'],
      tagIds: ['tag-1'],
      mysteryOnly: true,
      includeArchived: false,
      includeDestashed: false,
      searchTerm: 'forest',
    });
  });

  it('drops blank search terms after trimming', () => {
    expect(
      toColoringBookListCriteria(makeFilterState({ searchTerm: '   ' })).searchTerm
    ).toBeUndefined();
  });
});

describe('buildColoringBookListFilter', () => {
  it('excludes archived and destashed books by default', () => {
    expect(buildColoringBookListFilter(makeCriteria())).toBe(
      'status != archived && status != destashed'
    );
  });

  it('uses explicit selected statuses instead of default status exclusions', () => {
    expect(
      buildColoringBookListFilter(
        makeCriteria({
          statuses: ['in_progress', 'completed'],
        })
      )
    ).toBe('(status = in_progress || status = completed)');
  });

  it('ignores archive switches when explicit statuses are selected', () => {
    expect(
      toColoringBookListCriteria(
        makeFilterState({
          selectedStatuses: ['in_progress'],
          includeArchived: true,
          includeDestashed: true,
        })
      )
    ).toMatchObject({
      statuses: ['in_progress'],
      includeArchived: false,
      includeDestashed: false,
    });
  });

  it('filters by selected publishers', () => {
    expect(
      buildColoringBookListFilter(
        makeCriteria({
          publisherIds: ['publisher-1', 'publisher-2'],
        })
      )
    ).toBe(
      'status != archived && status != destashed && (publisher = publisher-1 || publisher = publisher-2)'
    );
  });

  it('filters by selected illustrators', () => {
    expect(
      buildColoringBookListFilter(
        makeCriteria({
          illustratorIds: ['illustrator-1', 'illustrator-2'],
        })
      )
    ).toBe(
      'status != archived && status != destashed && (illustrator = illustrator-1 || illustrator = illustrator-2)'
    );
  });

  it('filters by selected tags through the coloring book tag relation', () => {
    expect(
      buildColoringBookListFilter(
        makeCriteria({
          tagIds: ['tag-1', 'tag-2'],
        })
      )
    ).toBe(
      'status != archived && status != destashed && (coloring_book_tags_via_book.tag ?= tag-1 || coloring_book_tags_via_book.tag ?= tag-2)'
    );
  });

  it('filters to mystery books only', () => {
    expect(buildColoringBookListFilter(makeCriteria({ mysteryOnly: true }))).toBe(
      'status != archived && status != destashed && is_mystery = true'
    );
  });

  it('searches the current coloring book list fields with the trimmed term', () => {
    expect(buildColoringBookListFilter(makeCriteria({ searchTerm: 'Disney' }))).toBe(
      'status != archived && status != destashed && (title ~ Disney || publisher.name ~ Disney || illustrator.name ~ Disney || series ~ Disney || theme ~ Disney || isbn ~ Disney || source_url ~ Disney || notes ~ Disney)'
    );
  });
});

describe('buildColoringBookListSort', () => {
  it.each([
    ['date_added', '-created,+id'],
    ['title', '-title,+id'],
    ['publisher', '-publisher,+id'],
    ['completion', '-completion_percentage,+id'],
    ['last_activity', '-last_activity_at,+id'],
  ] as const)('maps %s sorting to %s', (field, expected) => {
    expect(buildColoringBookListSort({ field, direction: 'desc' })).toBe(expected);
  });

  it('applies ascending sort direction', () => {
    expect(buildColoringBookListSort({ field: 'title', direction: 'asc' })).toBe('+title,+id');
  });
});

describe('buildColoringBookListQueryConfig', () => {
  it('returns PocketBase-ready filter, sort, and expand strings', () => {
    expect(
      buildColoringBookListQueryConfig(makeCriteria(), {
        field: 'date_added',
        direction: 'desc',
      })
    ).toEqual({
      filter: 'status != archived && status != destashed',
      sort: '-created,+id',
      expand: 'publisher,illustrator',
    });
  });
});
