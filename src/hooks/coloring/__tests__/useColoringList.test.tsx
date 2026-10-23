import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ColoringFilterState } from '@/contexts/ColoringFilterContext';

const useColoringBooksSpy = vi.fn((_options?: unknown) => ({
  data: {
    items: [] as unknown[],
    page: 1,
    perPage: 50,
    totalItems: 0,
    totalPages: 0,
  },
  isLoading: false,
  isFetching: false,
  isPlaceholderData: false,
  isSuccess: true,
  isError: false,
  error: null,
  refetch: vi.fn(),
}));

const listPage = (overrides?: {
  items?: unknown[];
  page?: number;
  perPage?: number;
  totalItems?: number;
  totalPages?: number;
}) => ({
  items: overrides?.items ?? ([] as unknown[]),
  page: overrides?.page ?? 1,
  perPage: overrides?.perPage ?? 50,
  totalItems: overrides?.totalItems ?? 0,
  totalPages: overrides?.totalPages ?? 0,
});

const queryState = (overrides?: Record<string, unknown>) => ({
  data: listPage(),
  isLoading: false,
  isFetching: false,
  isPlaceholderData: false,
  isSuccess: true,
  isError: false,
  error: null,
  refetch: vi.fn(),
  ...overrides,
});

const defaultFilters = (): ColoringFilterState => ({
  selectedStatuses: [],
  selectedPublishers: [],
  selectedIllustrators: [],
  selectedTags: [],
  mysteryOnly: false,
  includeArchived: false,
  includeDestashed: false,
  searchTerm: '',
  sortField: 'date_added',
  sortDirection: 'desc',
  currentPage: 1,
  pageSize: 50,
});

const filtersRef: { current: ColoringFilterState } = {
  current: defaultFilters(),
};

vi.mock('@/contexts/ColoringFilterContext', () => ({
  useColoringFilters: () => ({
    filters: filtersRef.current,
    publishers: [
      { id: 'pub-1', name: 'Mystic Forest Press' },
      { id: 'pub-2', name: 'Hello Angel Designs' },
    ],
  }),
}));

vi.mock('@/hooks/queries/coloring/useColoringBooks', () => ({
  useColoringBooks: (...args: unknown[]) => useColoringBooksSpy(...(args as [])),
}));

import { useColoringList } from '../useColoringList';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
};

const renderListHook = (initialProps: { userId: string | undefined } = { userId: 'user-1' }) => {
  return renderHook(({ userId }: { userId: string | undefined }) => useColoringList({ userId }), {
    wrapper: createWrapper(),
    initialProps,
  });
};

describe('useColoringList', () => {
  it('does not reuse books from a previous query key when the active fetch errors', () => {
    const user1Page = listPage({
      items: [{ id: 'b1', userId: 'user-1', title: 'Wreckage', publisherId: 'pub-1' }],
      totalItems: 1,
      totalPages: 1,
    });

    useColoringBooksSpy.mockClear();
    filtersRef.current = defaultFilters();
    useColoringBooksSpy.mockImplementation((options?: { userId?: string }) => {
      if (options?.userId === 'user-1') {
        return queryState({ data: user1Page });
      }
      return queryState({
        data: undefined,
        isSuccess: false,
        isError: true,
        error: new Error('list failed'),
      });
    });

    const { result, rerender } = renderListHook({ userId: 'user-1' });

    expect(result.current.books).toHaveLength(1);
    expect(result.current.totalItems).toBe(1);

    rerender({ userId: 'user-2' });

    expect(result.current.books).toEqual([]);
    expect(result.current.totalItems).toBeUndefined();
    expect(result.current.totalPages).toBeUndefined();
    expect(result.current.isError).toBe(true);
  });
});
