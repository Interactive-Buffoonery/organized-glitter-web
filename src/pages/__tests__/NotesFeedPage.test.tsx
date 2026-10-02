import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import NotesFeedPage from '../NotesFeedPage';

const { useNotesFeedMock, verticalsState, addNoteCtaMock } = vi.hoisted(() => ({
  useNotesFeedMock: vi.fn(),
  addNoteCtaMock: vi.fn(),
  verticalsState: {
    diamond_painting: true,
    coloring_books: true,
    isLoading: false,
  },
}));

vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/notes/MarkdownContent', () => ({
  default: ({ content }: { content: string }) => <p>{content}</p>,
}));

vi.mock('@/components/notes-feed/AddNoteCTA', () => ({
  AddNoteCTA: (props: unknown) => {
    addNoteCtaMock(props);
    return <button type="button">Add a progress note</button>;
  },
}));

vi.mock('@/hooks/queries/useNotesFeed', () => ({
  useNotesFeed: (filters: unknown) => useNotesFeedMock(filters),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-123' } }),
}));

vi.mock('@/hooks/useEnabledVerticals', () => ({
  useEnabledVerticals: () => verticalsState,
}));

describe('NotesFeedPage', () => {
  beforeEach(() => {
    Element.prototype.hasPointerCapture ??= vi.fn(() => false);
    Element.prototype.setPointerCapture ??= vi.fn();
    Element.prototype.releasePointerCapture ??= vi.fn();
    Element.prototype.scrollIntoView ??= vi.fn();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    Object.assign(verticalsState, {
      diamond_painting: true,
      coloring_books: true,
      isLoading: false,
    });
    useNotesFeedMock.mockReset().mockReturnValue({
      data: { pages: [{ items: [] }] },
      isLoading: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });
    addNoteCtaMock.mockReset();
  });

  it('signals app readiness so the startup shell cannot cover Load more clicks', () => {
    const overlay = document.createElement('div');
    overlay.id = 'app-loading';
    document.body.appendChild(overlay);
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    renderWithProviders(<NotesFeedPage />);

    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'app-loaded' }));
  });

  it('renders the empty state and header add-note CTA', () => {
    renderWithProviders(<NotesFeedPage />);

    expect(screen.getByRole('heading', { name: 'Notes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a progress note' })).toBeInTheDocument();
    expect(addNoteCtaMock).toHaveBeenLastCalledWith({
      visibleTab: 'all',
      sourceId: 'all',
      verticals: { diamond_painting: true, coloring_books: true },
    });
    expect(
      screen.queryByText(
        /a private timeline of what you have worked on across diamond painting and coloring/i
      )
    ).not.toBeInTheDocument();
    expect(screen.getByText(/start logging progress/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        'Add a progress note to a diamond painting or coloring page, and it will show up here, also.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /find something to work on/i })).toHaveAttribute(
      'href',
      '/dashboard'
    );
  });

  it('scopes the empty state copy to the active craft filter', async () => {
    const user = userEvent.setup();

    renderWithProviders(<NotesFeedPage />);

    await user.click(screen.getByRole('tab', { name: 'Coloring Pages' }));

    expect(
      screen.getByText('Add a progress note to a coloring page, and it will show up here, also.')
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/add a progress note to a diamond painting or coloring page/i)
    ).not.toBeInTheDocument();
    expect(useNotesFeedMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ craft: 'coloring' })
    );
  });

  it('hides craft tabs and uses coloring-only copy when diamond painting is disabled', () => {
    Object.assign(verticalsState, {
      diamond_painting: false,
      coloring_books: true,
      isLoading: false,
    });

    renderWithProviders(<NotesFeedPage />);

    expect(screen.queryByRole('tab', { name: 'All' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Diamond Painting' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Coloring Pages' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Add a progress note to a coloring page, and it will show up here, also.')
    ).toBeInTheDocument();
    expect(useNotesFeedMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ craft: 'coloring' })
    );
  });

  it('hides craft tabs and uses diamond-only copy when coloring is disabled', () => {
    Object.assign(verticalsState, {
      diamond_painting: true,
      coloring_books: false,
      isLoading: false,
    });

    renderWithProviders(<NotesFeedPage />);

    expect(screen.queryByRole('tab', { name: 'All' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Diamond Painting' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Coloring Pages' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Add a progress note to a diamond painting, and it will show up here, also.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/or coloring page/i)).not.toBeInTheDocument();
    expect(useNotesFeedMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ craft: 'diamond' })
    );
  });

  it('renders unified diamond and coloring feed items', () => {
    useNotesFeedMock.mockReturnValue({
      data: {
        pages: [
          {
            items: [
              {
                id: 'coloring:note-1',
                kind: 'coloring',
                content: 'Finished the background wash.',
                date: '2026-05-10',
                createdAt: '2026-05-10T10:00:00.000Z',
                imageUrl: 'https://files.test/note-1/photo.jpg',
                source: {
                  id: 'book-1',
                  title: 'Garden Mandala',
                  subtitle: 'Page 12',
                  detailUrl: '/coloring/book-1/pages/page-1',
                },
                craftBadgeLabel: 'Coloring Book',
              },
              {
                id: 'diamond:note-2',
                kind: 'diamond',
                content: 'Worked through the lower-left corner.',
                date: '2026-05-08',
                createdAt: '2026-05-08T10:00:00.000Z',
                source: {
                  id: 'project-1',
                  title: 'Starry Night Kit',
                  subtitle: 'Craft Co',
                  detailUrl: '/projects/project-1',
                },
                craftBadgeLabel: 'Diamond Painting',
              },
            ],
          },
        ],
      },
      isLoading: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    renderWithProviders(<NotesFeedPage />);

    // Each note's project/book title is the link to its detail page.
    expect(screen.getByRole('link', { name: 'Garden Mandala' })).toHaveAttribute(
      'href',
      '/coloring/book-1/pages/page-1'
    );
    expect(screen.getByText('Finished the background wash.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Starry Night Kit' })).toHaveAttribute(
      'href',
      '/projects/project-1'
    );
    // Craft is conveyed by the timeline node, labelled for assistive tech.
    expect(screen.getByText('Coloring page note')).toBeInTheDocument();
    expect(screen.getByText('Diamond painting note')).toBeInTheDocument();
    // The month the notes fall in heads their timeline group.
    expect(screen.getByRole('heading', { name: 'May 2026' })).toBeInTheDocument();
  });

  it('updates filters and loads more notes', async () => {
    const user = userEvent.setup();
    const fetchNextPage = vi.fn();
    useNotesFeedMock.mockReturnValue({
      data: {
        pages: [
          {
            items: [
              {
                id: 'diamond:note-1',
                kind: 'diamond',
                content: 'Progress!',
                date: '2026-05-08',
                createdAt: '2026-05-08T10:00:00.000Z',
                source: { id: 'project-1', title: 'Starry Kit', detailUrl: '/projects/project-1' },
                craftBadgeLabel: 'Diamond Painting',
              },
            ],
          },
        ],
      },
      isLoading: false,
      isError: false,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage,
      refetch: vi.fn(),
    });

    renderWithProviders(<NotesFeedPage />);

    await user.click(screen.getByRole('tab', { name: 'Diamond Painting' }));
    expect(useNotesFeedMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ craft: 'diamond' })
    );

    await user.click(screen.getByRole('button', { name: /load more notes/i }));
    expect(fetchNextPage).toHaveBeenCalled();
  });

  it('resets the selected source when switching craft filters', async () => {
    const user = userEvent.setup();
    useNotesFeedMock.mockReturnValue({
      data: {
        pages: [
          {
            items: [
              {
                id: 'diamond:note-1',
                kind: 'diamond',
                content: 'Progress!',
                date: '2026-05-08',
                createdAt: '2026-05-08T10:00:00.000Z',
                source: { id: 'project-1', title: 'Starry Kit', detailUrl: '/projects/project-1' },
                craftBadgeLabel: 'Diamond Painting',
              },
            ],
          },
        ],
      },
      isLoading: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    renderWithProviders(<NotesFeedPage />);

    await user.click(screen.getByRole('combobox', { name: /filter notes by project or book/i }));
    await user.click(await screen.findByRole('option', { name: 'Starry Kit' }));

    await waitFor(() => {
      expect(useNotesFeedMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          craft: 'all',
          sourceId: 'project-1',
        })
      );
      expect(addNoteCtaMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          visibleTab: 'all',
          sourceId: 'project-1',
        })
      );
    });

    await user.click(screen.getByRole('tab', { name: 'Coloring Pages' }));

    await waitFor(() => {
      expect(useNotesFeedMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          craft: 'coloring',
          sourceId: undefined,
        })
      );
      expect(addNoteCtaMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          visibleTab: 'coloring',
          sourceId: 'all',
        })
      );
    });
  });
});
