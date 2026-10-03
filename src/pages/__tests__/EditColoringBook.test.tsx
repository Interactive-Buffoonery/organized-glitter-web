import '@testing-library/jest-dom/vitest';
import React from 'react';
import { vi } from 'vitest';
import {
  beforeEach,
  createTestQueryClient,
  describe,
  expect,
  it,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from '@/test-utils';

const {
  navigateMock,
  useParamsMock,
  updateBookMutateAsync,
  notifyMock,
  loggerErrorMock,
  createPublisherMutateAsync,
  createIllustratorMutateAsync,
  bookState,
  coverUrlMock,
  refetchBookMock,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  useParamsMock: vi.fn(() => ({ id: 'book-123' })),
  updateBookMutateAsync: vi.fn(),
  notifyMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  createPublisherMutateAsync: vi.fn(),
  createIllustratorMutateAsync: vi.fn(),
  coverUrlMock: vi.fn(() => ''),
  refetchBookMock: vi.fn(),
  bookState: {
    data: {
      id: 'book-123',
      userId: 'user-123',
      title: 'Worlds of Wonder',
      publisherId: 'pub-1',
      illustratorId: 'ill-1',
      series: '',
      theme: '',
      isbn: '',
      coverImage: '',
      isMystery: false,
      status: 'purchased',
      totalPages: 100,
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    isLoading: false,
  },
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

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-123' } }),
}));

vi.mock('@/hooks/queries/coloring/useColoringBook', () => ({
  useColoringBook: () => ({ ...bookState, refetch: refetchBookMock }),
}));

vi.mock('@/hooks/queries/coloring/useBookPublishers', () => ({
  useBookPublishers: () => ({ data: { items: [{ id: 'pub-1', name: 'Penguin' }] } }),
}));

vi.mock('@/hooks/queries/coloring/useBookIllustrators', () => ({
  useBookIllustrators: () => ({ data: { items: [{ id: 'ill-1', name: 'Jeremy Mariez' }] } }),
}));

vi.mock('@/hooks/mutations/coloring/useUpdateColoringBook', () => ({
  useUpdateColoringBook: () => ({
    mutateAsync: updateBookMutateAsync,
    isPending: false,
  }),
}));

vi.mock('@/hooks/mutations/coloring/useCreateBookPublisher', () => ({
  useCreateBookPublisher: () => ({
    mutateAsync: createPublisherMutateAsync,
  }),
}));

vi.mock('@/hooks/mutations/coloring/useCreateBookIllustrator', () => ({
  useCreateBookIllustrator: () => ({
    mutateAsync: createIllustratorMutateAsync,
  }),
}));

vi.mock('@/services/pocketbase/coloring.service', () => ({
  ColoringService: {
    getCoverImageUrl: coverUrlMock,
  },
}));

vi.mock('@/services/pocketbase/coloringTags.service', () => ({
  ColoringTagService: {
    listColoringTags: async () => ({
      status: 'success',
      data: [
        {
          id: 'coloring-tag-1',
          userId: 'user-123',
          name: 'Cozy',
          slug: 'cozy',
          color: '#14b8a6',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    }),
    createColoringTag: async () => ({ status: 'success', data: null }),
  },
}));

vi.mock('@/lib/notifications', () => ({
  notify: notifyMock,
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: loggerErrorMock,
    debug: vi.fn(),
    secureInfo: vi.fn(),
    criticalError: vi.fn(),
    group: vi.fn(),
    groupEnd: vi.fn(),
    groupCollapsed: vi.fn(),
    table: vi.fn(),
  }),
}));

import EditColoringBook from '../EditColoringBook';

describe('EditColoringBook page', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    useParamsMock.mockReset().mockReturnValue({ id: 'book-123' });
    Element.prototype.hasPointerCapture ??= vi.fn(() => false);
    Element.prototype.setPointerCapture ??= vi.fn();
    Element.prototype.releasePointerCapture ??= vi.fn();
    Element.prototype.scrollIntoView ??= vi.fn();
    updateBookMutateAsync.mockReset().mockResolvedValue({ book: { id: 'book-123' } });
    notifyMock.mockReset();
    loggerErrorMock.mockReset();
    createPublisherMutateAsync.mockReset();
    createIllustratorMutateAsync.mockReset();
    coverUrlMock.mockReset().mockReturnValue('');
    refetchBookMock.mockReset();
    bookState.data = {
      id: 'book-123',
      userId: 'user-123',
      title: 'Worlds of Wonder',
      publisherId: 'pub-1',
      illustratorId: 'ill-1',
      series: '',
      theme: '',
      isbn: '',
      coverImage: '',
      isMystery: false,
      status: 'purchased',
      totalPages: 100,
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    bookState.isLoading = false;
  });

  it('renders loading and not-found states', () => {
    bookState.isLoading = true;
    const { rerender } = renderWithProviders(<EditColoringBook />);

    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    expect(document.title).toBe('Edit coloring book | Organized Glitter');

    bookState.isLoading = false;
    bookState.data = null as never;
    rerender(<EditColoringBook />);

    expect(screen.getByRole('heading', { name: 'Coloring book not found' })).toBeInTheDocument();
    expect(document.title).toBe('Coloring book not found | Organized Glitter');
  });

  it('renders the edit header', () => {
    renderWithProviders(<EditColoringBook />);

    expect(screen.getByRole('heading', { name: 'Edit book' })).toBeInTheDocument();
    expect(document.title).toBe('Edit Worlds of Wonder | Organized Glitter');
  });

  it('updates a coloring book and persists total pages', async () => {
    const user = userEvent.setup();

    renderWithProviders(<EditColoringBook />);

    await user.clear(screen.getByLabelText(/Title/));
    await user.type(screen.getByLabelText(/Title/), 'Updated Worlds');
    await user.clear(screen.getByLabelText(/Number of pages/));
    await user.type(screen.getByLabelText(/Number of pages/), '120');
    await user.click(screen.getByRole('button', { name: 'Update book' }));

    await waitFor(() => {
      expect(updateBookMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          patch: expect.objectContaining({
            title: 'Updated Worlds',
            total_pages: 120,
            status: 'purchased',
            is_mystery: false,
          }),
        })
      );
      expect(navigateMock).toHaveBeenCalledWith('/coloring/book-123');
    });
  });

  it('omits unchanged page totals when saving a title edit', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EditColoringBook />);

    await user.clear(screen.getByLabelText(/Title/));
    await user.type(screen.getByLabelText(/Title/), 'Updated Worlds');
    await user.click(screen.getByRole('button', { name: 'Update book' }));

    await waitFor(() => expect(updateBookMutateAsync).toHaveBeenCalledTimes(1));
    expect(updateBookMutateAsync.mock.calls[0][0].patch).not.toHaveProperty('total_pages');
    expect(navigateMock).toHaveBeenCalledWith('/coloring/book-123');
  });

  it('adds an inline illustrator without submitting the edit form', async () => {
    const user = userEvent.setup();
    createIllustratorMutateAsync.mockResolvedValue({ id: 'ill-new', name: 'Pat Lee' });

    renderWithProviders(<EditColoringBook />);

    await user.click(screen.getByRole('button', { name: 'Add illustrator' }));
    await user.type(screen.getByLabelText('Name'), 'Pat Lee');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Pat Lee')).toBeVisible();
    expect(createIllustratorMutateAsync).toHaveBeenCalledWith({ name: 'Pat Lee' });
    expect(updateBookMutateAsync).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('clears an existing cover image when the user removes it', async () => {
    const user = userEvent.setup();
    bookState.data = {
      ...bookState.data,
      coverImage: 'cover.jpg',
    };
    coverUrlMock.mockReturnValue('https://example.com/cover.jpg');

    renderWithProviders(<EditColoringBook />);

    await user.click(screen.getByRole('button', { name: 'Remove cover image' }));
    await user.click(screen.getByRole('button', { name: 'Update book' }));

    await waitFor(() => {
      expect(updateBookMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          patch: expect.objectContaining({
            cover_image: '',
          }),
        })
      );
    });
  });

  it('offers softcover and hardcover formats without offering physical book', async () => {
    const user = userEvent.setup();

    renderWithProviders(<EditColoringBook />);

    await user.click(screen.getByLabelText('Format'));

    expect(screen.getByRole('option', { name: 'Softcover' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Hardcover' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Physical book' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: 'Hardcover' }));
    await user.click(screen.getByRole('button', { name: 'Update book' }));

    await waitFor(() => {
      expect(updateBookMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          patch: expect.objectContaining({
            book_format: 'hardcover',
          }),
        })
      );
    });
  });

  it('submits explicit clear values for existing optional metadata', async () => {
    const user = userEvent.setup();
    bookState.data = {
      ...bookState.data,
      publisherId: 'pub-1',
      illustratorId: 'ill-1',
      series: 'Worlds',
      theme: 'Fantasy',
      isbn: '9781234567890',
      publicationYear: 2024,
      edition: 'First',
      language: 'english',
      sourceUrl: 'https://example.com/book',
      datePurchased: '2026-01-02',
      dateReceived: '2026-01-03',
      dateStarted: '2026-01-04',
      dateCompleted: '2026-01-05',
      bookFormat: 'paperback',
      notes: 'Keep this note',
    };

    renderWithProviders(<EditColoringBook />);

    await user.click(screen.getByLabelText('Format'));
    await user.click(screen.getByRole('option', { name: 'No format' }));
    await user.click(screen.getByLabelText('Publisher'));
    await user.click(screen.getByRole('option', { name: 'No publisher' }));
    await user.click(screen.getByLabelText('Illustrator'));
    await user.click(screen.getByRole('option', { name: 'No illustrator' }));
    await user.click(screen.getByLabelText('Language'));
    await user.click(screen.getByRole('option', { name: 'No language' }));

    await user.clear(screen.getByLabelText('Series'));
    await user.clear(screen.getByLabelText('Theme'));
    await user.clear(screen.getByLabelText('ISBN'));
    await user.clear(screen.getByLabelText('Publication year'));
    await user.clear(screen.getByLabelText('Edition'));
    await user.clear(screen.getByLabelText('Source URL'));
    await user.clear(screen.getByLabelText('Purchased'));
    await user.clear(screen.getByLabelText('Received'));
    await user.clear(screen.getByLabelText('Started'));
    await user.clear(screen.getByLabelText('Completed'));
    await user.clear(screen.getByLabelText('Notes'));
    await user.click(screen.getByRole('button', { name: 'Update book' }));

    await waitFor(() => {
      expect(updateBookMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          patch: expect.objectContaining({
            series: '',
            theme: '',
            isbn: '',
            publication_year: 0,
            edition: '',
            language: '',
            source_url: '',
            date_purchased: '',
            date_received: '',
            date_started: '',
            date_completed: '',
            book_format: '',
            notes: '',
            publisher: '',
            illustrator: '',
          }),
        })
      );
    });
  });

  it('syncs selected coloring tags after updating the book', async () => {
    const user = userEvent.setup();

    renderWithProviders(<EditColoringBook />);

    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.click(await screen.findByRole('option', { name: 'Cozy' }));
    await user.click(screen.getByRole('button', { name: 'Update book' }));

    await waitFor(() => {
      expect(updateBookMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedRevision: 0,
          tagIds: ['coloring-tag-1'],
        })
      );
      expect(navigateMock).toHaveBeenCalledWith('/coloring/book-123');
    });
  });

  it('shows the highest protected page when a reduction is rejected', async () => {
    const user = userEvent.setup();
    updateBookMutateAsync.mockRejectedValue({
      type: 'validation',
      message: 'Total pages cannot be less than 900 because that page has saved work.',
      retryable: false,
    });

    renderWithProviders(<EditColoringBook />);

    await user.click(screen.getByRole('button', { name: 'Update book' }));

    await waitFor(() => {
      expect(notifyMock).toHaveBeenCalledWith({
        kind: 'error',
        title: 'Could not update coloring book',
        description: 'Total pages cannot be less than 900 because that page has saved work.',
      });
    });
    expect(navigateMock).not.toHaveBeenCalledWith('/coloring/book-123');
  });

  it('does not carry a late recovery revision into a different book', async () => {
    const user = userEvent.setup();
    let releaseRefetch!: (result: unknown) => void;
    refetchBookMock.mockReturnValue(
      new Promise(resolve => {
        releaseRefetch = resolve;
      })
    );
    updateBookMutateAsync.mockRejectedValueOnce({ status: 409 });
    const { rerender } = renderWithProviders(<EditColoringBook />);

    await user.click(screen.getByRole('button', { name: 'Update book' }));
    await user.click(screen.getByRole('button', { name: 'Keep my edits for a new save' }));
    useParamsMock.mockReturnValue({ id: 'book-456' });
    bookState.data = { ...bookState.data, id: 'book-456', title: 'Second book', revision: 0 };
    rerender(<EditColoringBook />);
    releaseRefetch({ isError: false, data: { id: 'book-123', userId: 'user-123', revision: 7 } });

    await waitFor(() => expect(screen.getByLabelText(/Title/)).toHaveValue('Second book'));
    await user.click(screen.getByRole('button', { name: 'Update book' }));
    await waitFor(() => expect(updateBookMutateAsync).toHaveBeenCalledTimes(2));
    expect(updateBookMutateAsync.mock.calls[1][0]).toMatchObject({
      bookId: 'book-456',
      expectedRevision: 0,
    });
  });

  it('shows the supported reduction step in the saved draft error', async () => {
    const user = userEvent.setup();
    updateBookMutateAsync.mockRejectedValue({
      type: 'validation',
      message: 'Reduce this coloring book in steps of 500 pages or fewer.',
      retryable: false,
    });
    renderWithProviders(<EditColoringBook />);
    await user.click(screen.getByRole('button', { name: 'Update book' }));
    await waitFor(() =>
      expect(notifyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Reduce this coloring book in steps of 500 pages or fewer.',
        })
      )
    );
  });

  it('still navigates when post-update cache invalidation fails', async () => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    const cacheError = new Error('cache failed');
    vi.spyOn(queryClient, 'invalidateQueries').mockRejectedValue(cacheError);

    renderWithProviders(<EditColoringBook />, { queryClient });

    await user.click(screen.getByRole('button', { name: 'Update book' }));

    await waitFor(() => {
      expect(updateBookMutateAsync).toHaveBeenCalledTimes(1);
      expect(notifyMock).not.toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'error',
          title: 'Could not update coloring book',
        })
      );
      expect(loggerErrorMock).toHaveBeenCalledWith(
        'Post-update coloring book cache invalidation failed',
        expect.objectContaining({
          index: expect.any(Number),
          reason: cacheError,
        })
      );
      expect(navigateMock).toHaveBeenCalledWith('/coloring/book-123');
    });
  });

  it('warns and still navigates when tag sync fails after the book updates', async () => {
    const user = userEvent.setup();
    updateBookMutateAsync.mockResolvedValue({
      book: { id: 'book-123' },
      tagSyncError: new Error('boom'),
    });

    renderWithProviders(<EditColoringBook />);

    await user.click(screen.getByRole('button', { name: 'Update book' }));

    await waitFor(() => {
      expect(updateBookMutateAsync).toHaveBeenCalledTimes(1);
      expect(notifyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'warning',
          title: "Coloring book updated, but tags didn't save",
        })
      );
      expect(navigateMock).toHaveBeenCalledWith('/coloring/book-123');
    });
  });
});
