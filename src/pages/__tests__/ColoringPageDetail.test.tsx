import '@testing-library/jest-dom/vitest';
import React from 'react';
import { vi } from 'vitest';
import {
  beforeEach,
  describe,
  expect,
  it,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from '@/test-utils';

const {
  useParamsMock,
  updatePageHookMock,
  updatePageMock,
  notifyMock,
  useColoringPageMock,
  bookMock,
  pageMock,
  pagesItemsMock,
  mediumItemsMock,
  isMediumsLoadingMock,
  pagesErrorMock,
  pagesHasDataMock,
  pagesRefetchMock,
} = vi.hoisted(() => ({
  useParamsMock: vi.fn(() => ({ bookId: 'book-123', pageId: 'page-123' })),
  updatePageHookMock: vi.fn(),
  updatePageMock: vi.fn(),
  notifyMock: vi.fn(),
  useColoringPageMock: vi.fn(),
  bookMock: {
    id: 'book-123',
    userId: 'user-123',
    title: 'Mystery Worlds',
    publisherId: '',
    illustratorId: '',
    series: '',
    theme: '',
    isbn: '',
    coverImage: '',
    isMystery: true,
    status: 'purchased',
    totalPages: 48,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  pageMock: {
    id: 'page-123',
    bookId: 'book-123',
    pageNumber: 7,
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
  pagesItemsMock: [] as Array<{
    id: string;
    pageNumber: number;
  }>,
  mediumItemsMock: [] as Array<{
    id: string;
    name: string;
    type: string;
    brand: string;
    colorCount: number | undefined;
    notes: string;
  }>,
  isMediumsLoadingMock: { current: false },
  pagesErrorMock: { current: null as unknown },
  pagesHasDataMock: { current: true },
  pagesRefetchMock: vi.fn(),
}));

vi.mock('@/components/coloring/detail/page/ColorReferenceSection', () => ({
  ColorReferenceSection: () => null,
}));

vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useParams: () => useParamsMock(),
  };
});

vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="main-layout">{children}</div>
  ),
}));

vi.mock('@/components/image/ImageCropDialog', () => ({
  ImageCropDialog: ({
    open,
    onCropComplete,
  }: {
    open: boolean;
    onCropComplete: (file: File) => void;
  }) =>
    open ? (
      <dialog open aria-label="Frame coloring page photo">
        <button
          type="button"
          onClick={() =>
            onCropComplete(new File(['cropped'], 'page-photo-cropped.jpg', { type: 'image/jpeg' }))
          }
        >
          Use crop
        </button>
      </dialog>
    ) : null,
}));

vi.mock('@/components/coloring/ColoringPageProgressNotes', () => ({
  ColoringPageProgressNotes: ({ pageId }: { pageId: string }) => (
    <section aria-label="Coloring page progress notes">Progress timeline for {pageId}</section>
  ),
}));

vi.mock('@/components/projects/ImageGallery', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-123' } }),
}));

vi.mock('@/hooks/useUserTimezone', () => ({
  useUserTimezone: () => 'UTC',
}));

vi.mock('@/lib/notifications', () => ({
  notify: notifyMock,
}));

vi.mock('@/hooks/queries/coloring/useColoringBook', () => ({
  useColoringBook: () => ({
    isLoading: false,
    data: bookMock,
  }),
}));

vi.mock('@/hooks/queries/coloring/useColoringPage', () => ({
  useColoringPage: () => useColoringPageMock(),
}));

vi.mock('@/hooks/queries/coloring/useColoringPages', () => ({
  useColoringPages: () => ({
    isLoading: false,
    data: pagesHasDataMock.current ? { items: pagesItemsMock } : undefined,
    isError: Boolean(pagesErrorMock.current),
    error: pagesErrorMock.current,
    isFetching: false,
    refetch: pagesRefetchMock,
  }),
}));

vi.mock('@/hooks/queries/coloring/useColoringMediums', () => ({
  useColoringMediums: () => ({
    isLoading: isMediumsLoadingMock.current,
    data: { items: mediumItemsMock },
  }),
}));

vi.mock('@/hooks/mutations/coloring/useUpdateColoringPage', () => ({
  useUpdateColoringPage: () => updatePageHookMock(),
}));

vi.mock('@/services/pocketbase/coloring.service', () => ({
  ColoringService: {
    getPagePhotoUrls: (page: { id: string; photos: string[] }) =>
      page.photos.map(photo => `/page-files/${page.id}/${photo}`),
    getCoverImageUrl: (book: { id: string; coverImage?: string }, size?: string) =>
      book.coverImage ? `/book-files/${book.id}/${size ?? 'original'}/${book.coverImage}` : '',
  },
}));

import ColoringPageDetail from '../ColoringPageDetail';

function mockUpdatePageHooks(
  states: Partial<Record<'status' | 'dates' | 'photos' | 'mediums' | 'reveal', boolean>> = {}
) {
  const isPending = Object.values(states).some(Boolean);
  updatePageHookMock.mockImplementation(() => {
    return { mutateAsync: updatePageMock, isPending };
  });
}

describe('ColoringPageDetail page', () => {
  beforeEach(() => {
    useParamsMock.mockReset().mockReturnValue({ bookId: 'book-123', pageId: 'page-123' });
    Element.prototype.hasPointerCapture ??= vi.fn(() => false);
    Element.prototype.setPointerCapture ??= vi.fn();
    Element.prototype.releasePointerCapture ??= vi.fn();
    Element.prototype.scrollIntoView ??= vi.fn();
    updatePageHookMock.mockReset();
    updatePageMock.mockReset().mockResolvedValue({});
    mockUpdatePageHooks();
    notifyMock.mockReset();
    useColoringPageMock.mockReset().mockReturnValue({
      isLoading: false,
      data: pageMock,
    });
    bookMock.isMystery = true;
    pageMock.status = 'not_started';
    pageMock.photos = [];
    pageMock.mediumIds = [];
    pageMock.revealedSubject = '';
    pageMock.revealedAt = '';
    pageMock.startedAt = '';
    pageMock.completedAt = '';
    pagesItemsMock.splice(0);
    mediumItemsMock.splice(0);
    isMediumsLoadingMock.current = false;
    pagesErrorMock.current = null;
    pagesHasDataMock.current = true;
    pagesRefetchMock.mockReset().mockResolvedValue({ isError: false });
  });

  it('reveals mystery pages inline without offering a discarded note field', async () => {
    const user = userEvent.setup();

    renderWithProviders(<ColoringPageDetail />);

    await user.click(screen.getByRole('button', { name: /^reveal$/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/revealed subject/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/note about this reveal/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/revealed subject/i), 'Dragon');
    await user.click(screen.getByRole('button', { name: /save reveal/i }));

    await waitFor(() => {
      expect(updatePageMock).toHaveBeenCalledWith({
        pageId: 'page-123',
        command: {
          type: 'reveal-mystery',
          revealedSubject: 'Dragon',
          revealedAt: expect.any(String),
        },
      });
    });
  });

  it('does not show reveal controls for non-mystery books', () => {
    bookMock.isMystery = false;

    renderWithProviders(<ColoringPageDetail />);

    expect(screen.queryByRole('button', { name: /^reveal$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/what did the mystery turn out to be/i)).not.toBeInTheDocument();
  });

  it('marks a revealed mystery page as unrevealed', async () => {
    const user = userEvent.setup();
    pageMock.revealedSubject = 'Dragon';
    pageMock.revealedAt = '2026-05-17T16:20:00.000Z';

    renderWithProviders(<ColoringPageDetail />);

    await user.click(screen.getByRole('button', { name: /mark unrevealed/i }));

    await waitFor(() => {
      expect(updatePageMock).toHaveBeenCalledWith({
        pageId: 'page-123',
        command: { type: 'clear-mystery-reveal' },
      });
    });
  });

  it('renders a progress-note timeline instead of a single page note editor', () => {
    renderWithProviders(<ColoringPageDetail />);

    expect(document.title).toBe('Page 7 in Mystery Worlds | Organized Glitter');
    expect(screen.getByLabelText('Coloring page progress notes')).toHaveTextContent(
      'Progress timeline for page-123'
    );
    expect(screen.queryByLabelText('Coloring page notes')).not.toBeInTheDocument();
  });

  it('renders a loading state while the coloring page is loading', () => {
    useColoringPageMock.mockReturnValue({
      isLoading: true,
      data: undefined,
    });

    renderWithProviders(<ColoringPageDetail />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading coloring page');
    expect(document.title).toBe('Coloring page details | Organized Glitter');
  });

  it('sets a not-found title when the coloring page is missing', () => {
    useColoringPageMock.mockReturnValue({
      isLoading: false,
      data: null,
      error: { type: 'not_found', message: 'Missing page', retryable: false },
    });

    renderWithProviders(<ColoringPageDetail />);

    expect(screen.getByRole('heading', { name: 'Coloring page not found' })).toBeInTheDocument();
    expect(document.title).toBe('Coloring page not found | Organized Glitter');
  });

  it('keeps cached page details visible with an in-place retry after a server failure', async () => {
    const refetch = vi.fn();
    useColoringPageMock.mockReturnValue({
      isLoading: false,
      isError: true,
      data: pageMock,
      error: { type: 'server', message: 'Unavailable', retryable: true },
      refetch,
    });

    renderWithProviders(<ColoringPageDetail />);

    expect(screen.getByRole('heading', { name: 'Page 7' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not refresh coloring page');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('keeps cached page details without retry after a validation failure', () => {
    useColoringPageMock.mockReturnValue({
      isLoading: false,
      isError: true,
      data: pageMock,
      error: { type: 'validation', message: 'Invalid page', retryable: false },
    });

    renderWithProviders(<ColoringPageDetail />);

    expect(screen.getByRole('heading', { name: 'Page 7' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not refresh coloring page');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('does not show cached page data after a permission failure', () => {
    useColoringPageMock.mockReturnValue({
      isLoading: false,
      isError: true,
      data: pageMock,
      error: { type: 'permission', message: 'No access', retryable: false },
    });

    renderWithProviders(<ColoringPageDetail />);

    expect(
      screen.getByRole('heading', { name: 'You cannot view this coloring page' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Page 7' })).not.toBeInTheDocument();
  });

  it.each(['auth', 'permission', 'not_found'])(
    'hides cached page details after a %s page-list denial',
    type => {
      pageMock.photos = ['private.jpg'];
      pagesItemsMock.push(
        { id: 'page-122', pageNumber: 6 },
        { id: 'page-123', pageNumber: 7 },
        { id: 'page-124', pageNumber: 8 }
      );
      pagesErrorMock.current = { type, message: 'Access denied', retryable: false };
      const returnTo = '/dashboard?craft=coloring&status=wishlist&page=3';

      renderWithProviders(<ColoringPageDetail />, {
        initialRoute: `/coloring/book-123/pages/page-123?returnTo=${encodeURIComponent(returnTo)}`,
      });

      expect(screen.getByRole('heading', { name: /coloring page/i })).toBeVisible();
      expect(screen.queryByRole('heading', { name: 'Page 7' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: /previous coloring page/i })
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /next coloring page/i })).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Coloring page progress notes')).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Back to book' })).toHaveAttribute(
        'href',
        `/coloring/book-123?returnTo=${encodeURIComponent(returnTo)}`
      );
      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    }
  );

  it('shows a retry notice when page navigation fails without hiding the page', async () => {
    pagesErrorMock.current = { type: 'network', message: 'Offline', retryable: true };

    renderWithProviders(<ColoringPageDetail />);

    expect(screen.getByRole('heading', { name: 'Page 7' })).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not refresh page navigation');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(pagesRefetchMock).toHaveBeenCalledOnce();
  });

  it('does not retry a non-retryable page-navigation failure', () => {
    pagesErrorMock.current = { type: 'validation', message: 'Invalid list', retryable: false };

    renderWithProviders(<ColoringPageDetail />);

    expect(screen.getByRole('heading', { name: 'Page 7' })).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not refresh page navigation');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('explains missing navigation after an initial page-list failure', async () => {
    pagesHasDataMock.current = false;
    pagesErrorMock.current = { type: 'network', message: 'Offline', retryable: true };

    renderWithProviders(<ColoringPageDetail />);

    expect(screen.getByRole('heading', { name: 'Page 7' })).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load page navigation');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(pagesRefetchMock).toHaveBeenCalledOnce();
  });

  it('updates page status from the dropdown', async () => {
    const user = userEvent.setup();

    renderWithProviders(<ColoringPageDetail />);

    expect(screen.getAllByRole('combobox', { name: /change page status/i })).toHaveLength(1);

    await user.click(screen.getByRole('combobox', { name: /change page status/i }));
    await user.click(screen.getByRole('option', { name: /in progress/i }));

    await waitFor(() => {
      expect(updatePageMock).toHaveBeenCalledWith({
        pageId: 'page-123',
        command: { type: 'set-status', status: 'in_progress' },
      });
    });
  });

  it('renders manual started and completed date controls', () => {
    pageMock.startedAt = '2026-04-01';
    pageMock.completedAt = '2026-04-27';

    renderWithProviders(<ColoringPageDetail />);

    expect(screen.getByRole('heading', { name: /dates/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^started$/i)).toHaveValue('2026-04-01');
    expect(screen.getByLabelText(/^completed$/i)).toHaveValue('2026-04-27');
  });

  it('saves a manual started date', async () => {
    const user = userEvent.setup();

    renderWithProviders(<ColoringPageDetail />);

    await user.type(screen.getByLabelText(/^started$/i), '2026-04-01');
    await user.click(screen.getAllByRole('button', { name: /^save$/i })[0]);

    await waitFor(() => {
      expect(updatePageMock).toHaveBeenCalledWith({
        pageId: 'page-123',
        command: { type: 'set-started-date', startedAt: '2026-04-01' },
      });
    });
  });

  it('saves a manual completed date', async () => {
    const user = userEvent.setup();

    renderWithProviders(<ColoringPageDetail />);

    await user.type(screen.getByLabelText(/^completed$/i), '2026-04-27');
    await user.click(screen.getAllByRole('button', { name: /^save$/i })[1]);

    await waitFor(() => {
      expect(updatePageMock).toHaveBeenCalledWith({
        pageId: 'page-123',
        command: { type: 'set-completed-date', completedAt: '2026-04-27' },
      });
    });
  });

  it('rejects a completed date before the started date', async () => {
    const user = userEvent.setup();
    pageMock.startedAt = '2026-04-10';

    renderWithProviders(<ColoringPageDetail />);

    await user.type(screen.getByLabelText(/^completed$/i), '2026-04-01');
    await user.click(screen.getAllByRole('button', { name: /^save$/i })[1]);

    expect(updatePageMock).not.toHaveBeenCalled();
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'error',
        title: 'Date range is not possible',
      })
    );
  });

  it('clears an existing lifecycle date', async () => {
    const user = userEvent.setup();
    pageMock.startedAt = '2026-04-01';

    renderWithProviders(<ColoringPageDetail />);

    await user.click(screen.getByRole('button', { name: /^clear$/i }));

    await waitFor(() => {
      expect(updatePageMock).toHaveBeenCalledWith({
        pageId: 'page-123',
        command: { type: 'set-started-date', startedAt: '' },
      });
    });
  });

  it('saves selected coloring mediums without touching status', async () => {
    const user = userEvent.setup();
    mediumItemsMock.push({
      id: 'medium-1',
      name: 'Prismacolor',
      type: 'colored_pencil',
      brand: 'Prismacolor',
      colorCount: 72,
      notes: '',
    });

    renderWithProviders(<ColoringPageDetail />);

    await user.click(screen.getByRole('button', { name: /prismacolor/i }));

    await waitFor(() => {
      expect(updatePageMock).toHaveBeenCalledWith({
        pageId: 'page-123',
        command: { type: 'set-mediums', mediumIds: ['medium-1'] },
      });
    });
  });

  it('shares pending state across page command controls', async () => {
    mockUpdatePageHooks({ mediums: true });
    mediumItemsMock.push({
      id: 'medium-1',
      name: 'Prismacolor',
      type: 'colored_pencil',
      brand: 'Prismacolor',
      colorCount: 72,
      notes: '',
    });

    renderWithProviders(<ColoringPageDetail />);

    expect(screen.getByRole('button', { name: /prismacolor/i })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: /^reveal$/i }));
    await userEvent.type(screen.getByLabelText(/revealed subject/i), 'Dragon');

    expect(screen.getByRole('button', { name: /save reveal/i })).toBeDisabled();
  });

  it('lets non-main photos become the main image', async () => {
    const user = userEvent.setup();
    pageMock.photos = ['main.jpg', 'detail.jpg', 'extra.jpg'];

    renderWithProviders(<ColoringPageDetail />);

    expect(screen.getByRole('heading', { name: /manage photos/i })).toBeInTheDocument();
    expect(screen.getByText('Main image')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /set photo \d as main image/i })).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: /set photo 2 as main image/i }));

    await waitFor(() => {
      expect(updatePageMock).toHaveBeenCalledWith({
        pageId: 'page-123',
        command: {
          type: 'set-main-photo',
          filename: 'detail.jpg',
        },
      });
    });
  });

  it('routes new page photos through the crop dialog before upload', async () => {
    const user = userEvent.setup();

    renderWithProviders(<ColoringPageDetail />);

    const input = screen.getByLabelText(/add page photos/i);
    await user.upload(input, new File(['raw'], 'raw-page.png', { type: 'image/png' }));

    expect(screen.getByRole('dialog', { name: /frame coloring page photo/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /use crop/i }));

    await waitFor(() => {
      expect(updatePageMock).toHaveBeenCalledWith({
        pageId: 'page-123',
        command: {
          type: 'add-photos',
          files: [expect.objectContaining({ name: 'page-photo-cropped.jpg' })],
        },
      });
    });
  });

  it('keeps photo upload controls keyboard-operable by accessible name', () => {
    renderWithProviders(<ColoringPageDetail />);

    expect(screen.getByLabelText(/add page photos/i)).toBeInTheDocument();
  });

  it('adds descriptive accessible names to neighboring page links', () => {
    pagesItemsMock.push(
      { id: 'page-122', pageNumber: 6 },
      { id: 'page-123', pageNumber: 7 },
      { id: 'page-124', pageNumber: 8 }
    );

    renderWithProviders(<ColoringPageDetail />);

    expect(screen.getByRole('link', { name: /previous coloring page, page 6/i })).toHaveAttribute(
      'href',
      '/coloring/book-123/pages/page-122?returnTo=%2Fdashboard%3Fcraft%3Dcoloring'
    );
    expect(screen.getByRole('link', { name: /next coloring page, page 8/i })).toHaveAttribute(
      'href',
      '/coloring/book-123/pages/page-124?returnTo=%2Fdashboard%3Fcraft%3Dcoloring'
    );
  });

  it('announces medium loading state as a status message', () => {
    isMediumsLoadingMock.current = true;

    renderWithProviders(<ColoringPageDetail />);

    expect(screen.getByRole('status')).toHaveTextContent(/loading mediums/i);
  });

  it('deletes the selected photo without changing the others', async () => {
    const user = userEvent.setup();
    pageMock.photos = ['main.jpg', 'detail.jpg', 'extra.jpg'];

    renderWithProviders(<ColoringPageDetail />);

    await user.click(screen.getByRole('button', { name: /delete photo 2/i }));
    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => {
      expect(updatePageMock).toHaveBeenCalledWith({
        pageId: 'page-123',
        command: {
          type: 'delete-photo',
          filename: 'detail.jpg',
        },
      });
    });
  });
});
