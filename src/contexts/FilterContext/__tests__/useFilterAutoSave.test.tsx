import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FilterStateProvider, useFilterState } from '../FilterStateContext';
import { getInitialFiltersFromNavigationContext } from '../navigationContextHydration';
import { useFilterAutoSave } from '../useFilterAutoSave';
import type { FilterState } from '../types';

vi.mock('@/hooks/useDebounce', () => ({
  default: <T,>(value: T) => value,
}));

const mockMutate = vi.hoisted(() => vi.fn());
const mutation = vi.hoisted(() => ({ mutate: mockMutate }));

vi.mock('@/hooks/mutations/useSaveNavigationContext', () => ({
  useSaveNavigationContext: () => mutation,
}));

vi.mock('@/utils/scrollPosition', () => ({
  getPageScrollY: () => 125,
}));

const renderAutoSave = (userId?: string) =>
  renderHook(
    () => {
      useFilterAutoSave({ userId });
      return useFilterState();
    },
    {
      wrapper: ({ children }) => (
        <FilterStateProvider isMobilePhone={false}>{children}</FilterStateProvider>
      ),
    }
  );

describe('useFilterAutoSave', () => {
  beforeEach(() => {
    mockMutate.mockReset();
  });

  it('skips saving when no user id is available', () => {
    const { result } = renderAutoSave();

    act(() => {
      result.current.setFilters({ searchTerm: 'Winter' });
    });

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('saves the debounced filter payload after state changes', () => {
    const { result } = renderAutoSave('user-1');

    act(() => {
      result.current.setFilters({
        activeStatus: 'wishlist',
        selectedCompany: 'company-1',
        selectedArtist: 'artist-1',
        selectedDrillShape: 'round',
        selectedYearFinished: '2026',
        includeMiniKits: false,
        includeDestashed: true,
        includeArchived: true,
        searchTerm: 'Winter',
        searchAllFields: true,
        selectedTags: ['tag-1'],
        sortField: 'kit_name',
        sortDirection: 'asc',
        currentPage: 4,
        pageSize: 50,
      });
    });

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0][0]).toMatchObject({
      userId: 'user-1',
      navigationContext: {
        filters: {
          status: 'wishlist',
          company: 'company-1',
          artist: 'artist-1',
          drillShape: 'round',
          yearFinished: '2026',
          includeMiniKits: false,
          includeDestashed: true,
          includeArchived: true,
          searchTerm: 'Winter',
          searchAllFields: true,
          selectedTags: ['tag-1'],
        },
        sortField: 'kit_name',
        sortDirection: 'asc',
        currentPage: 4,
        pageSize: 50,
      },
    });
    expect(mockMutate.mock.calls[0][0].navigationContext.preservationContext).toEqual({
      scrollPosition: 125,
      timestamp: expect.any(Number),
    });
    expect(
      getInitialFiltersFromNavigationContext(mockMutate.mock.calls[0][0].navigationContext)
    ).toMatchObject({ currentPage: 4, pageSize: 50 });
  });

  it('does not save duplicate no-op updates', () => {
    const { result } = renderAutoSave('user-1');

    act(() => {
      result.current.setFilters({ activeStatus: 'everything' });
    });

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('clears the in-flight guard after success and error callbacks', () => {
    const { result } = renderAutoSave('user-1');

    mockMutate.mockImplementationOnce(
      (
        _payload: unknown,
        options?: { onSuccess?: () => void; onError?: (error: unknown) => void }
      ) => {
        options?.onError?.(new Error('save failed'));
      }
    );

    act(() => {
      result.current.setFilters({ searchTerm: 'first' });
    });

    mockMutate.mockImplementationOnce(
      (
        _payload: unknown,
        options?: { onSuccess?: () => void; onError?: (error: unknown) => void }
      ) => {
        options?.onSuccess?.();
      }
    );

    act(() => {
      result.current.setFilters({ searchTerm: 'second' });
    });

    expect(mockMutate).toHaveBeenCalledTimes(2);
  });

  it('exposes the existing setFilters type through the state provider', () => {
    const { result } = renderAutoSave('user-1');
    const update: Partial<FilterState> = { selectedTags: ['tag-1'] };

    act(() => {
      result.current.setFilters(update);
    });

    expect(result.current.filters.selectedTags).toEqual(['tag-1']);
  });
});
