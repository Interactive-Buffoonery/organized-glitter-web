import {
  act,
  beforeEach,
  describe,
  expect,
  it,
  renderHookWithProviders,
  waitFor,
} from '@/test-utils';
import { vi } from 'vitest';
import { useNotesFeed } from '../useNotesFeed';

const { mockUser, mockListNotesFeedForUser } = vi.hoisted(() => ({
  mockUser: { current: undefined as undefined | { id: string } },
  mockListNotesFeedForUser: vi.fn(),
}));

const emptyPage = (page = 1) => ({
  page,
  perPage: 30,
  totalItems: 0,
  totalPages: 1,
  totalsAreSnapshot: false,
  items: [],
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser.current }),
}));

vi.mock('@/lib/pocketbase', () => ({
  getFileUrl: ({ id, collectionName }: { id: string; collectionName: string }, filename: string) =>
    `https://files.test/${collectionName}/${id}/${filename}`,
}));

vi.mock('@/services/pocketbase/notesFeed.service', () => ({
  NotesFeedService: {
    listForUser: mockListNotesFeedForUser,
  },
}));

describe('useNotesFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.current = { id: 'user-123' };
    mockListNotesFeedForUser.mockResolvedValue(emptyPage());
  });

  it('does not fetch without an authenticated user', () => {
    mockUser.current = undefined;

    const { result } = renderHookWithProviders(() => useNotesFeed());

    expect(result.current.isFetching).toBe(false);
    expect(mockListNotesFeedForUser).not.toHaveBeenCalled();
  });

  it('fetches the first page with feed filters through the notes feed service', async () => {
    const { result } = renderHookWithProviders(() =>
      useNotesFeed({ sourceId: 'source-123', year: 2026, hasImage: true })
    );

    await waitFor(() => expect(result.current.data?.pages[0].items).toEqual([]));
    expect(mockListNotesFeedForUser).toHaveBeenCalledWith({
      userId: 'user-123',
      page: 1,
      craft: undefined,
      sourceId: 'source-123',
      projectId: undefined,
      year: 2026,
      hasImage: true,
    });
  });

  it('adds UI route details to normalized notes feed items', async () => {
    mockListNotesFeedForUser.mockResolvedValue({
      ...emptyPage(),
      totalItems: 2,
      items: [
        {
          id: 'diamond:diamond-note',
          craft: 'diamond',
          content: 'Diamond note',
          date: '2026-05-10',
          createdAt: '2026-05-10T10:00:00.000Z',
          source: { id: 'project-1', title: 'Starry kit', subtitle: 'Craft Co' },
        },
        {
          id: 'coloring:coloring-note',
          craft: 'coloring',
          content: 'Coloring note',
          date: '2026-05-08',
          createdAt: '2026-05-08T10:00:00.000Z',
          imageFile: {
            collectionName: 'coloring_page_progress_notes',
            recordId: 'coloring-note',
            filename: 'note.jpg',
          },
          source: { id: 'book-1', title: 'Garden book', pageId: 'page-1' },
        },
      ],
    });

    const { result } = renderHookWithProviders(() => useNotesFeed());

    await waitFor(() => expect(result.current.data?.pages[0].items).toHaveLength(2));
    expect(result.current.data?.pages[0].items.map(item => item.id)).toEqual([
      'diamond:diamond-note',
      'coloring:coloring-note',
    ]);
    expect(result.current.data?.pages[0].items[1]).toMatchObject({
      kind: 'coloring',
      craftBadgeLabel: 'Coloring Book',
      imageUrl: 'https://files.test/coloring_page_progress_notes/coloring-note/note.jpg',
      source: { title: 'Garden book', detailUrl: '/coloring/book-1/pages/page-1' },
    });
  });

  it('refetches when feed filters change', async () => {
    let filters = { year: 2026 };

    const { rerender } = renderHookWithProviders(() => useNotesFeed(filters));

    await waitFor(() => {
      expect(mockListNotesFeedForUser).toHaveBeenCalledWith({
        userId: 'user-123',
        page: 1,
        craft: undefined,
        sourceId: undefined,
        projectId: undefined,
        year: 2026,
        hasImage: undefined,
      });
    });

    filters = { year: 2025 };
    rerender();

    await waitFor(() => {
      expect(mockListNotesFeedForUser).toHaveBeenCalledWith({
        userId: 'user-123',
        page: 1,
        craft: undefined,
        sourceId: undefined,
        projectId: undefined,
        year: 2025,
        hasImage: undefined,
      });
    });
    expect(mockListNotesFeedForUser).toHaveBeenCalledTimes(2);
  });

  it('uses a separate query key when switching from all notes to coloring notes', async () => {
    let filters = { craft: 'all' as const };

    const { rerender } = renderHookWithProviders(() => useNotesFeed(filters));

    await waitFor(() => {
      expect(mockListNotesFeedForUser).toHaveBeenCalledWith({
        userId: 'user-123',
        page: 1,
        craft: 'all',
        sourceId: undefined,
        projectId: undefined,
        year: undefined,
        hasImage: undefined,
      });
    });

    vi.clearAllMocks();
    mockListNotesFeedForUser.mockResolvedValue(emptyPage());
    filters = { craft: 'coloring' };
    rerender();

    await waitFor(() => {
      expect(mockListNotesFeedForUser).toHaveBeenCalledWith({
        userId: 'user-123',
        page: 1,
        craft: 'coloring',
        sourceId: undefined,
        projectId: undefined,
        year: undefined,
        hasImage: undefined,
      });
    });
  });

  it('passes the merged continuation when fetching the next page', async () => {
    const continuation = {
      sources: {
        diamond: {
          buffer: [],
          isExhausted: false,
          totalItems: 30,
          hasLoaded: true,
        },
        coloring: {
          buffer: [],
          isExhausted: true,
          totalItems: 15,
          hasLoaded: true,
        },
      },
    };
    mockListNotesFeedForUser.mockImplementation(async ({ page }: { page: number }) => ({
      ...emptyPage(page),
      totalItems: 45,
      totalPages: 2,
      totalsAreSnapshot: true,
      nextContinuation: page === 1 ? continuation : undefined,
    }));

    const { result } = renderHookWithProviders(() => useNotesFeed({ year: 2026 }));

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.data?.pages.every(page => page.totalsAreSnapshot)).toBe(true);
    expect(mockListNotesFeedForUser).toHaveBeenNthCalledWith(2, {
      userId: 'user-123',
      page: 2,
      craft: undefined,
      sourceId: undefined,
      projectId: undefined,
      year: 2026,
      hasImage: undefined,
      continuation,
    });
    expect(result.current.hasNextPage).toBe(false);
  });

  it('does not expose a next page when the first page is the last page', async () => {
    const { result } = renderHookWithProviders(() => useNotesFeed());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });
});
