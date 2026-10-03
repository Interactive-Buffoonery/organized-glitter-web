import { describe, expect, it } from 'vitest';

import { getDefaultFilters, type FilterState } from '@/contexts/FilterContext/types';
import {
  buildProjectStatusCountFilters,
  buildProjectStatusCountsQueryKey,
  buildProjectUndatedCountFilters,
  buildProjectUndatedCountQueryKey,
  getProjectUndatedSentinelField,
} from '../projectCollectionQuery';

const makeFilterState = (overrides: Partial<FilterState> = {}): FilterState => ({
  ...getDefaultFilters(),
  ...overrides,
});

describe('projectCollectionQuery', () => {
  it('drops whitespace-padded one-character search terms for status counts', () => {
    expect(
      buildProjectStatusCountFilters(makeFilterState({ searchTerm: ' a ' })).searchTerm
    ).toBeUndefined();
  });

  it('drops whitespace-padded one-character search terms for undated counts', () => {
    expect(
      buildProjectUndatedCountFilters(makeFilterState({ searchTerm: ' a ' })).searchTerm
    ).toBeUndefined();
  });

  it('trims usable search terms through the shared project criteria adapter', () => {
    expect(
      buildProjectStatusCountFilters(makeFilterState({ searchTerm: '  ab  ' })).searchTerm
    ).toBe('ab');
    expect(
      buildProjectUndatedCountFilters(makeFilterState({ searchTerm: '  ab  ' })).searchTerm
    ).toBe('ab');
  });

  it('keeps status-count keys stable across status, sort, pagination, view, and display toggles', () => {
    const base = makeFilterState({
      activeStatus: 'progress',
      selectedCompany: 'company-1',
      searchTerm: 'winter',
      sortField: 'last_updated',
      sortDirection: 'desc',
      currentPage: 1,
      pageSize: 25,
      viewType: 'grid',
      includeArchived: false,
      includeDestashed: false,
    });

    const changed = {
      ...base,
      activeStatus: 'completed',
      sortField: 'kit_name',
      sortDirection: 'asc',
      currentPage: 3,
      pageSize: 50,
      viewType: 'table',
      includeArchived: true,
      includeDestashed: true,
    } satisfies FilterState;

    expect(buildProjectStatusCountsQueryKey('user-1', changed)).toEqual(
      buildProjectStatusCountsQueryKey('user-1', base)
    );
  });

  it('changes status-count keys when non-status criteria change', () => {
    const base = makeFilterState({
      selectedCompany: 'company-1',
      searchTerm: 'winter',
    });
    const changed = {
      ...base,
      selectedCompany: 'company-2',
    };

    expect(buildProjectStatusCountsQueryKey('user-1', changed)).not.toEqual(
      buildProjectStatusCountsQueryKey('user-1', base)
    );
  });

  it('hashes the user id in undated-count keys', () => {
    const key = buildProjectUndatedCountQueryKey(
      'user-1',
      'date_purchased',
      makeFilterState({ selectedTags: ['tag-2', 'tag-1'] })
    );

    expect(JSON.stringify(key)).not.toContain('user-1');
    expect(key[3]).not.toBe('user-1');
  });

  it('maps sortable missing-value fields to their sentinel columns', () => {
    expect(getProjectUndatedSentinelField('date_finished')).toBe('date_completed_has_value');
    expect(getProjectUndatedSentinelField('kit_name')).toBeNull();
  });
});
