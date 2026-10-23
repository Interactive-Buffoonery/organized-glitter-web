import { describe, expect, it } from 'vitest';

import { getDefaultFilters, type FilterState } from '@/contexts/FilterContext/types';
import {
  buildProjectStatusCountsQueryKey,
  getProjectUndatedSentinelField,
} from '../projectCollectionQuery';

const makeFilterState = (overrides: Partial<FilterState> = {}): FilterState => ({
  ...getDefaultFilters(),
  ...overrides,
});

describe('projectCollectionQuery', () => {
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

  it('maps sortable missing-value fields to their sentinel columns', () => {
    expect(getProjectUndatedSentinelField('date_finished')).toBe('date_completed_has_value');
    expect(getProjectUndatedSentinelField('kit_name')).toBeNull();
  });
});
