import { vi, describe, it, expect } from 'vitest';

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
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, useNavigate, useSearchParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FilterProvider, useFilterHelpers, useFilters } from '../FilterContext';

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

describe('diamond pagination history', () => {
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
});
