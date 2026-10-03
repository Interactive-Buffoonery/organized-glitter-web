import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ColoringControlsRow } from '@/components/coloring/ColoringFilterStrip';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import {
  COLORING_VIEW_TYPE_STORAGE_KEY,
  ColoringFilterProvider,
  getDefaultColoringFilters,
  getInitialColoringFiltersFromUrl,
  getColoringPaginationFromUrl,
  setColoringPaginationParams,
  useColoringFilterHelpers,
  useColoringFilters,
} from '@/contexts/ColoringFilterContext';

vi.mock('@posthog/react', () => ({ usePostHog: () => ({ capture: vi.fn() }) }));

const useMobileDeviceMock = vi.hoisted(() => vi.fn(() => ({ isMobile: false, isTablet: false })));
const savedContextState = vi.hoisted(() => ({
  data: null as { filters: ReturnType<typeof getDefaultColoringFilters> } | null,
  isLoading: false,
  isFetching: false,
}));
const saveColoringNavigationContextMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-mobile', () => ({
  useMobileDevice: () => useMobileDeviceMock(),
}));

vi.mock('@/hooks/queries/coloring/useBookPublishers', () => ({
  useBookPublishers: () => ({
    data: { items: [] },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/queries/coloring/useBookIllustrators', () => ({
  useBookIllustrators: () => ({
    data: { items: [] },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/queries/coloring/useColoringTags', () => ({
  useColoringTags: () => ({
    data: [],
    isLoading: false,
  }),
}));

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

vi.mock('@/hooks/queries/useColoringNavigationContext', () => ({
  useColoringNavigationContext: () => savedContextState,
}));

vi.mock('@/hooks/mutations/useSaveColoringNavigationContext', () => ({
  useSaveColoringNavigationContext: () => ({
    mutate: saveColoringNavigationContextMock,
  }),
}));

const renderColoringHook = <T,>(
  hook: () => T,
  initialFilters?: ReturnType<typeof getInitialColoringFiltersFromUrl>,
  initialEntry = '/dashboard?craft=coloring'
) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={queryClient}>
        <ColoringFilterProvider user={{ id: 'user-1' }} initialFilters={initialFilters}>
          {children}
        </ColoringFilterProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
  return renderHook(hook, { wrapper });
};

describe('getInitialColoringFiltersFromUrl', () => {
  it('parses canonical params into a partial filter object', () => {
    const params = new URLSearchParams(
      '?status=in_progress&publishers=p1,p2&illustrators=i1&tags=t1&mystery=true&includeArchived=true&q=Disney&sort=title&dir=asc'
    );
    expect(getInitialColoringFiltersFromUrl(params)).toEqual({
      selectedStatuses: ['in_progress'],
      selectedPublishers: ['p1', 'p2'],
      selectedIllustrators: ['i1'],
      selectedTags: ['t1'],
      mysteryOnly: true,
      searchTerm: 'Disney',
      sortField: 'title',
      sortDirection: 'asc',
    });
  });

  it('ignores unknown filter and sort values', () => {
    const params = new URLSearchParams('?status=bogus&sort=invalid&dir=sideways');
    expect(getInitialColoringFiltersFromUrl(params)).toEqual({});
  });

  it('ignores stale archive switches in a shared link with explicit statuses', () => {
    const params = new URLSearchParams(
      '?status=in_progress&includeArchived=true&includeDestashed=true'
    );
    expect(getInitialColoringFiltersFromUrl(params)).toEqual({
      selectedStatuses: ['in_progress'],
    });
  });

  it('maps legacy wishlist ownership URLs onto status filters', () => {
    const params = new URLSearchParams('?ownership=wishlist');
    expect(getInitialColoringFiltersFromUrl(params)).toEqual({
      selectedStatuses: ['wishlist'],
    });
  });

  it('deduplicates and trims publisher ids from repeated keys', () => {
    const params = new URLSearchParams();
    params.append('publishers', 'p1');
    params.append('publishers', ' p1 ,p2');
    expect(getInitialColoringFiltersFromUrl(params).selectedPublishers).toEqual(['p1', 'p2']);
  });
});

describe('coloring pagination URL params', () => {
  it('parses supported pagination values and defaults malformed values', () => {
    expect(getColoringPaginationFromUrl(new URLSearchParams('?page=3&pageSize=25'))).toEqual({
      currentPage: 3,
      pageSize: 25,
    });
    expect(getColoringPaginationFromUrl(new URLSearchParams('?page=-2&pageSize=37'))).toEqual({
      currentPage: 1,
      pageSize: 50,
    });
  });

  it('keeps page size in paginated links and omits default first-page params', () => {
    const paginated = setColoringPaginationParams(new URLSearchParams('?craft=coloring'), 2, 50);
    expect(paginated.toString()).toBe('craft=coloring&page=2&pageSize=50');

    const firstPage = setColoringPaginationParams(paginated, 1, 50);
    expect(firstPage.toString()).toBe('craft=coloring');
  });
});

describe('ColoringFilterProvider', () => {
  const originalLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');

  afterEach(() => {
    if (originalLocalStorage) {
      Object.defineProperty(window, 'localStorage', originalLocalStorage);
    }
    useMobileDeviceMock.mockReturnValue({ isMobile: false, isTablet: false });
    savedContextState.data = null;
    savedContextState.isLoading = false;
    savedContextState.isFetching = false;
    saveColoringNavigationContextMock.mockReset();
  });

  it('clears archive switches and resets page when a status is selected', () => {
    const { result } = renderColoringHook(() => ({
      ...useColoringFilters(),
      helpers: useColoringFilterHelpers(),
    }));

    act(() => result.current.helpers.updateIncludeArchived(true));
    act(() => result.current.helpers.updateIncludeDestashed(true));
    act(() => result.current.helpers.updatePage(3));
    act(() => result.current.helpers.updateStatuses(['in_progress']));

    expect(result.current.filters).toMatchObject({
      selectedStatuses: ['in_progress'],
      includeArchived: false,
      includeDestashed: false,
      currentPage: 1,
    });
  });

  it('preserves typing when saved filters arrive before the search debounce', () => {
    vi.useFakeTimers();
    try {
      savedContextState.isLoading = true;
      function Controls() {
        const { filters } = useColoringFilters();
        return (
          <>
            <ColoringControlsRow />
            <output aria-label="Applied search">{filters.searchTerm}</output>
          </>
        );
      }
      const tree = () => (
        <MemoryRouter>
          <ColoringFilterProvider user={{ id: 'user-1' }}>
            <Controls />
          </ColoringFilterProvider>
        </MemoryRouter>
      );
      const { rerender } = render(tree());
      const input = screen.getByRole('searchbox', { name: 'Search coloring books' });
      fireEvent.change(input, { target: { value: 'new search' } });
      expect(screen.getByLabelText('Applied search')).toBeEmptyDOMElement();
      savedContextState.isLoading = false;
      savedContextState.data = {
        filters: { ...getDefaultColoringFilters(), searchTerm: 'old search' },
      };
      rerender(tree());
      expect(input).toHaveValue('new search');
      act(() => vi.advanceTimersByTime(350));
      expect(screen.getByLabelText('Applied search')).toHaveTextContent('new search');
    } finally {
      vi.useRealTimers();
    }
  });

  it('seeds state from URL initialFilters', () => {
    const { result } = renderColoringHook(
      () => ({ ...useColoringFilters(), helpers: useColoringFilterHelpers() }),
      { selectedStatuses: ['wishlist'], mysteryOnly: true }
    );

    expect(result.current.filters.selectedStatuses).toEqual(['wishlist']);
    expect(result.current.filters.mysteryOnly).toBe(true);
  });

  it('does not let late saved filters overwrite filters changed while hydration loads', () => {
    savedContextState.isLoading = true;

    const { result, rerender } = renderColoringHook(() => ({
      ...useColoringFilters(),
      helpers: useColoringFilterHelpers(),
    }));

    act(() => result.current.helpers.updateSearch('local search'));

    savedContextState.isLoading = false;
    savedContextState.data = {
      filters: {
        ...getDefaultColoringFilters(),
        searchTerm: 'saved search',
        mysteryOnly: true,
      },
    };

    rerender();

    expect(result.current.filters.searchTerm).toBe('local search');
    expect(result.current.filters.mysteryOnly).toBe(false);
  });

  it('does not let late saved filters overwrite a confirmed local filter choice', () => {
    savedContextState.isLoading = true;

    const { result, rerender } = renderColoringHook(() => ({
      ...useColoringFilters(),
      helpers: useColoringFilterHelpers(),
    }));

    act(() => result.current.helpers.updateMysteryOnly(false));

    savedContextState.isLoading = false;
    savedContextState.data = {
      filters: {
        ...getDefaultColoringFilters(),
        mysteryOnly: true,
      },
    };

    rerender();

    expect(result.current.filters.mysteryOnly).toBe(false);
  });

  it('hydrates saved filters when the user has not changed filters locally', () => {
    savedContextState.isLoading = true;

    const { result, rerender } = renderColoringHook(() => ({
      ...useColoringFilters(),
      helpers: useColoringFilterHelpers(),
    }));

    savedContextState.isLoading = false;
    savedContextState.data = {
      filters: {
        ...getDefaultColoringFilters(),
        searchTerm: 'saved search',
        mysteryOnly: true,
      },
    };

    rerender();

    expect(result.current.filters.searchTerm).toBe('saved search');
    expect(result.current.filters.mysteryOnly).toBe(true);
  });

  it('keeps a synchronously cached saved page size on initial mount', () => {
    savedContextState.data = {
      filters: { ...getDefaultColoringFilters(), pageSize: 25 },
    };

    const { result } = renderColoringHook(() => useColoringFilters());

    expect(result.current.filters.pageSize).toBe(25);
  });

  it('waits for a cached navigation context to finish refreshing before hydration', () => {
    savedContextState.isFetching = true;
    savedContextState.data = {
      filters: { ...getDefaultColoringFilters(), searchTerm: 'cached' },
    };

    const { result, rerender } = renderColoringHook(() => useColoringFilters());

    expect(result.current.isNavigationContextReady).toBe(false);
    expect(result.current.filters.currentPage).toBe(1);

    savedContextState.isFetching = false;
    savedContextState.data = {
      filters: { ...getDefaultColoringFilters(), searchTerm: 'fresh' },
    };
    rerender();

    expect(result.current.isNavigationContextReady).toBe(true);
    expect(result.current.filters.searchTerm).toBe('fresh');
  });

  it('saves a local change made while navigation context is loading', () => {
    vi.useFakeTimers();
    try {
      savedContextState.isLoading = true;
      const { result, rerender } = renderColoringHook(() => ({
        ...useColoringFilters(),
        helpers: useColoringFilterHelpers(),
      }));

      act(() => result.current.helpers.updateSearch('local search'));

      savedContextState.isLoading = false;
      rerender();
      act(() => vi.advanceTimersByTime(1000));

      expect(saveColoringNavigationContextMock).toHaveBeenCalledWith(
        expect.objectContaining({
          navigationContext: expect.objectContaining({
            filters: expect.objectContaining({ searchTerm: 'local search' }),
          }),
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('merges partial setFilters updates onto current state', () => {
    const { result } = renderColoringHook(() => ({
      ...useColoringFilters(),
      helpers: useColoringFilterHelpers(),
    }));

    act(() => result.current.helpers.updateStatuses(['purchased']));
    act(() => result.current.helpers.updateMysteryOnly(true));

    expect(result.current.filters.selectedStatuses).toEqual(['purchased']);
    expect(result.current.filters.mysteryOnly).toBe(true);
    expect(result.current.filters.searchTerm).toBe('');
  });

  it('clearActiveFilters resets only the active fields, leaving sort intact', () => {
    const { result } = renderColoringHook(
      () => ({ ...useColoringFilters(), helpers: useColoringFilterHelpers() }),
      {
        selectedStatuses: ['purchased'],
        mysteryOnly: true,
        searchTerm: 'Disney',
        selectedPublishers: ['p1'],
        sortField: 'title',
        sortDirection: 'asc',
      }
    );

    act(() => result.current.helpers.clearActiveFilters());

    const defaults = getDefaultColoringFilters();
    expect(result.current.filters.selectedStatuses).toEqual(defaults.selectedStatuses);
    expect(result.current.filters.mysteryOnly).toBe(defaults.mysteryOnly);
    expect(result.current.filters.searchTerm).toBe(defaults.searchTerm);
    expect(result.current.filters.selectedPublishers).toEqual(defaults.selectedPublishers);
    expect(result.current.filters.sortField).toBe('title');
    expect(result.current.filters.sortDirection).toBe('asc');
  });

  it('deepEqual gating preserves the same filters reference when nothing changes', () => {
    const { result } = renderColoringHook(() => ({
      ...useColoringFilters(),
      helpers: useColoringFilterHelpers(),
    }));

    const initial = result.current.filters;
    act(() => result.current.helpers.updateMysteryOnly(false));
    expect(result.current.filters).toBe(initial);
  });

  it('resets pagination only when effective query inputs change', () => {
    const { result } = renderColoringHook(
      () => ({ ...useColoringFilters(), helpers: useColoringFilterHelpers() }),
      undefined,
      '/dashboard?craft=coloring&q=forest&page=3&pageSize=50'
    );

    act(() => result.current.helpers.updateSearch('forest'));
    expect(result.current.filters.currentPage).toBe(3);

    act(() => result.current.helpers.updateSearch(' forest '));
    expect(result.current.filters.currentPage).toBe(3);

    act(() => result.current.helpers.updateSearch('ocean'));
    expect(result.current.filters.currentPage).toBe(1);
  });

  it('resets to page one when page size changes', () => {
    const { result } = renderColoringHook(
      () => ({ ...useColoringFilters(), helpers: useColoringFilterHelpers() }),
      undefined,
      '/dashboard?craft=coloring&page=3&pageSize=50'
    );

    act(() => result.current.helpers.updatePageSize(25));

    expect(result.current.filters.currentPage).toBe(1);
    expect(result.current.filters.pageSize).toBe(25);
  });

  it('normalizes malformed saved pagination values', () => {
    savedContextState.data = {
      filters: {
        ...getDefaultColoringFilters(),
        currentPage: -4,
        pageSize: 37,
      },
    };

    const { result } = renderColoringHook(() => useColoringFilters());

    expect(result.current.filters.currentPage).toBe(1);
    expect(result.current.filters.pageSize).toBe(50);
  });

  it('starts explicit URL filters on page one instead of restoring saved pagination', () => {
    savedContextState.data = {
      filters: { ...getDefaultColoringFilters(), currentPage: 4, pageSize: 25 },
    };

    const { result } = renderColoringHook(() => useColoringFilters(), {
      selectedStatuses: ['wishlist'],
    });

    expect(result.current.filters.selectedStatuses).toEqual(['wishlist']);
    expect(result.current.filters.currentPage).toBe(1);
    expect(result.current.filters.pageSize).toBe(50);
  });

  it('does not save page-only navigation when the provider unmounts', () => {
    const { result, unmount } = renderColoringHook(() => ({
      ...useColoringFilters(),
      helpers: useColoringFilterHelpers(),
    }));

    act(() => result.current.helpers.updatePage(2));
    unmount();

    expect(saveColoringNavigationContextMock).not.toHaveBeenCalled();
  });

  it('restores URL-owned pagination through browser history', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    function HistoryHarness() {
      const { filters } = useColoringFilters();
      const helpers = useColoringFilterHelpers();
      const location = useLocation();
      const navigate = useNavigate();
      return (
        <>
          <output aria-label="Current page">{filters.currentPage}</output>
          <output aria-label="Current URL">{`${location.pathname}${location.search}`}</output>
          <output aria-label="Current search">{filters.searchTerm}</output>
          <button type="button" onClick={() => helpers.updatePage(2)}>
            Page two
          </button>
          <button type="button" onClick={() => navigate(-1)}>
            Back
          </button>
          <button type="button" onClick={() => helpers.updateSearch('ocean')}>
            Search ocean
          </button>
        </>
      );
    }

    render(
      <MemoryRouter initialEntries={['/dashboard?craft=coloring&q=forest']}>
        <QueryClientProvider client={queryClient}>
          <ColoringFilterProvider user={{ id: 'user-1' }} initialFilters={{ searchTerm: 'forest' }}>
            <HistoryHarness />
          </ColoringFilterProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Page two' }));
    await waitFor(() => expect(screen.getByLabelText('Current page')).toHaveTextContent('2'));
    expect(screen.getByLabelText('Current URL')).toHaveTextContent(
      '/dashboard?craft=coloring&q=forest&page=2&pageSize=50'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Search ocean' }));
    await waitFor(() => expect(screen.getByLabelText('Current search')).toHaveTextContent('ocean'));
    expect(screen.getByLabelText('Current URL')).toHaveTextContent(
      '/dashboard?craft=coloring&q=ocean'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Current search')).toHaveTextContent('forest')
    );
    expect(screen.getByLabelText('Current page')).toHaveTextContent('1');
    expect(screen.getByLabelText('Current URL')).toHaveTextContent(
      '/dashboard?craft=coloring&q=forest'
    );
  });

  it('updates activeFilterCount as filters become active', () => {
    const { result } = renderColoringHook(() => ({
      ...useColoringFilters(),
      helpers: useColoringFilterHelpers(),
    }));

    expect(result.current.activeFilterCount).toBe(0);

    act(() => result.current.helpers.updateStatuses(['purchased']));
    act(() => result.current.helpers.updateMysteryOnly(true));
    act(() => result.current.helpers.updateSearch('  '));

    // status=purchased (1) + mysteryOnly (1) + whitespace search (0) = 2
    expect(result.current.activeFilterCount).toBe(2);
  });

  it('defaults to grid on desktop and persists view changes locally', () => {
    const localStorage = installLocalStorageMock();
    const { result } = renderColoringHook(() => useColoringFilters());

    expect(result.current.viewType).toBe('grid');

    act(() => result.current.setViewType('table'));

    expect(result.current.viewType).toBe('table');
    expect(localStorage.setItem).toHaveBeenLastCalledWith(COLORING_VIEW_TYPE_STORAGE_KEY, 'table');
  });

  it('defaults to list on mobile phones when no stored view exists', () => {
    installLocalStorageMock();
    useMobileDeviceMock.mockReturnValue({ isMobile: true, isTablet: false });

    const { result } = renderColoringHook(() => useColoringFilters());

    expect(result.current.viewType).toBe('list');
  });

  it('hydrates a valid stored coloring view and ignores unknown values', () => {
    const localStorage = installLocalStorageMock();
    localStorage.store.set(COLORING_VIEW_TYPE_STORAGE_KEY, 'table');

    const { result, unmount } = renderColoringHook(() => useColoringFilters());
    expect(result.current.viewType).toBe('table');

    unmount();
    localStorage.store.set(COLORING_VIEW_TYPE_STORAGE_KEY, 'carousel');

    const second = renderColoringHook(() => useColoringFilters());
    expect(second.result.current.viewType).toBe('grid');
  });
});
