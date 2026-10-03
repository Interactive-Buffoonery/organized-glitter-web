import '@testing-library/jest-dom/vitest';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import {
  beforeEach,
  createTestQueryClient,
  describe,
  expect,
  it,
  renderWithProviders,
  screen,
  waitFor,
} from '@/test-utils';
import { queryKeys } from '@/hooks/queries/queryKeys';

const {
  useParamsMock,
  navigateMock,
  listColoringTagsMock,
  syncBookTagsMock,
  notifyMock,
  useColoringBookMock,
  useColoringPagesMock,
} = vi.hoisted(() => ({
  useParamsMock: vi.fn(() => ({ id: 'book-123' })),
  navigateMock: vi.fn(),
  listColoringTagsMock: vi.fn(),
  syncBookTagsMock: vi.fn(),
  notifyMock: vi.fn(),
  useColoringBookMock: vi.fn(),
  useColoringPagesMock: vi.fn(),
}));

vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => useParamsMock(),
  };
});

vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="main-layout">{children}</div>
  ),
}));

vi.mock('@/components/coloring/ColoringBookEditDrawer', () => ({
  default: ({
    isOpen,
    onOpenChange,
  }: {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
  }) =>
    isOpen ? (
      <div role="dialog" aria-label="Edit coloring book">
        <button type="button" onClick={() => onOpenChange(false)}>
          Close edit drawer
        </button>
      </div>
    ) : null,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-123' } }),
}));

vi.mock('@/hooks/queries/coloring/useColoringBook', () => ({
  useColoringBook: () => useColoringBookMock(),
}));

vi.mock('@/hooks/queries/coloring/useColoringPages', () => ({
  useColoringPages: (filters: unknown) => useColoringPagesMock(filters),
}));

vi.mock('@/hooks/queries/coloring/useColoringBookTags', () => ({
  useColoringBookTags: () => ({
    data: [
      {
        id: 'tag-1',
        userId: 'user-123',
        name: 'Cozy',
        slug: 'cozy',
        color: '#ec4899',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  }),
}));

vi.mock('@/hooks/queries/coloring/useBookPublishers', () => ({
  useBookPublishers: () => ({ data: { items: [] } }),
}));

vi.mock('@/hooks/queries/coloring/useBookIllustrators', () => ({
  useBookIllustrators: () => ({ data: { items: [] } }),
}));

vi.mock('@/hooks/mutations/coloring/useUpdateColoringBook', () => ({
  useUpdateColoringBook: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/hooks/mutations/coloring/useDeleteColoringBook', () => ({
  useDeleteColoringBook: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/services/pocketbase/coloring.service', () => ({
  ColoringService: {
    getCoverImageUrl: () => '',
    getPagePhotoUrls: (page: { id: string; photos: string[] }) =>
      page.photos.map(photo => `/page-files/${page.id}/${photo}`),
  },
}));

vi.mock('@/services/pocketbase/coloringTags.service', () => ({
  ColoringTagService: {
    listColoringTags: listColoringTagsMock,
    syncBookTags: syncBookTagsMock,
  },
}));

vi.mock('@/lib/notifications', () => ({ notify: notifyMock }));

import ColoringBookDetail from '../ColoringBookDetail';
import {
  getColoringBookDetailPath,
  getColoringDashboardReturnPath,
} from '../coloringBookNavigation';

describe('getColoringDashboardReturnPath', () => {
  it('preserves a coloring library URL and rejects other destinations', () => {
    expect(
      getColoringDashboardReturnPath('/dashboard?craft=coloring&status=wishlist&page=3&pageSize=50')
    ).toBe('/dashboard?craft=coloring&status=wishlist&page=3&pageSize=50');
    expect(getColoringDashboardReturnPath('/dashboard?craft=diamonds')).toBe(
      '/dashboard?craft=coloring'
    );
    expect(getColoringDashboardReturnPath('https://example.com/dashboard?craft=coloring')).toBe(
      '/dashboard?craft=coloring'
    );
    expect(
      getColoringBookDetailPath('book-1', '/dashboard?craft=coloring&page=3&pageSize=50')
    ).toBe('/coloring/book-1?returnTo=%2Fdashboard%3Fcraft%3Dcoloring%26page%3D3%26pageSize%3D50');
  });
});

const defaultBook = {
  id: 'book-123',
  userId: 'user-123',
  title: 'Worlds of Wonder',
  publisherId: '',
  illustratorId: '',
  series: '',
  theme: '',
  isbn: '',
  coverImage: '',
  isMystery: false,
  status: 'purchased',
  totalPages: 100,
  completedPages: 1,
  completionPercentage: 1,
  datePurchased: '',
  dateReceived: '',
  dateStarted: '',
  dateCompleted: '',
  sourceUrl: '',
  bookFormat: '',
  notes: '',
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const defaultPages = [
  {
    id: 'page-1',
    bookId: 'book-123',
    pageNumber: 1,
    status: 'not_started',
    photos: [],
    mediumIds: [],
    revealedSubject: '',
    revealedAt: '',
    startedAt: '',
    completedAt: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'page-2',
    bookId: 'book-123',
    pageNumber: 2,
    status: 'completed',
    photos: ['page-2.jpg'],
    mediumIds: [],
    revealedSubject: '',
    revealedAt: '',
    startedAt: '',
    completedAt: '2026-01-02T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
];

describe('ColoringBookDetail page', () => {
  beforeEach(() => {
    useParamsMock.mockReset().mockReturnValue({ id: 'book-123' });
    useColoringBookMock.mockReset().mockReturnValue({
      isLoading: false,
      data: defaultBook,
    });
    useColoringPagesMock.mockReset().mockReturnValue({
      isLoading: false,
      data: {
        items: defaultPages,
        totalItems: defaultPages.length,
        totalPages: 1,
        page: 1,
        perPage: 500,
      },
    });
    listColoringTagsMock.mockReset().mockResolvedValue({
      status: 'success',
      data: [
        {
          id: 'tag-1',
          userId: 'user-123',
          name: 'Cozy',
          slug: 'cozy',
          color: '#ec4899',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'tag-2',
          userId: 'user-123',
          name: 'Animals',
          slug: 'animals',
          color: '#14b8a6',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    syncBookTagsMock.mockReset().mockResolvedValue({ status: 'success', data: undefined });
    notifyMock.mockReset();
  });

  it('renders a loading state while the coloring book is loading', () => {
    useColoringBookMock.mockReturnValue({
      isLoading: true,
      data: undefined,
    });

    renderWithProviders(<ColoringBookDetail />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading coloring book');
    expect(document.title).toBe('Coloring book details | Organized Glitter');
  });

  it('renders contact-sheet cells instead of page card copy', () => {
    renderWithProviders(<ColoringBookDetail />);

    expect(document.title).toBe('Worlds of Wonder | Organized Glitter');
    expect(screen.getByRole('link', { name: /open page 1/i })).toHaveAttribute(
      'href',
      '/coloring/book-123/pages/page-1?returnTo=%2Fdashboard%3Fcraft%3Dcoloring'
    );
    expect(screen.getByRole('link', { name: /open page 2/i })).toHaveAttribute(
      'href',
      '/coloring/book-123/pages/page-2?returnTo=%2Fdashboard%3Fcraft%3Dcoloring'
    );
    expect(screen.queryByText('Page card')).not.toBeInTheDocument();
    expect(screen.getByText('2 pages')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /previous 500 pages/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next 500 pages/i })).not.toBeInTheDocument();
  });

  it('loads the next 500-page batch for a legacy book', async () => {
    const user = userEvent.setup();
    const page900 = {
      ...defaultPages[0],
      id: 'page-900',
      pageNumber: 900,
    };
    useColoringBookMock.mockReturnValue({
      isLoading: false,
      data: { ...defaultBook, totalPages: 900 },
    });
    useColoringPagesMock.mockImplementation(filters => {
      const page = (filters as { page: number }).page;
      return {
        isLoading: false,
        data: {
          items: page === 2 ? [page900] : [defaultPages[0]],
          totalItems: 900,
          totalPages: 2,
          page,
          perPage: 500,
        },
      };
    });

    renderWithProviders(<ColoringBookDetail />);

    expect(screen.getByText('1-500 of 900 pages')).toBeInTheDocument();
    expect(useColoringPagesMock).toHaveBeenLastCalledWith({
      bookId: 'book-123',
      sort: 'page_number',
      page: 1,
      perPage: 500,
    });

    await user.click(screen.getByRole('button', { name: /next 500 pages/i }));

    expect(await screen.findByText('501-900 of 900 pages')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open page 900/i })).toHaveAttribute(
      'href',
      '/coloring/book-123/pages/page-900?returnTo=%2Fdashboard%3Fcraft%3Dcoloring'
    );
    expect(screen.getByRole('button', { name: /previous 500 pages/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /next 500 pages/i })).toBeDisabled();
    expect(useColoringPagesMock).toHaveBeenLastCalledWith({
      bookId: 'book-123',
      sort: 'page_number',
      page: 2,
      perPage: 500,
    });
  });

  it('returns to cached page one after a retryable second-batch failure', async () => {
    const user = userEvent.setup();
    const returnTo = '/dashboard?craft=coloring&status=wishlist&page=3';
    useColoringBookMock.mockReturnValue({
      isLoading: false,
      data: { ...defaultBook, totalPages: 900 },
    });
    useColoringPagesMock.mockImplementation(filters => {
      const page = (filters as { page: number }).page;
      return page === 2
        ? {
            isLoading: false,
            isError: true,
            error: { type: 'server', message: 'Unavailable', retryable: true },
            data: undefined,
            isFetching: false,
            refetch: vi.fn(),
          }
        : {
            isLoading: false,
            data: {
              items: [defaultPages[0]],
              totalItems: 900,
              totalPages: 2,
              page: 1,
              perPage: 500,
            },
          };
    });

    renderWithProviders(<ColoringBookDetail />, {
      initialRoute: `/coloring/book-123?returnTo=${encodeURIComponent(returnTo)}`,
    });

    await user.click(screen.getByRole('button', { name: 'Next 500 pages' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load coloring book pages');
    expect(screen.getByRole('button', { name: 'Previous 500 pages' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Previous 500 pages' }));

    expect(screen.getByRole('link', { name: /open page 1/i })).toHaveAttribute(
      'href',
      `/coloring/book-123/pages/page-1?returnTo=${encodeURIComponent(returnTo)}`
    );
    expect(useColoringPagesMock).toHaveBeenLastCalledWith({
      bookId: 'book-123',
      sort: 'page_number',
      page: 1,
      perPage: 500,
    });
  });

  it('returns to the first batch when a legacy book is reduced below the current range', async () => {
    const user = userEvent.setup();
    let book = { ...defaultBook, totalPages: 900 };
    useColoringBookMock.mockImplementation(() => ({ isLoading: false, data: book }));
    useColoringPagesMock.mockImplementation(filters => {
      const page = (filters as { page: number }).page;
      return {
        isLoading: false,
        data: {
          items: defaultPages,
          totalItems: book.totalPages,
          totalPages: Math.ceil(book.totalPages / 500),
          page,
          perPage: 500,
        },
      };
    });
    const { rerender } = renderWithProviders(<ColoringBookDetail />);

    await user.click(screen.getByRole('button', { name: /next 500 pages/i }));
    expect(screen.getByText('501-900 of 900 pages')).toBeInTheDocument();

    book = { ...book, totalPages: 400 };
    rerender(<ColoringBookDetail />);

    await waitFor(() => {
      expect(useColoringPagesMock).toHaveBeenLastCalledWith({
        bookId: 'book-123',
        sort: 'page_number',
        page: 1,
        perPage: 500,
      });
    });
    expect(screen.getByText('2 pages')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next 500 pages/i })).not.toBeInTheDocument();
  });

  it('starts at the first batch when the detail route changes books', async () => {
    const user = userEvent.setup();
    let bookId = 'book-123';
    useParamsMock.mockImplementation(() => ({ id: bookId }));
    useColoringBookMock.mockReturnValue({
      isLoading: false,
      data: { ...defaultBook, totalPages: 900 },
    });
    useColoringPagesMock.mockImplementation(filters => {
      const page = (filters as { page: number }).page;
      return {
        isLoading: false,
        data: {
          items: defaultPages,
          totalItems: 900,
          totalPages: 2,
          page,
          perPage: 500,
        },
      };
    });
    const { rerender } = renderWithProviders(<ColoringBookDetail />);

    await user.click(screen.getByRole('button', { name: /next 500 pages/i }));
    expect(screen.getByText('501-900 of 900 pages')).toBeInTheDocument();

    bookId = 'book-456';
    rerender(<ColoringBookDetail />);

    expect(useColoringPagesMock).toHaveBeenLastCalledWith({
      bookId: 'book-456',
      sort: 'page_number',
      page: 1,
      perPage: 500,
    });
    expect(screen.getByText('1-500 of 900 pages')).toBeInTheDocument();
  });

  it('does not restore an old batch after navigating away and back to a book', async () => {
    const user = userEvent.setup();
    let bookId = 'book-123';
    useParamsMock.mockImplementation(() => ({ id: bookId }));
    useColoringBookMock.mockImplementation(() => ({
      isLoading: false,
      data: {
        ...defaultBook,
        id: bookId,
        totalPages: bookId === 'book-123' ? 900 : 100,
      },
    }));
    useColoringPagesMock.mockImplementation(filters => {
      const { bookId: requestedBookId, page } = filters as { bookId: string; page: number };
      const totalItems = requestedBookId === 'book-123' ? 900 : 100;
      return {
        isLoading: false,
        data: {
          items: defaultPages,
          totalItems,
          totalPages: Math.ceil(totalItems / 500),
          page,
          perPage: 500,
        },
      };
    });
    const { rerender } = renderWithProviders(<ColoringBookDetail />);

    await user.click(screen.getByRole('button', { name: /next 500 pages/i }));
    expect(screen.getByText('501-900 of 900 pages')).toBeInTheDocument();

    bookId = 'book-456';
    rerender(<ColoringBookDetail />);
    expect(useColoringPagesMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ bookId: 'book-456', page: 1 })
    );

    bookId = 'book-123';
    rerender(<ColoringBookDetail />);

    expect(useColoringPagesMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ bookId: 'book-123', page: 1 })
    );
    expect(screen.getByText('1-500 of 900 pages')).toBeInTheDocument();
  });

  it('opens the edit drawer from the quiet edit button', async () => {
    const user = userEvent.setup();

    renderWithProviders(<ColoringBookDetail />);

    const editButton = screen.getByRole('button', { name: /edit coloring book/i });

    expect(editButton).toHaveTextContent('Edit');
    expect(screen.queryByRole('link', { name: /edit book/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /edit coloring book/i })).not.toBeInTheDocument();

    await user.click(editButton);

    expect(screen.getByRole('dialog', { name: /edit coloring book/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /edit book/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /close edit drawer/i }));

    expect(screen.queryByRole('dialog', { name: /edit coloring book/i })).not.toBeInTheDocument();
  });

  it('keeps the direct edit route out of the primary detail action', () => {
    renderWithProviders(<ColoringBookDetail />);

    expect(screen.queryByRole('link', { name: /edit book/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /edit coloring book/i })).not.toBeInTheDocument();
  });

  it('renders coloring book tags in the header and notes as its own section', () => {
    renderWithProviders(<ColoringBookDetail />);

    expect(screen.queryByText('Tags & notes')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tags' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeInTheDocument();
    expect(screen.getByText('Cozy')).toBeInTheDocument();
  });

  it('shows persisted completion metrics when the loaded page list is capped', () => {
    useColoringBookMock.mockReturnValue({
      isLoading: false,
      data: {
        ...defaultBook,
        totalPages: 600,
        completedPages: 550,
        completionPercentage: 91.67,
      },
    });
    useColoringPagesMock.mockReturnValue({
      isLoading: false,
      data: {
        items: Array.from({ length: 500 }, (_, index) => ({
          ...defaultPages[1],
          id: `page-${index + 1}`,
          pageNumber: index + 1,
          status: 'completed',
        })),
      },
    });

    renderWithProviders(<ColoringBookDetail />);

    expect(screen.getByText('550')).toBeInTheDocument();
    expect(screen.getByText(/of 600 pages completed/i)).toBeInTheDocument();
    expect(screen.getByText('92%')).toBeInTheDocument();
  });

  it('sets a not-found title when the coloring book is missing', () => {
    useColoringBookMock.mockReturnValue({
      isLoading: false,
      data: null,
      error: { type: 'not_found', message: 'Missing book', retryable: false },
    });

    renderWithProviders(<ColoringBookDetail />);

    expect(screen.getByRole('heading', { name: 'Coloring book not found' })).toBeInTheDocument();
    expect(document.title).toBe('Coloring book not found | Organized Glitter');
  });

  it('shows a refresh notice while retaining cached book details after a server failure', async () => {
    const refetch = vi.fn();
    useColoringBookMock.mockReturnValue({
      isLoading: false,
      isError: true,
      data: defaultBook,
      error: { type: 'server', message: 'Unavailable', retryable: true },
      refetch,
    });

    renderWithProviders(<ColoringBookDetail />);

    expect(screen.getByRole('heading', { name: 'Worlds of Wonder' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not refresh coloring book');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('keeps cached book details without retry after a validation failure', () => {
    useColoringBookMock.mockReturnValue({
      isLoading: false,
      isError: true,
      data: defaultBook,
      error: { type: 'validation', message: 'Invalid book', retryable: false },
    });

    renderWithProviders(<ColoringBookDetail />);

    expect(screen.getByRole('heading', { name: 'Worlds of Wonder' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not refresh coloring book');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('announces retry progress and another failed outcome without moving focus', async () => {
    let finishRetry: ((result: { isError: boolean }) => void) | undefined;
    const refetch = vi.fn().mockImplementation(
      () =>
        new Promise<{ isError: boolean }>(resolve => {
          finishRetry = resolve;
        })
    );
    useColoringBookMock.mockReturnValue({
      isLoading: false,
      isError: true,
      data: undefined,
      error: { type: 'server', message: 'Unavailable', retryable: true },
      refetch,
    });

    renderWithProviders(<ColoringBookDetail />);
    const retry = screen.getByRole('button', { name: 'Try again' });
    retry.focus();
    await userEvent.setup().click(retry);
    expect(screen.getByRole('button', { name: 'Trying again' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Trying again to load coloring book');
    expect(refetch).toHaveBeenCalledOnce();

    finishRetry?.({ isError: true });
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Still could not load coloring book')
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Try again' }));
  });

  it('preserves the return URL on the not-found back link', () => {
    useColoringBookMock.mockReturnValue({
      isLoading: false,
      data: null,
      error: { type: 'not_found', message: 'Missing book', retryable: false },
    });
    const returnTo = '/dashboard?craft=coloring&page=3&pageSize=50';

    renderWithProviders(<ColoringBookDetail />, {
      initialRoute: `/coloring/book-123?returnTo=${encodeURIComponent(returnTo)}`,
    });

    expect(screen.getByRole('link', { name: 'Back to coloring' })).toHaveAttribute(
      'href',
      returnTo
    );
  });

  it('adds coloring book tags from the header tag control', async () => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Infinity } });
    const overviewKey = queryKeys.stats.overview('user-123');
    const coloringCollectionKey = queryKeys.stats.coloringCollection('user-123');
    const diamondSummaryKey = queryKeys.stats.summary('user-123', 2026);
    for (const key of [overviewKey, coloringCollectionKey, diamondSummaryKey]) {
      queryClient.setQueryData(key, { total: 1 });
    }

    renderWithProviders(<ColoringBookDetail />, { queryClient });

    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.click(await screen.findByRole('option', { name: 'Animals' }));

    await waitFor(() => {
      expect(syncBookTagsMock).toHaveBeenCalledWith('book-123', ['tag-1', 'tag-2']);
      expect(queryClient.getQueryState(coloringCollectionKey)?.isInvalidated).toBe(true);
    });
    expect(queryClient.getQueryState(overviewKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(diamondSummaryKey)?.isInvalidated).toBe(false);
  });

  it('leaves Stats cached when coloring book tags fail to save', async () => {
    syncBookTagsMock.mockResolvedValue({
      status: 'error',
      data: null,
      error: new Error('Tag sync failed'),
    });
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Infinity } });
    const coloringCollectionKey = queryKeys.stats.coloringCollection('user-123');
    queryClient.setQueryData(coloringCollectionKey, { total: 1 });

    renderWithProviders(<ColoringBookDetail />, { queryClient });
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.click(await screen.findByRole('option', { name: 'Animals' }));

    await waitFor(() => expect(syncBookTagsMock).toHaveBeenCalledTimes(1));
    expect(queryClient.getQueryState(coloringCollectionKey)?.isInvalidated).toBe(false);
    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'warning' }));
  });

  it('shows an error when coloring book tag sync throws', async () => {
    syncBookTagsMock.mockRejectedValue(new Error('Connection lost'));
    const user = userEvent.setup();
    renderWithProviders(<ColoringBookDetail />);

    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.click(await screen.findByRole('option', { name: 'Animals' }));

    await waitFor(() =>
      expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }))
    );
  });
});
