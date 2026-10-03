import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock dependencies before imports
vi.mock('@/contexts/MetadataContext', () => ({
  useMetadata: () => ({
    companies: [],
    artists: [],
    tags: [],
    isLoading: { companies: false, artists: false, tags: false },
  }),
}));

const useMobileDeviceMock = vi.fn(() => ({ isMobile: false, isTablet: false }));
vi.mock('@/hooks/use-mobile', () => ({
  useMobileDevice: () => useMobileDeviceMock(),
}));

vi.mock('@/hooks/mutations/useSaveNavigationContext', () => ({
  useSaveNavigationContext: () => ({ mutate: vi.fn() }),
}));

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FilterProvider, useFilters, useFilterHelpers } from '../FilterContext';
import { VIEW_TYPE_STORAGE_KEY, type DashboardViewType, type FilterState } from '../types';

/**
 * Install an in-memory `localStorage` double on `window` for the duration of
 * a single test. jsdom's default `localStorage.setItem` throws in this test
 * environment, so tests that need to observe persisted values must provide
 * their own. Returns a controller object so individual tests can preseed the
 * store, observe writes, and opt into failure injection.
 */
const installLocalStorageMock = () => {
  const store = new Map<string, string>();
  const setItem = vi.fn((key: string, value: string) => {
    store.set(key, String(value));
  });
  const getItem = vi.fn((key: string) => (store.has(key) ? store.get(key)! : null));
  const removeItem = vi.fn((key: string) => {
    store.delete(key);
  });
  const clear = vi.fn(() => {
    store.clear();
  });
  const storageMock = { setItem, getItem, removeItem, clear };

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storageMock,
  });

  return { store, setItem, getItem, removeItem, clear };
};

/**
 * Renders the current viewType and exposes the `updateViewType` helper for
 * test-driven mutation.
 */
let capturedUpdateViewType: ((viewType: DashboardViewType) => void) | null = null;
const ViewTypeHarness: React.FC = () => {
  const { filters } = useFilters();
  const helpers = useFilterHelpers();
  capturedUpdateViewType = helpers.updateViewType;
  return <span data-testid="view-type">{filters.viewType}</span>;
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={['/dashboard']}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
};

const user = { id: 'test-user' };

describe('FilterProvider: viewType localStorage persistence', () => {
  // Preserve whatever localStorage binding jsdom gave us so other tests in the
  // suite aren't affected by our reassignment.
  const originalLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');

  beforeEach(() => {
    capturedUpdateViewType = null;
    useMobileDeviceMock.mockReturnValue({ isMobile: false, isTablet: false });
  });

  afterEach(() => {
    if (originalLocalStorage) {
      Object.defineProperty(window, 'localStorage', originalLocalStorage);
    }
    vi.clearAllMocks();
  });

  describe('hydration from storage', () => {
    it('uses persisted view type on mount when a valid value is present', () => {
      const ls = installLocalStorageMock();
      ls.store.set(VIEW_TYPE_STORAGE_KEY, 'table');

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <FilterProvider user={user}>
            <ViewTypeHarness />
          </FilterProvider>
        </Wrapper>
      );

      expect(screen.getByTestId('view-type').textContent).toBe('table');
    });

    it('falls back to the desktop default when storage is empty', () => {
      installLocalStorageMock();

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <FilterProvider user={user}>
            <ViewTypeHarness />
          </FilterProvider>
        </Wrapper>
      );

      expect(screen.getByTestId('view-type').textContent).toBe('grid');
    });

    it('falls back to the mobile default on phone form factors', () => {
      installLocalStorageMock();
      useMobileDeviceMock.mockReturnValue({ isMobile: true, isTablet: false });

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <FilterProvider user={user}>
            <ViewTypeHarness />
          </FilterProvider>
        </Wrapper>
      );

      expect(screen.getByTestId('view-type').textContent).toBe('list');
    });

    it('ignores unknown persisted values and applies the default', () => {
      const ls = installLocalStorageMock();
      ls.store.set(VIEW_TYPE_STORAGE_KEY, 'carousel');

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <FilterProvider user={user}>
            <ViewTypeHarness />
          </FilterProvider>
        </Wrapper>
      );

      expect(screen.getByTestId('view-type').textContent).toBe('grid');
    });

    it('treats pre-existing legacy "grid"/"list" values as valid without migration', () => {
      const ls = installLocalStorageMock();
      ls.store.set(VIEW_TYPE_STORAGE_KEY, 'list');

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <FilterProvider user={user}>
            <ViewTypeHarness />
          </FilterProvider>
        </Wrapper>
      );

      expect(screen.getByTestId('view-type').textContent).toBe('list');
    });
  });

  describe('writeback on change', () => {
    it('persists view type to localStorage when the helper fires', async () => {
      const ls = installLocalStorageMock();

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <FilterProvider user={user}>
            <ViewTypeHarness />
          </FilterProvider>
        </Wrapper>
      );

      // Initial mount writes the default once
      expect(ls.setItem).toHaveBeenLastCalledWith(VIEW_TYPE_STORAGE_KEY, 'grid');

      await act(async () => {
        capturedUpdateViewType?.('table');
      });

      expect(screen.getByTestId('view-type').textContent).toBe('table');
      expect(ls.setItem).toHaveBeenLastCalledWith(VIEW_TYPE_STORAGE_KEY, 'table');
    });

    it('round-trips: switching view then remounting keeps the new preference', async () => {
      const ls = installLocalStorageMock();

      const Wrapper1 = createWrapper();
      const { unmount } = render(
        <Wrapper1>
          <FilterProvider user={user}>
            <ViewTypeHarness />
          </FilterProvider>
        </Wrapper1>
      );

      await act(async () => {
        capturedUpdateViewType?.('list');
      });

      expect(ls.store.get(VIEW_TYPE_STORAGE_KEY)).toBe('list');
      unmount();

      // Second mount reads from the same store
      const Wrapper2 = createWrapper();
      render(
        <Wrapper2>
          <FilterProvider user={user}>
            <ViewTypeHarness />
          </FilterProvider>
        </Wrapper2>
      );

      expect(screen.getByTestId('view-type').textContent).toBe('list');
    });
  });

  describe('failure-mode safety', () => {
    it('does not throw when localStorage.setItem throws (Safari private mode)', async () => {
      const ls = installLocalStorageMock();
      // Simulate Safari private-mode quota error on every write
      ls.setItem.mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });

      const Wrapper = createWrapper();

      // Mount must not throw even though the initial-write effect fires
      expect(() =>
        render(
          <Wrapper>
            <FilterProvider user={user}>
              <ViewTypeHarness />
            </FilterProvider>
          </Wrapper>
        )
      ).not.toThrow();

      // A subsequent update also must not throw
      await expect(
        act(async () => {
          capturedUpdateViewType?.('table');
        })
      ).resolves.not.toThrow();

      // And the filter state still reflects the intended value, even though
      // persistence silently failed.
      expect(screen.getByTestId('view-type').textContent).toBe('table');
    });
  });

  it('exposes a stable type signature that accepts all three view variants', () => {
    // Compile-time assertion disguised as a runtime no-op. If `updateViewType`
    // ever narrows below the three-value union this test will fail to compile.
    const accepts: DashboardViewType[] = ['grid', 'list', 'table'];
    type _FilterStateHasTable = Exclude<FilterState['viewType'], 'grid' | 'list' | 'table'>;
    const shouldBeNever: _FilterStateHasTable extends never ? true : false = true;
    expect(accepts).toHaveLength(3);
    expect(shouldBeNever).toBe(true);
  });
});
