import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import {
  ColoringFilterProvider,
  getDefaultColoringFilters,
  getInitialColoringFiltersFromUrl,
  getColoringPaginationFromUrl,
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
});
