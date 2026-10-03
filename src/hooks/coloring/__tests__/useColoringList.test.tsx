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
  it('skips the data query when no userId is provided', () => {
    useColoringBooksSpy.mockClear();
    filtersRef.current = defaultFilters();
    renderListHook({ userId: undefined });
    expect(useColoringBooksSpy).toHaveBeenCalledWith(undefined);
  });

  it('builds an empty filter and date_added desc sort for default filter state', () => {
    useColoringBooksSpy.mockClear();
    filtersRef.current = defaultFilters();

    renderListHook();

    const opts = useColoringBooksSpy.mock.calls[0][0] as {
      userId: string;
      page: number;
      perPage: number;
      filter?: string;
      sort: string;
    };
    expect(opts.userId).toBe('user-1');
    expect(opts.page).toBe(1);
    expect(opts.perPage).toBe(50);
    expect(opts.filter).toContain('status != "archived"');
    expect(opts.filter).toContain('status != "destashed"');
    expect(opts.sort).toBe('-created,+id');
  });

  it('builds filter clauses for status, publishers, tags, and mystery', () => {
    useColoringBooksSpy.mockClear();
    filtersRef.current = {
      ...defaultFilters(),
      selectedStatuses: ['in_progress'],
      selectedPublishers: ['pub-1', 'pub-2'],
      selectedTags: ['tag-1'],
      mysteryOnly: true,
      sortField: 'title',
      sortDirection: 'asc',
    };

    renderListHook();

    const opts = useColoringBooksSpy.mock.calls[0][0] as {
      filter?: string;
      sort: string;
    };
    expect(opts.filter).toContain('status');
    expect(opts.filter).toContain('in_progress');
    expect(opts.filter).toContain('publisher');
    expect(opts.filter).toContain('"pub-1"');
    expect(opts.filter).toContain('"pub-2"');
    expect(opts.filter).toContain('(publisher = "pub-1" || publisher = "pub-2")');
    expect(opts.filter).not.toContain(' in ');
    expect(opts.filter).toContain('coloring_book_tags_via_book.tag');
    expect(opts.filter).toContain('tag-1');
    expect(opts.filter).toContain('is_mystery = true');
    expect(opts.sort).toBe('+title,+id');
  });

  it('adds a search clause across title and illustrator name for non-empty searchTerm', () => {
    useColoringBooksSpy.mockClear();
    filtersRef.current = {
      ...defaultFilters(),
      searchTerm: 'Disney',
    };

    renderListHook();

    const opts = useColoringBooksSpy.mock.calls[0][0] as { filter?: string };
    expect(opts.filter).toContain('title');
    expect(opts.filter).toContain('illustrator.name');
    expect(opts.filter).toContain('source_url');
    expect(opts.filter).toContain('notes');
    expect(opts.filter).toContain('Disney');
  });

  it('uses the denormalized completion field for completion ordering', () => {
    useColoringBooksSpy.mockClear();
    filtersRef.current = {
      ...defaultFilters(),
      sortField: 'completion',
      sortDirection: 'desc',
    };

    renderListHook();

    const opts = useColoringBooksSpy.mock.calls[0][0] as { sort: string };
    expect(opts.sort).toBe('-completion_percentage,+id');
  });

  it('reports requested page and page size even when the response is from a previous page', () => {
    useColoringBooksSpy.mockClear();
    filtersRef.current = { ...defaultFilters(), currentPage: 2, pageSize: 25 };
    useColoringBooksSpy.mockReturnValueOnce(
      queryState({
        data: listPage({
          items: [],
          page: 1,
          perPage: 50,
          totalItems: 51,
          totalPages: 3,
        }),
        isPlaceholderData: true,
      })
    );

    const { result } = renderListHook();

    expect(useColoringBooksSpy).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, perPage: 25 })
    );
    expect(result.current).toMatchObject({
      page: 2,
      pageSize: 25,
      totalItems: 51,
      totalPages: 3,
      isPlaceholderData: true,
    });
  });

  it('joins publisher names onto books from the context publisher list', () => {
    useColoringBooksSpy.mockClear();
    useColoringBooksSpy.mockReturnValueOnce({
      data: {
        items: [
          {
            id: 'b1',
            userId: 'user-1',
            title: 'Wreckage',
            publisherId: 'pub-1',
            illustratorId: '',
            series: '',
            theme: '',
            isbn: '',
            coverImage: '',
            isMystery: false,
            status: 'in_progress',
            totalPages: 30,
            completedPages: 12,
            completionPercentage: 40,
            lastActivityAt: '2026-01-02T00:00:00Z',
            createdAt: '',
            updatedAt: '',
          },
        ],
        page: 1,
        perPage: 50,
        totalItems: 1,
        totalPages: 1,
      },
      isLoading: false,
      isFetching: false,
      isSuccess: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    filtersRef.current = defaultFilters();

    const { result } = renderListHook();
    expect(result.current.books).toHaveLength(1);
    expect(result.current.books[0].publisherName).toBe('Mystic Forest Press');
    expect(result.current.books[0].completedPages).toBe(12);
    expect(result.current.books[0].completionPercentage).toBe(40);
  });

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

  it('keeps the last settled page when the same query key later errors', () => {
    const user1Page = listPage({
      items: [{ id: 'b1', userId: 'user-1', title: 'Wreckage', publisherId: 'pub-1' }],
      totalItems: 1,
      totalPages: 1,
    });
    let isError = false;

    useColoringBooksSpy.mockClear();
    filtersRef.current = defaultFilters();
    useColoringBooksSpy.mockImplementation(() => {
      if (!isError) {
        return queryState({ data: user1Page });
      }
      return queryState({
        data: undefined,
        isSuccess: false,
        isError: true,
        error: new Error('refetch failed'),
      });
    });

    const { result, rerender } = renderListHook();

    expect(result.current.books).toHaveLength(1);
    expect(result.current.totalItems).toBe(1);

    isError = true;
    rerender({ userId: 'user-1' });

    expect(result.current.books).toHaveLength(1);
    expect(result.current.books[0].title).toBe('Wreckage');
    expect(result.current.totalItems).toBe(1);
    expect(result.current.totalPages).toBe(1);
    expect(result.current.isError).toBe(true);
  });

  it('keeps the last settled page when a later page fetch errors', () => {
    const firstPage = listPage({
      items: [{ id: 'b1', userId: 'user-1', title: 'Wreckage', publisherId: 'pub-1' }],
      page: 1,
      totalItems: 51,
      totalPages: 2,
    });

    useColoringBooksSpy.mockClear();
    filtersRef.current = defaultFilters();
    useColoringBooksSpy.mockImplementation((options?: { page?: number }) => {
      if (options?.page === 2) {
        return queryState({
          data: undefined,
          isSuccess: false,
          isError: true,
          error: new Error('next page failed'),
        });
      }
      return queryState({ data: firstPage });
    });

    const { result, rerender } = renderListHook();

    expect(result.current.books).toHaveLength(1);
    expect(result.current.page).toBe(1);
    expect(result.current.totalItems).toBe(51);

    filtersRef.current = { ...defaultFilters(), currentPage: 2 };
    rerender({ userId: 'user-1' });

    expect(result.current.books).toHaveLength(1);
    expect(result.current.books[0].title).toBe('Wreckage');
    expect(result.current.page).toBe(2);
    expect(result.current.pageSize).toBe(50);
    expect(result.current.totalItems).toBe(51);
    expect(result.current.isError).toBe(true);
  });

  it('does not reuse books from a previous filter when the active fetch errors', () => {
    const defaultPage = listPage({
      items: [{ id: 'b1', userId: 'user-1', title: 'Wreckage', publisherId: 'pub-1' }],
      totalItems: 1,
      totalPages: 1,
    });

    useColoringBooksSpy.mockClear();
    filtersRef.current = defaultFilters();
    useColoringBooksSpy.mockImplementation((options?: { filter?: string }) => {
      if (options?.filter?.includes('in_progress')) {
        return queryState({
          data: undefined,
          isSuccess: false,
          isError: true,
          error: new Error('filtered list failed'),
        });
      }
      return queryState({ data: defaultPage });
    });

    const { result, rerender } = renderListHook();

    expect(result.current.books).toHaveLength(1);
    expect(result.current.totalItems).toBe(1);

    filtersRef.current = { ...defaultFilters(), selectedStatuses: ['in_progress'] };
    rerender({ userId: 'user-1' });

    expect(result.current.books).toEqual([]);
    expect(result.current.totalItems).toBeUndefined();
    expect(result.current.isError).toBe(true);
  });
});
