import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ColoringFilterProvider } from '@/contexts/ColoringFilterContext';
import { ColoringDashboardPane } from '@/components/coloring/ColoringDashboardPane';

const listBooksMock = vi.hoisted(() => vi.fn());
const savedNavigationState = vi.hoisted(() => ({
  data: null as { filters: Record<string, unknown> } | null,
  isLoading: false,
  isFetching: false,
}));

vi.mock('@/services/pocketbase/coloring.service', () => ({
  ColoringService: { listBooks: listBooksMock },
}));

vi.mock('@/hooks/use-mobile', () => ({
  useMobileDevice: () => ({ isMobile: false, isTablet: false }),
  useIsMobile: () => false,
}));

vi.mock('@/hooks/useAppReady', () => ({ useAppReady: vi.fn() }));

vi.mock('@/hooks/queries/coloring/useBookPublishers', () => ({
  useBookPublishers: () => ({ data: { items: [] }, isLoading: false }),
}));

vi.mock('@/hooks/queries/coloring/useBookIllustrators', () => ({
  useBookIllustrators: () => ({ data: { items: [] }, isLoading: false }),
}));

vi.mock('@/hooks/queries/coloring/useColoringTags', () => ({
  useColoringTags: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/hooks/queries/useColoringNavigationContext', () => ({
  useColoringNavigationContext: () => savedNavigationState,
}));

vi.mock('@/hooks/mutations/useSaveColoringNavigationContext', () => ({
  useSaveColoringNavigationContext: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/components/coloring/ColoringFilterStrip', () => ({
  ColoringControlsRow: () => <div>Coloring controls</div>,
  ColoringFilterPanel: () => <div>Coloring filters</div>,
}));

vi.mock('@/components/coloring/ColoringBookGrid', () => ({
  ColoringBookGrid: ({
    books,
    isLoading,
  }: {
    books: Array<{ title: string }>;
    isLoading: boolean;
  }) =>
    isLoading ? (
      <div role="status">Loading coloring books</div>
    ) : (
      <div data-testid="coloring-book-grid">
        {books.map(book => (
          <span key={book.title}>{book.title}</span>
        ))}
      </div>
    ),
}));

const makeBook = (number: number) => ({
  id: `book-${number}`,
  userId: 'user-1',
  title: `Book ${number}`,
  publisherId: '',
  illustratorId: '',
  series: '',
  theme: '',
  isbn: '',
  coverImage: '',
  isMystery: false,
  status: 'purchased',
  totalPages: 20,
  completedPages: 0,
  completionPercentage: 0,
  lastActivityAt: '',
  createdAt: '',
  updatedAt: '',
});

const renderPane = (initialEntry = '/dashboard?craft=coloring') => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const renderResult = render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={queryClient}>
        <ColoringFilterProvider user={{ id: 'user-1' }}>
          <ColoringDashboardPane userId="user-1" />
        </ColoringFilterProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
  return { ...renderResult, queryClient };
};

describe('ColoringDashboardPane pagination', () => {
  beforeEach(() => {
    savedNavigationState.data = null;
    savedNavigationState.isLoading = false;
    savedNavigationState.isFetching = false;
    listBooksMock.mockReset().mockImplementation(({ page, perPage }) => {
      const allBooks = Array.from({ length: 51 }, (_, index) => makeBook(index + 1));
      const start = (page - 1) * perPage;
      return Promise.resolve({
        items: allBooks.slice(start, start + perPage),
        page,
        perPage,
        totalItems: allBooks.length,
        totalPages: Math.ceil(allBooks.length / perPage),
      });
    });
  });

  it('requests and renders books after the first 50', async () => {
    renderPane();

    expect(await screen.findByText('Book 50')).toBeInTheDocument();
    expect(screen.queryByText('Book 51')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 1-50 of 51 books')).toBeInTheDocument();

    const nextLink = screen.getByRole('link', { name: 'Go to next page' });
    expect(nextLink).toHaveAttribute('href', '/dashboard?craft=coloring&page=2&pageSize=50');
    nextLink.focus();
    fireEvent.click(nextLink);

    expect(await screen.findByText('Book 51')).toBeInTheDocument();
    expect(screen.getByText('Showing 51-51 of 51 books')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to next page' })).toHaveFocus();
    await waitFor(() =>
      expect(listBooksMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, perPage: 50 })
      )
    );
  });

  it('corrects a saved page to page one when the filtered result is empty', async () => {
    listBooksMock.mockResolvedValue({
      items: [],
      page: 4,
      perPage: 50,
      totalItems: 0,
      totalPages: 0,
    });

    renderPane('/dashboard?craft=coloring&page=4&pageSize=50');

    await waitFor(() =>
      expect(listBooksMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }))
    );
    expect(listBooksMock.mock.calls[0][0]).toEqual(expect.objectContaining({ page: 4 }));
  });

  it('shows a retry error instead of the empty grid when the initial request fails', async () => {
    listBooksMock.mockRejectedValue(new Error('request failed'));

    renderPane();

    expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent(
      'Unable to load coloring books'
    );
    expect(screen.queryByTestId('coloring-book-grid')).not.toBeInTheDocument();
  });

  it('keeps the loaded page visible when the next page request fails', async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => makeBook(index + 1));
    listBooksMock
      .mockResolvedValueOnce({
        items: firstPage,
        page: 1,
        perPage: 50,
        totalItems: 51,
        totalPages: 2,
      })
      .mockRejectedValue(new Error('request failed'));

    renderPane();
    expect(await screen.findByText('Book 50')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Go to next page' }));

    expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent(
      'Could not refresh coloring books. Showing the last loaded results.'
    );
    expect(screen.getByText('Book 50')).toBeInTheDocument();
    expect(screen.getByText('Showing 51-51 of 51 books')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to next page' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });
});
