import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { FilterStateProvider, useFilterState } from '../FilterStateContext';
import { getDefaultFilters } from '../types';

const renderFilterState = ({
  initialFilters,
  isMobilePhone = false,
}: {
  initialFilters?: Partial<ReturnType<typeof getDefaultFilters>>;
  isMobilePhone?: boolean;
} = {}) =>
  renderHook(() => useFilterState(), {
    wrapper: ({ children }) => (
      <FilterStateProvider initialFilters={initialFilters} isMobilePhone={isMobilePhone}>
        {children}
      </FilterStateProvider>
    ),
  });

describe('FilterStateContext', () => {
  it('merges updates and resets pagination unless currentPage is explicit', () => {
    const { result } = renderFilterState({
      initialFilters: {
        currentPage: 4,
      },
    });

    act(() => {
      result.current.setFilters({ selectedCompany: 'company-1' });
    });

    expect(result.current.filters.selectedCompany).toBe('company-1');
    expect(result.current.filters.currentPage).toBe(1);

    act(() => {
      result.current.setFilters({ selectedArtist: 'artist-1', currentPage: 3 });
    });

    expect(result.current.filters.selectedArtist).toBe('artist-1');
    expect(result.current.filters.currentPage).toBe(3);
  });

  it('keeps a shared page when buffered search commits the same value', () => {
    const { result } = renderFilterState({ initialFilters: { currentPage: 3 } });
    const initialFilters = result.current.filters;

    act(() => {
      result.current.setFilters({ searchTerm: '' });
    });

    expect(result.current.filters).toBe(initialFilters);
    expect(result.current.filters.currentPage).toBe(3);

    act(() => {
      result.current.setFilters({ viewType: 'list' });
    });
    expect(result.current.filters.currentPage).toBe(3);
  });
});
