import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock dependencies before imports
vi.mock('@/contexts/MetadataContext', () => ({
  useMetadata: () => ({
    companies: [],
    artists: [],
    tags: [],
    isLoading: { companies: false, artists: false, tags: false },
  }),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useMobileDevice: () => ({ isMobile: false, isTablet: false }),
}));

vi.mock('@/hooks/useDebounce', () => ({
  default: <T,>(value: T) => value,
}));

const mockMutate = vi.fn();

vi.mock('@/hooks/mutations/useSaveNavigationContext', () => ({
  useSaveNavigationContext: () => ({
    mutate: (
      payload: unknown,
      options?: { onSuccess?: () => void; onError?: (error: unknown) => void }
    ) => {
      mockMutate(payload);
      options?.onSuccess?.();
    },
  }),
}));

import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter, useNavigate, useSearchParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FilterProvider, useFilterHelpers, useFilters } from '../FilterContext';
import type { FilterState } from '../types';
import SearchProjects from '@/components/dashboard/SearchProjects';
import DashboardQuickViews from '@/components/dashboard/DashboardQuickViews';
import userEvent from '@testing-library/user-event';
import { getDashboardQuickViewPatch, DASHBOARD_QUICK_VIEWS } from '@/features/dashboard/quickViews';

/** Renders filter state as text so tests can assert on it */
const FilterStateReader: React.FC = () => {
  const { filters, activeFilterCount } = useFilters();
  return (
    <div>
      <span data-testid="selected-company">{filters.selectedCompany}</span>
      <span data-testid="active-status">{filters.activeStatus}</span>
      <span data-testid="selected-artist">{filters.selectedArtist}</span>
      <span data-testid="selected-tags">{filters.selectedTags.join(',')}</span>
      <span data-testid="search-term">{filters.searchTerm}</span>
      <span data-testid="active-filter-count">{activeFilterCount}</span>
    </div>
  );
};

/** Reads current URL search params so tests can verify writeback */
const URLReader: React.FC = () => {
  // Import inline to avoid hoisting issues with vi.mock
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const [searchParams] = require('react-router-dom').useSearchParams();
  return <span data-testid="url-params">{searchParams.toString()}</span>;
};

/**
 * Exposes `setFilters` to the enclosing test via a module-scoped capture.
 * Assign before each test to avoid cross-test leakage.
 */
let capturedSetFilters:
  | ((updates: Partial<FilterState> | ((current: FilterState) => Partial<FilterState>)) => void)
  | null = null;
const SetFiltersCapture: React.FC = () => {
  const { setFilters } = useFilters();
  capturedSetFilters = setFilters;
  return null;
};

let capturedUpdateSearch: ((searchTerm: string) => void) | null = null;
let capturedResetFilters: (() => void) | null = null;
let capturedResetDashboardFilterPanel: (() => void) | null = null;
const FilterHelpersCapture: React.FC = () => {
  const { updateSearch, resetFilters, resetDashboardFilterPanel } = useFilterHelpers();
  capturedUpdateSearch = updateSearch;
  capturedResetFilters = resetFilters;
  capturedResetDashboardFilterPanel = resetDashboardFilterPanel;
  return null;
};

const createWrapper = (initialRoute: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[initialRoute]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
};

const user = { id: 'test-user' };

const PaginationHistoryHarness = () => {
  const { filters } = useFilters();
  const { updatePage, updatePageSize, updateSearch } = useFilterHelpers();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  return (
    <>
      <span data-testid="page">{filters.currentPage}</span>
      <span data-testid="page-size">{filters.pageSize}</span>
      <span data-testid="sort-field">{filters.sortField}</span>
      <span data-testid="search-params">{params.toString()}</span>
      <button onClick={() => updatePage(2)}>Page two</button>
      <button onClick={() => updatePageSize(50)}>Size fifty</button>
      <button onClick={() => updateSearch('moon')}>Search</button>
      <button onClick={() => navigate('/dashboard?page=3&pageSize=50&sort=kit_name')}>
        Open shared URL
      </button>
      <button onClick={() => navigate(-1)}>Back</button>
      <button onClick={() => navigate(1)}>Forward</button>
    </>
  );
};

const SearchWithClearFilters: React.FC = () => {
  const { filters, searchDraftResetVersion } = useFilters();
  const { updateSearch, clearActiveFilters } = useFilterHelpers();

  return (
    <>
      <SearchProjects
        searchTerm={filters.searchTerm}
        onSearchChange={updateSearch}
        resetVersion={searchDraftResetVersion}
      />
      <button type="button" onClick={clearActiveFilters}>
        Clear Filters
      </button>
    </>
  );
};

describe('diamond pagination history', () => {
  it('hydrates filters when a shared dashboard URL is opened in the mounted route', async () => {
    const Wrapper = createWrapper('/dashboard');
    render(
      <Wrapper>
        <FilterProvider user={user}>
          <PaginationHistoryHarness />
        </FilterProvider>
      </Wrapper>
    );

    await act(async () => {
      screen.getByText('Open shared URL').click();
    });
    expect(screen.getByTestId('page')).toHaveTextContent('3');
    expect(screen.getByTestId('page-size')).toHaveTextContent('50');
    expect(screen.getByTestId('sort-field')).toHaveTextContent('kit_name');
    expect(screen.getByTestId('search-params')).toHaveTextContent(
      'page=3&pageSize=50&sort=kit_name'
    );
  });

  it('pushes page changes and restores them with Back and Forward', async () => {
    const Wrapper = createWrapper('/dashboard');
    render(
      <Wrapper>
        <FilterProvider user={user}>
          <PaginationHistoryHarness />
        </FilterProvider>
      </Wrapper>
    );

    await act(async () => {
      screen.getByText('Page two').click();
    });
    expect(screen.getByTestId('search-params')).toHaveTextContent('page=2&pageSize=25');
    await act(async () => {
      screen.getByText('Back').click();
    });
    expect(screen.getByTestId('page')).toHaveTextContent('1');
    expect(screen.getByTestId('search-params')).toHaveTextContent('page=1');
    await act(async () => {
      screen.getByText('Forward').click();
    });
    expect(screen.getByTestId('page')).toHaveTextContent('2');
    expect(screen.getByTestId('search-params')).toHaveTextContent('page=2&pageSize=25');
  });

  it('resets the page when search changes and keeps a selected page size', async () => {
    const Wrapper = createWrapper('/dashboard?page=3&pageSize=50');
    render(
      <Wrapper>
        <FilterProvider user={user} initialFilters={{ currentPage: 3, pageSize: 50 }}>
          <PaginationHistoryHarness />
        </FilterProvider>
      </Wrapper>
    );

    await act(async () => {
      screen.getByText('Search').click();
    });
    expect(screen.getByTestId('page')).toHaveTextContent('1');
    expect(screen.getByTestId('search-params')).toHaveTextContent('pageSize=50');
    expect(screen.getByTestId('search-params')).not.toHaveTextContent('page=3');
  });

  it('restores page size and page across history entries', async () => {
    const Wrapper = createWrapper('/dashboard');
    render(
      <Wrapper>
        <FilterProvider user={user}>
          <PaginationHistoryHarness />
        </FilterProvider>
      </Wrapper>
    );

    await act(async () => {
      screen.getByText('Size fifty').click();
    });
    await act(async () => {
      screen.getByText('Page two').click();
    });
    await act(async () => {
      screen.getByText('Back').click();
    });
    expect(screen.getByTestId('page')).toHaveTextContent('1');
    expect(screen.getByTestId('page-size')).toHaveTextContent('50');
    await act(async () => {
      screen.getByText('Back').click();
    });
    expect(screen.getByTestId('page-size')).toHaveTextContent('25');
  });
});

describe('FilterProvider: URL param hydration via initialFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedSetFilters = null;
    capturedUpdateSearch = null;
    capturedResetFilters = null;
    capturedResetDashboardFilterPanel = null;
  });

  it('clears a buffered one-character search when active filters reset', async () => {
    const Wrapper = createWrapper('/dashboard');
    render(
      <Wrapper>
        <FilterProvider user={user} initialFilters={{ selectedCompany: 'company-1' }}>
          <SearchWithClearFilters />
        </FilterProvider>
      </Wrapper>
    );

    const search = screen.getByRole('textbox', { name: 'Search project titles' });
    fireEvent.change(search, { target: { value: 'a' } });
    expect(search).toHaveValue('a');

    fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }));
    expect(search).toHaveValue('');

    fireEvent.change(search, { target: { value: 'b' } });
    expect(search).toHaveValue('b');
    await act(() => new Promise(resolve => setTimeout(resolve, 400)));
    expect(search).toHaveValue('b');
  });

  it.each(['Waiting to arrive', 'Clear quick view'])(
    'clears buffered search drafts when selecting %s',
    async action => {
      const interaction = userEvent.setup();
      const Wrapper = createWrapper('/dashboard');
      const initialFilters =
        action === 'Clear quick view' ? getDashboardQuickViewPatch(DASHBOARD_QUICK_VIEWS[0]) : {};
      render(
        <Wrapper>
          <FilterProvider user={user} initialFilters={initialFilters}>
            <SearchWithClearFilters />
            <DashboardQuickViews />
          </FilterProvider>
        </Wrapper>
      );

      const search = screen.getByRole('textbox', { name: 'Search project titles' });
      await act(async () => interaction.type(search, 'a'));
      expect(search).toHaveValue('a');
      await act(async () =>
        interaction.click(screen.getByRole('button', { name: /^Quick views/ }))
      );
      await act(async () => interaction.click(screen.getByRole('menuitem', { name: action })));
      expect(search).toHaveValue('');
      await act(async () => interaction.type(search, 'b'));
      await act(() => new Promise(resolve => setTimeout(resolve, 400)));
      expect(search).toHaveValue('b');
    }
  );

  describe('company hydration', () => {
    it('applies company ID from initialFilters to initial state', () => {
      const Wrapper = createWrapper('/dashboard?company=abc123');

      render(
        <Wrapper>
          <FilterProvider user={user} initialFilters={{ selectedCompany: 'abc123' }}>
            <FilterStateReader />
          </FilterProvider>
        </Wrapper>
      );

      expect(screen.getByTestId('selected-company').textContent).toBe('abc123');
    });

    it('defaults to "all" when initialFilters is not provided', () => {
      const Wrapper = createWrapper('/dashboard');

      render(
        <Wrapper>
          <FilterProvider user={user}>
            <FilterStateReader />
          </FilterProvider>
        </Wrapper>
      );

      expect(screen.getByTestId('selected-company').textContent).toBe('all');
    });

    it('removes the company query param after hydrating an empty company ID', async () => {
      const Wrapper = createWrapper('/dashboard?company=');

      render(
        <Wrapper>
          <FilterProvider user={user} initialFilters={{ selectedCompany: '' }}>
            <FilterStateReader />
            <URLReader />
          </FilterProvider>
        </Wrapper>
      );

      expect(screen.getByTestId('selected-company').textContent).toBe('');

      await act(() => new Promise(resolve => setTimeout(resolve, 0)));
      expect(screen.getByTestId('url-params').textContent).not.toContain('company');
    });
  });

  describe('status hydration', () => {
    it('applies activeStatus from initialFilters', () => {
      const Wrapper = createWrapper('/dashboard?status=wishlist');

      render(
        <Wrapper>
          <FilterProvider user={user} initialFilters={{ activeStatus: 'wishlist' }}>
            <FilterStateReader />
          </FilterProvider>
        </Wrapper>
      );

      expect(screen.getByTestId('active-status').textContent).toBe('wishlist');
    });

    it('defaults to "everything" when activeStatus is not provided', () => {
      const Wrapper = createWrapper('/dashboard');

      render(
        <Wrapper>
          <FilterProvider user={user}>
            <FilterStateReader />
          </FilterProvider>
        </Wrapper>
      );

      expect(screen.getByTestId('active-status').textContent).toBe('everything');
    });
  });

  describe('artist hydration', () => {
    it('applies selectedArtist from initialFilters', () => {
      const Wrapper = createWrapper('/dashboard?artist=Jane');

      render(
        <Wrapper>
          <FilterProvider user={user} initialFilters={{ selectedArtist: 'Jane' }}>
            <FilterStateReader />
          </FilterProvider>
        </Wrapper>
      );

      expect(screen.getByTestId('selected-artist').textContent).toBe('Jane');
    });
  });

  describe('tag hydration', () => {
    it('applies multiple selectedTags from initialFilters', () => {
      const Wrapper = createWrapper('/dashboard?tags=Fantasy&tags=Garden');

      render(
        <Wrapper>
          <FilterProvider user={user} initialFilters={{ selectedTags: ['Fantasy', 'Garden'] }}>
            <FilterStateReader />
          </FilterProvider>
        </Wrapper>
      );

      expect(screen.getByTestId('selected-tags').textContent).toBe('Fantasy,Garden');
    });
  });

  describe('search hydration', () => {
    it('applies searchTerm from initialFilters', () => {
      const Wrapper = createWrapper('/dashboard?search=Winter');

      render(
        <Wrapper>
          <FilterProvider user={user} initialFilters={{ searchTerm: 'Winter' }}>
            <FilterStateReader />
          </FilterProvider>
        </Wrapper>
      );

      expect(screen.getByTestId('search-term').textContent).toBe('Winter');
    });
  });

  describe('URL param writeback', () => {
    it('preserves hydrated filter params in the URL after mount', async () => {
      // Arriving at /dashboard?status=wishlist with hydrated state must leave
      // ?status=wishlist in the URL so the view is bookmarkable / shareable.
      // Before bidirectional sync, the cleanup effect stripped this on mount.
      const Wrapper = createWrapper(
        '/dashboard?company=abc123&status=wishlist&artist=Jane&tags=Fantasy&tags=Garden&search=Winter'
      );

      render(
        <Wrapper>
          <FilterProvider
            user={user}
            initialFilters={{
              selectedCompany: 'abc123',
              activeStatus: 'wishlist',
              selectedArtist: 'Jane',
              selectedTags: ['Fantasy', 'Garden'],
              searchTerm: 'Winter',
            }}
          >
            <URLReader />
          </FilterProvider>
        </Wrapper>
      );

      await act(() => new Promise(resolve => setTimeout(resolve, 0)));
      const params = screen.getByTestId('url-params').textContent || '';
      expect(params).toContain('company=abc123');
      expect(params).toContain('status=wishlist');
      expect(params).toContain('artist=Jane');
      expect(params).toContain('tags=Fantasy');
      expect(params).toContain('tags=Garden');
      expect(params).not.toContain('tag=Fantasy');
      expect(params).toContain('search=Winter');
    });

    it('preserves unrelated URL params when writing filter params', async () => {
      const Wrapper = createWrapper('/dashboard?status=wishlist&keepme=yes');

      render(
        <Wrapper>
          <FilterProvider user={user} initialFilters={{ activeStatus: 'wishlist' }}>
            <URLReader />
          </FilterProvider>
        </Wrapper>
      );

      await act(() => new Promise(resolve => setTimeout(resolve, 0)));
      const params = screen.getByTestId('url-params').textContent || '';
      expect(params).toContain('status=wishlist');
      expect(params).toContain('keepme=yes');
    });

    it('writes filter params to URL when setFilters changes state', async () => {
      const Wrapper = createWrapper('/dashboard');

      render(
        <Wrapper>
          <FilterProvider user={user}>
            <SetFiltersCapture />
            <URLReader />
          </FilterProvider>
        </Wrapper>
      );

      // Initial state: URL marks the default page-one snapshot
      await act(() => new Promise(resolve => setTimeout(resolve, 0)));
      expect(screen.getByTestId('url-params').textContent).toBe('page=1');

      // Change status via setFilters → URL gains ?status=wishlist
      await act(async () => {
        capturedSetFilters?.({ activeStatus: 'wishlist' });
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      expect(screen.getByTestId('url-params').textContent).toContain('status=wishlist');
    });

    it('writes search to the URL when updateSearch changes state', async () => {
      const Wrapper = createWrapper('/dashboard');

      render(
        <Wrapper>
          <FilterProvider user={user}>
            <FilterHelpersCapture />
            <URLReader />
          </FilterProvider>
        </Wrapper>
      );

      await act(() => new Promise(resolve => setTimeout(resolve, 0)));
      expect(screen.getByTestId('url-params').textContent).toBe('page=1');

      await act(async () => {
        capturedUpdateSearch?.('Winter Moon');
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(screen.getByTestId('url-params').textContent).toContain('search=Winter+Moon');
    });

    it('round-trips: hydrate from URL, mutate via setFilters, URL reflects new state', async () => {
      const Wrapper = createWrapper('/dashboard?status=wishlist');

      render(
        <Wrapper>
          <FilterProvider user={user} initialFilters={{ activeStatus: 'wishlist' }}>
            <SetFiltersCapture />
            <FilterStateReader />
            <URLReader />
          </FilterProvider>
        </Wrapper>
      );

      // After mount: hydrated state + URL still has the param.
      await act(() => new Promise(resolve => setTimeout(resolve, 0)));
      expect(screen.getByTestId('active-status').textContent).toBe('wishlist');
      expect(screen.getByTestId('url-params').textContent).toContain('status=wishlist');

      // Mutate state → URL follows.
      await act(async () => {
        capturedSetFilters?.({ activeStatus: 'completed' });
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      expect(screen.getByTestId('active-status').textContent).toBe('completed');
      const params = screen.getByTestId('url-params').textContent || '';
      expect(params).toContain('status=completed');
      expect(params).not.toContain('status=wishlist');
    });

    it('removes the param from URL when a filter is reset to its default', async () => {
      const Wrapper = createWrapper('/dashboard?status=wishlist');

      render(
        <Wrapper>
          <FilterProvider user={user} initialFilters={{ activeStatus: 'wishlist' }}>
            <SetFiltersCapture />
            <URLReader />
          </FilterProvider>
        </Wrapper>
      );

      await act(() => new Promise(resolve => setTimeout(resolve, 0)));
      expect(screen.getByTestId('url-params').textContent).toContain('status=wishlist');

      // Reset to default, param should disappear from URL.
      await act(async () => {
        capturedSetFilters?.({ activeStatus: 'everything' });
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      expect(screen.getByTestId('url-params').textContent).not.toContain('status');
    });

    it('removes search from the URL when resetFilters is called', async () => {
      const Wrapper = createWrapper('/dashboard?search=Winter');

      render(
        <Wrapper>
          <FilterProvider user={user} initialFilters={{ searchTerm: 'Winter' }}>
            <FilterHelpersCapture />
            <URLReader />
          </FilterProvider>
        </Wrapper>
      );

      await act(() => new Promise(resolve => setTimeout(resolve, 0)));
      expect(screen.getByTestId('url-params').textContent).toContain('search=Winter');

      await act(async () => {
        capturedResetFilters?.();
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(screen.getByTestId('url-params').textContent).not.toContain('search');
    });

    it('marks the default page-one snapshot on a clean /dashboard mount', async () => {
      const Wrapper = createWrapper('/dashboard');

      render(
        <Wrapper>
          <FilterProvider user={user}>
            <URLReader />
          </FilterProvider>
        </Wrapper>
      );

      await act(() => new Promise(resolve => setTimeout(resolve, 0)));
      expect(screen.getByTestId('url-params').textContent).toBe('page=1');
    });
  });

  describe('multi-field hydration', () => {
    it('applies every URL-hydrated field simultaneously', () => {
      const Wrapper = createWrapper('/dashboard');

      render(
        <Wrapper>
          <FilterProvider
            user={user}
            initialFilters={{
              selectedCompany: 'abc123',
              activeStatus: 'stash',
              selectedArtist: 'Jane',
              selectedTags: ['Fantasy', 'Garden'],
              searchTerm: 'Winter',
            }}
          >
            <FilterStateReader />
          </FilterProvider>
        </Wrapper>
      );

      expect(screen.getByTestId('selected-company').textContent).toBe('abc123');
      expect(screen.getByTestId('active-status').textContent).toBe('stash');
      expect(screen.getByTestId('selected-artist').textContent).toBe('Jane');
      expect(screen.getByTestId('selected-tags').textContent).toBe('Fantasy,Garden');
      expect(screen.getByTestId('search-term').textContent).toBe('Winter');
    });
  });

  describe('search-specific behavior', () => {
    it('counts search as an active filter when non-empty', () => {
      const Wrapper = createWrapper('/dashboard');

      render(
        <Wrapper>
          <FilterProvider user={user} initialFilters={{ searchTerm: 'Winter' }}>
            <FilterStateReader />
          </FilterProvider>
        </Wrapper>
      );

      expect(screen.getByTestId('active-filter-count').textContent).toBe('1');
    });

    it('counts every selected tag in the active filter count', () => {
      const Wrapper = createWrapper('/dashboard');

      render(
        <Wrapper>
          <FilterProvider user={user} initialFilters={{ selectedTags: ['Fantasy', 'Garden'] }}>
            <FilterStateReader />
          </FilterProvider>
        </Wrapper>
      );

      expect(screen.getByTestId('active-filter-count').textContent).toBe('2');
    });

    it('persists searchTerm in saved navigation context', async () => {
      const Wrapper = createWrapper('/dashboard');

      render(
        <Wrapper>
          <FilterProvider user={user}>
            <FilterHelpersCapture />
          </FilterProvider>
        </Wrapper>
      );

      await act(async () => {
        capturedUpdateSearch?.('Winter');
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(mockMutate).toHaveBeenCalled();
      const latestCall = mockMutate.mock.calls.at(-1)?.[0];
      expect(latestCall.navigationContext.filters.searchTerm).toBe('Winter');
    });

    it('resetDashboardFilterPanel preserves search while clearing panel-owned filters', async () => {
      const Wrapper = createWrapper('/dashboard?status=wishlist&search=Winter');

      render(
        <Wrapper>
          <FilterProvider
            user={user}
            initialFilters={{
              activeStatus: 'wishlist',
              searchTerm: 'Winter',
              selectedCompany: 'abc123',
            }}
          >
            <FilterHelpersCapture />
            <FilterStateReader />
            <URLReader />
          </FilterProvider>
        </Wrapper>
      );

      await act(() => new Promise(resolve => setTimeout(resolve, 0)));
      expect(screen.getByTestId('active-status').textContent).toBe('wishlist');
      expect(screen.getByTestId('selected-company').textContent).toBe('abc123');
      expect(screen.getByTestId('search-term').textContent).toBe('Winter');

      await act(async () => {
        capturedResetDashboardFilterPanel?.();
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(screen.getByTestId('active-status').textContent).toBe('everything');
      expect(screen.getByTestId('selected-company').textContent).toBe('all');
      expect(screen.getByTestId('search-term').textContent).toBe('Winter');

      const params = screen.getByTestId('url-params').textContent || '';
      expect(params).not.toContain('status=wishlist');
      expect(params).not.toContain('company=abc123');
      expect(params).toContain('search=Winter');
    });
  });
});
