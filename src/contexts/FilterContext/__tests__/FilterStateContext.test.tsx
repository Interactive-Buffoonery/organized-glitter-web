import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { areFiltersEqual, FilterStateProvider, useFilterState } from '../FilterStateContext';
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
  it('merges initial filters over defaults and exposes active filter count', () => {
    const { result } = renderFilterState({
      initialFilters: {
        activeStatus: 'wishlist',
        selectedTags: ['tag-1', 'tag-2'],
      },
    });

    expect(result.current.filters.activeStatus).toBe('wishlist');
    expect(result.current.filters.selectedTags).toEqual(['tag-1', 'tag-2']);
    expect(result.current.activeFilterCount).toBe(3);
  });

  it('uses the mobile phone default view type when storage has no override', () => {
    const { result } = renderFilterState({ isMobilePhone: true });

    expect(result.current.filters.viewType).toBe('list');
  });

  it('drops a saved one-character search before it counts as an active filter', () => {
    const { result } = renderFilterState({ initialFilters: { searchTerm: 'a' } });

    expect(result.current.filters.searchTerm).toBe('');
    expect(result.current.activeFilterCount).toBe(0);
  });

  it('trims a saved search before sharing it with filter consumers', () => {
    const { result } = renderFilterState({ initialFilters: { searchTerm: '  Winter Moon  ' } });

    expect(result.current.filters.searchTerm).toBe('Winter Moon');
  });

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

  it('keeps the same filters reference for no-op updates', () => {
    const { result } = renderFilterState();
    const initialFilters = result.current.filters;

    act(() => {
      result.current.setFilters({ activeStatus: 'everything' });
    });

    expect(result.current.filters).toBe(initialFilters);
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

  it('compares array fields by order and primitive fields by value', () => {
    const base = getDefaultFilters();

    expect(areFiltersEqual(base, { ...base, selectedTags: [] })).toBe(true);
    expect(areFiltersEqual(base, { ...base, selectedTags: ['a'] })).toBe(false);
    expect(
      areFiltersEqual({ ...base, selectedTags: ['a', 'b'] }, { ...base, selectedTags: ['b', 'a'] })
    ).toBe(false);
    expect(areFiltersEqual(base, { ...base, searchTerm: 'winter' })).toBe(false);
  });
});
