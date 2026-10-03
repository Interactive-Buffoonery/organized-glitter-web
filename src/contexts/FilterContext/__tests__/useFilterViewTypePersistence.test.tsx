import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FilterStateProvider, useFilterState } from '../FilterStateContext';
import { useFilterViewTypePersistence } from '../useFilterViewTypePersistence';
import { VIEW_TYPE_STORAGE_KEY } from '../types';

const installLocalStorageMock = () => {
  const store = new Map<string, string>();
  const setItem = vi.fn((key: string, value: string) => {
    store.set(key, value);
  });
  const getItem = vi.fn((key: string) => store.get(key) ?? null);
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem,
      setItem,
      removeItem: vi.fn((key: string) => store.delete(key)),
      clear: vi.fn(() => store.clear()),
    },
  });
  return { store, setItem, getItem };
};

const renderViewTypePersistence = () =>
  renderHook(
    () => {
      useFilterViewTypePersistence();
      return useFilterState();
    },
    {
      wrapper: ({ children }) => (
        <FilterStateProvider isMobilePhone={false}>{children}</FilterStateProvider>
      ),
    }
  );

describe('useFilterViewTypePersistence', () => {
  const originalLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');

  afterEach(() => {
    if (originalLocalStorage) {
      Object.defineProperty(window, 'localStorage', originalLocalStorage);
    }
    vi.clearAllMocks();
  });

  it('writes view type changes to localStorage', () => {
    const localStorage = installLocalStorageMock();
    const { result } = renderViewTypePersistence();

    expect(localStorage.setItem).toHaveBeenLastCalledWith(VIEW_TYPE_STORAGE_KEY, 'grid');

    act(() => {
      result.current.setFilters({ viewType: 'table' });
    });

    expect(localStorage.setItem).toHaveBeenLastCalledWith(VIEW_TYPE_STORAGE_KEY, 'table');
    expect(localStorage.store.get(VIEW_TYPE_STORAGE_KEY)).toBe('table');
  });

  it('does not throw when localStorage.setItem throws', () => {
    const localStorage = installLocalStorageMock();
    localStorage.setItem.mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    const { result } = renderViewTypePersistence();

    expect(() => {
      act(() => {
        result.current.setFilters({ viewType: 'list' });
      });
    }).not.toThrow();
    expect(result.current.filters.viewType).toBe('list');
  });
});
