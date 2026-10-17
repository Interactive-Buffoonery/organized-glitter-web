import '@testing-library/jest-dom/vitest';
import React from 'react';
import { within } from '@testing-library/react';
import { vi } from 'vitest';
import {
  beforeEach,
  createTestQueryClient,
  describe,
  expect,
  it,
  renderWithProviders,
  userEvent,
  waitFor,
} from '@/test-utils';
import {
  findOwnedDialog,
  openControlledPopup,
  pasteIntoField,
  typeIntoField,
} from '@/test-utils/scopedInteractions';

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
    const view = renderWithProviders(<EditColoringBook />);

    expect(view.container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(document.title).toBe('Edit coloring book | Organized Glitter');

    bookState.isLoading = false;
    bookState.data = null as never;
    view.rerender(<EditColoringBook />);

    expect(
      within(view.container).getByRole('heading', { name: 'Coloring book not found' })
    ).toBeInTheDocument();
    expect(document.title).toBe('Coloring book not found | Organized Glitter');
  });

  it('renders the edit header', () => {
    const view = renderWithProviders(<EditColoringBook />);
    const form = within(view.container);

    expect(form.getByRole('heading', { name: 'Edit book' })).toBeInTheDocument();
    expect(document.title).toBe('Edit Worlds of Wonder | Organized Glitter');
  });

  it('updates a coloring book and persists total pages', async () => {
    const user = userEvent.setup();

    const view = renderWithProviders(<EditColoringBook />);
    const form = within(view.container);

    await user.clear(form.getByLabelText(/Title/));
    await pasteIntoField(user, form.getByLabelText(/Title/), 'Updated Worlds');
    await user.clear(form.getByLabelText(/Number of pages/));
    await typeIntoField(user, form.getByLabelText(/Number of pages/), '120');
    await user.click(form.getByRole('button', { name: 'Update book' }));

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
    const view = renderWithProviders(<EditColoringBook />);
    const form = within(view.container);

    await user.clear(form.getByLabelText(/Title/));
    await pasteIntoField(user, form.getByLabelText(/Title/), 'Updated Worlds');
    await user.click(form.getByRole('button', { name: 'Update book' }));

    await waitFor(() => expect(updateBookMutateAsync).toHaveBeenCalledTimes(1));
    expect(updateBookMutateAsync.mock.calls[0][0].patch).not.toHaveProperty('total_pages');
    expect(navigateMock).toHaveBeenCalledWith('/coloring/book-123');
  });

  it('adds an inline illustrator without submitting the edit form', async () => {
    const user = userEvent.setup();
    createIllustratorMutateAsync.mockResolvedValue({ id: 'ill-new', name: 'Pat Lee' });

    const view = renderWithProviders(<EditColoringBook />);
    const form = within(view.container);

    const addIllustrator = form.getByRole('button', { name: 'Add illustrator' });
    await user.click(addIllustrator);
    const createDialog = await findOwnedDialog(addIllustrator, 'Add illustrator');
    await pasteIntoField(user, createDialog.getByLabelText('Name'), 'Pat Lee');
    await user.click(createDialog.getByRole('button', { name: 'Create' }));

    expect(await form.findByText('Pat Lee')).toBeVisible();
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

    const view = renderWithProviders(<EditColoringBook />);
    const form = within(view.container);

    await user.click(form.getByRole('button', { name: 'Remove cover image' }));
    await user.click(form.getByRole('button', { name: 'Update book' }));

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

    const view = renderWithProviders(<EditColoringBook />);
    const form = within(view.container);

    const formats = await openControlledPopup(user, form.getByLabelText('Format'));

    expect(formats.getByRole('option', { name: 'Softcover' })).toBeInTheDocument();
    expect(formats.getByRole('option', { name: 'Hardcover' })).toBeInTheDocument();
    expect(formats.queryByRole('option', { name: 'Physical book' })).not.toBeInTheDocument();

    await user.click(formats.getByRole('option', { name: 'Hardcover' }));
    await user.click(form.getByRole('button', { name: 'Update book' }));

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

  describe('explicit clear values for existing optional metadata', () => {
    const populatedBook = () => ({
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
    });
    const unchangedPatch = {
      title: 'Worlds of Wonder',
      status: 'purchased',
      is_mystery: false,
      series: 'Worlds',
      theme: 'Fantasy',
      isbn: '9781234567890',
      publication_year: 2024,
      edition: 'First',
      source_url: 'https://example.com/book',
      date_purchased: '2026-01-02',
      date_received: '2026-01-03',
      date_started: '2026-01-04',
      date_completed: '2026-01-05',
      notes: 'Keep this note',
      book_format: 'paperback',
      language: 'english',
      publisher: 'pub-1',
      illustrator: 'ill-1',
    };

    async function expectSingleUpdate(patch: Record<string, unknown>) {
      await waitFor(() => expect(updateBookMutateAsync).toHaveBeenCalledTimes(1));
      const [update] = updateBookMutateAsync.mock.calls[0];
      expect(update).toEqual({
        bookId: 'book-123',
        patch,
        expectedRevision: 0,
        onConfirmedSave: expect.any(Function),
      });
      expect(update.tagIds).toBeUndefined();
      expect(update.patch).not.toHaveProperty('total_pages');
    }

    async function clearFields(labels: string[]) {
      const user = userEvent.setup();
      bookState.data = populatedBook();

      const view = renderWithProviders(<EditColoringBook />);
      const form = within(view.container);

      for (const label of labels) {
        await user.clear(form.getByLabelText(label));
      }
      await user.click(form.getByRole('button', { name: 'Update book' }));
    }

    it('submits empty text fields', async () => {
      await clearFields([
        'Series',
        'Theme',
        'ISBN',
        'Publication year',
        'Edition',
        'Source URL',
        'Notes',
      ]);

      await expectSingleUpdate({
        ...unchangedPatch,
        series: '',
        theme: '',
        isbn: '',
        publication_year: 0,
        edition: '',
        source_url: '',
        notes: '',
      });
    });

    it('submits empty date fields', async () => {
      await clearFields(['Purchased', 'Received', 'Started', 'Completed']);

      await expectSingleUpdate({
        ...unchangedPatch,
        date_purchased: '',
        date_received: '',
        date_started: '',
        date_completed: '',
      });
    });

    it('submits empty dropdown selections', async () => {
      const user = userEvent.setup();
      bookState.data = populatedBook();

      const view = renderWithProviders(<EditColoringBook />);
      const form = within(view.container);

      for (const [label, option] of [
        ['Format', 'No format'],
        ['Publisher', 'No publisher'],
        ['Illustrator', 'No illustrator'],
        ['Language', 'No language'],
      ]) {
        const options = await openControlledPopup(user, form.getByLabelText(label));
        await user.click(options.getByRole('option', { name: option }));
      }
      await user.click(form.getByRole('button', { name: 'Update book' }));

      await expectSingleUpdate({
        ...unchangedPatch,
        book_format: '',
        language: '',
        publisher: '',
        illustrator: '',
      });
    });
  });

  it('syncs selected coloring tags after updating the book', async () => {
    const user = userEvent.setup();

    const view = renderWithProviders(<EditColoringBook />);
    const form = within(view.container);

    const tags = await openControlledPopup(user, form.getByRole('button', { name: 'Add tag' }));
    await user.click(await tags.findByRole('option', { name: 'Cozy' }));
    await user.click(form.getByRole('button', { name: 'Update book' }));

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

    const view = renderWithProviders(<EditColoringBook />);
    const form = within(view.container);

    await user.click(form.getByRole('button', { name: 'Update book' }));

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
    const view = renderWithProviders(<EditColoringBook />);
    const form = within(view.container);

    await user.click(form.getByRole('button', { name: 'Update book' }));
    await user.click(form.getByRole('button', { name: 'Keep my edits for a new save' }));
    useParamsMock.mockReturnValue({ id: 'book-456' });
    bookState.data = { ...bookState.data, id: 'book-456', title: 'Second book', revision: 0 };
    view.rerender(<EditColoringBook />);
    releaseRefetch({ isError: false, data: { id: 'book-123', userId: 'user-123', revision: 7 } });

    await waitFor(() => expect(form.getByLabelText(/Title/)).toHaveValue('Second book'));
    await user.click(form.getByRole('button', { name: 'Update book' }));
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
    const view = renderWithProviders(<EditColoringBook />);
    const form = within(view.container);
    await user.click(form.getByRole('button', { name: 'Update book' }));
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

    const view = renderWithProviders(<EditColoringBook />, { queryClient });
    const form = within(view.container);

    await user.click(form.getByRole('button', { name: 'Update book' }));

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

    const view = renderWithProviders(<EditColoringBook />);
    const form = within(view.container);

    await user.click(form.getByRole('button', { name: 'Update book' }));

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
