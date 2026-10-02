import { beforeEach, describe, expect, it, vi } from 'vitest';

const pbMock = vi.hoisted(() => {
  const createListResult = (items: unknown[] = [], totalItems?: number) => ({
    page: 1,
    perPage: Math.max(items.length, 1),
    totalItems: totalItems ?? items.length,
    totalPages: items.length > 0 ? 1 : 0,
    items,
  });

  const collections = {
    projects: {
      getFullList: vi.fn(),
      getList: vi.fn(),
    },
    coloring_books: {
      getFullList: vi.fn(),
    },
    coloring_pages: {
      getFullList: vi.fn(),
      getList: vi.fn(),
    },
  };

  return {
    pb: {
      collection: vi.fn((name: keyof typeof collections) => collections[name]),
      filter: vi.fn((expr: string, params?: Record<string, unknown>) => {
        if (!params) return expr;
        let result = expr;
        for (const [key, value] of Object.entries(params)) {
          result = result.replaceAll(`{:${key}}`, String(value));
        }
        return result;
      }),
    },
    collections,
    createListResult,
    reset: () => {
      Object.values(collections).forEach(collection => {
        Object.values(collection).forEach(method => method.mockReset());
      });
      collections.projects.getFullList.mockResolvedValue([]);
      collections.projects.getList.mockResolvedValue(createListResult());
      collections.coloring_books.getFullList.mockResolvedValue([]);
      collections.coloring_pages.getFullList.mockResolvedValue([]);
      collections.coloring_pages.getList.mockResolvedValue(createListResult());
    },
  };
});

const notesFeedMock = vi.hoisted(() => ({
  listLatestByTargets: vi.fn(),
}));

vi.mock('@/lib/pocketbase', () => ({
  pb: pbMock.pb,
  resolveFileUrl: (collection: string, id: string, filename: string, thumb?: string) =>
    `${collection}/${id}/${filename}${thumb ? `?thumb=${thumb}` : ''}`,
}));

vi.mock('@/services/pocketbase/notesFeed.service', () => ({
  NotesFeedService: notesFeedMock,
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    criticalError: vi.fn(),
  }),
}));

import { OverviewService } from '../overview.service';

const projectRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'project-1',
  user: 'user-1',
  title: 'Moonlit Greenhouse',
  image: 'greenhouse.jpg',
  status: 'progress',
  company: 'company-1',
  artist: 'artist-1',
  created: '2026-04-01T00:00:00.000Z',
  updated: '2026-04-20T00:00:00.000Z',
  expand: {
    company: { name: 'Starshine Studio' },
    artist: { name: 'Lena Vale' },
  },
  ...overrides,
});

const bookRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'book-1',
  user: 'user-1',
  title: 'Mythical Botanicals',
  publisher: 'publisher-1',
  illustrator: 'illustrator-1',
  series: '',
  theme: '',
  isbn: '',
  cover_image: 'cover.jpg',
  is_mystery: false,
  status: 'in_progress',
  total_pages: 50,
  completed_pages: 18,
  completion_percentage: 36,
  last_activity_at: '2026-04-24T00:00:00.000Z',
  created: '2026-04-01T00:00:00.000Z',
  updated: '2026-04-24T00:00:00.000Z',
  expand: {
    publisher: { name: 'Prism Press' },
    illustrator: { name: 'Ari Morrow' },
  },
  ...overrides,
});

const pageRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'page-1',
  book: 'book-1',
  page_number: 12,
  status: 'in_progress',
  notes: '',
  photos: ['page.jpg'],
  revealed_subject: '',
  revealed_at: '',
  started_at: '',
  completed_at: '',
  created: '2026-04-01T00:00:00.000Z',
  updated: '2026-04-26T00:00:00.000Z',
  expand: {
    book: bookRecord({
      title: 'Woodland Windows',
      completion_percentage: 42,
      cover_image: 'woodland-cover.jpg',
    }),
  },
  ...overrides,
});

describe('OverviewService', () => {
  beforeEach(() => {
    pbMock.reset();
    notesFeedMock.listLatestByTargets.mockReset();
    notesFeedMock.listLatestByTargets.mockResolvedValue({});
  });

  it('normalizes diamond progress projects into feed items', async () => {
    pbMock.collections.projects.getFullList.mockResolvedValue([projectRecord()]);

    const result = await OverviewService.getOverviewData('user-1');

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'project-1',
          kind: 'diamond-project',
          craft: 'diamond',
          title: 'Moonlit Greenhouse',
          subtitle: 'Diamond painting · Starshine Studio · Lena Vale',
          statusLabel: 'In progress',
          activityLabel: 'No progress notes yet',
          href: '/projects/project-1',
          sortTitle: 'Moonlit Greenhouse',
        }),
      ])
    );
    expect(result.snapshot.diamondActiveCount).toBe(1);
    expect(pbMock.collections.projects.getFullList).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: 'user = user-1 && status = progress',
      })
    );
  });

  it('uses latest notes for diamond activity labels and sorting', async () => {
    pbMock.collections.projects.getFullList.mockResolvedValue([
      projectRecord({
        id: 'older-project',
        title: 'Older Project',
        updated: '2026-04-20T00:00:00.000Z',
      }),
      projectRecord({
        id: 'noted-project',
        title: 'Noted Project',
        updated: '2026-04-01T00:00:00.000Z',
      }),
    ]);
    notesFeedMock.listLatestByTargets.mockResolvedValue({
      'diamond:noted-project': {
        targetKey: 'diamond:noted-project',
        date: '2026-04-28',
        createdAt: '2026-04-28T10:00:00.000Z',
      },
    });

    const result = await OverviewService.getOverviewData('user-1');

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'noted-project',
        activityLabel: 'Last progress note Apr 28',
      })
    );
  });

  it('normalizes in-progress coloring pages into feed items', async () => {
    pbMock.collections.coloring_books.getFullList.mockResolvedValue([bookRecord()]);
    pbMock.collections.coloring_pages.getFullList.mockResolvedValue([pageRecord()]);

    const result = await OverviewService.getOverviewData('user-1');

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'page-1',
          kind: 'coloring-page',
          craft: 'coloring',
          title: 'Page 12',
          subtitle: 'Coloring · Woodland Windows',
          statusLabel: 'In progress',
          activityLabel: 'No progress notes yet',
          href: '/coloring/book-1/pages/page-1',
          sortTitle: 'Woodland Windows 12',
        }),
      ])
    );
    expect(result.items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'coloring-book',
        }),
      ])
    );
    expect(pbMock.collections.coloring_books.getFullList).not.toHaveBeenCalled();
    expect(result.snapshot.coloringPageInProgressCount).toBe(1);
  });

  it('uses coloring page progress notes for coloring activity labels and sorting', async () => {
    pbMock.collections.coloring_pages.getFullList.mockResolvedValue([
      pageRecord({
        id: 'older-page',
        page_number: 12,
        updated: '2026-04-26T00:00:00.000Z',
      }),
      pageRecord({
        id: 'noted-page',
        page_number: 13,
        updated: '2026-04-01T00:00:00.000Z',
      }),
    ]);
    notesFeedMock.listLatestByTargets.mockResolvedValue({
      'coloring:noted-page': {
        targetKey: 'coloring:noted-page',
        date: '2026-04-28',
        createdAt: '2026-04-28T10:00:00.000Z',
      },
    });

    const result = await OverviewService.getOverviewData('user-1');

    expect(notesFeedMock.listLatestByTargets).toHaveBeenCalledWith({
      userId: 'user-1',
      targets: [
        { craft: 'coloring', id: 'older-page' },
        { craft: 'coloring', id: 'noted-page' },
      ],
    });
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'noted-page',
        activityLabel: 'Last progress note Apr 28',
      })
    );
    expect(result.items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activityLabel: '42% complete',
        }),
      ])
    );
  });

  it('counts in-progress coloring pages rather than coloring books in the snapshot', async () => {
    pbMock.collections.coloring_books.getFullList.mockResolvedValue([bookRecord()]);
    pbMock.collections.coloring_pages.getFullList.mockResolvedValue([
      pageRecord({ id: 'page-1', page_number: 12 }),
      pageRecord({ id: 'page-2', page_number: 13 }),
    ]);

    const result = await OverviewService.getOverviewData('user-1');

    expect(pbMock.collections.coloring_books.getFullList).not.toHaveBeenCalled();
    expect(result.items.filter(item => item.kind === 'coloring-page')).toHaveLength(2);
    expect(result.snapshot.coloringPageInProgressCount).toBe(2);
  });

  it('combines diamond and coloring completions for the month snapshot', async () => {
    pbMock.collections.projects.getList.mockResolvedValue(pbMock.createListResult([], 2));
    pbMock.collections.coloring_pages.getList.mockResolvedValue(pbMock.createListResult([], 3));

    const result = await OverviewService.getOverviewData('user-1');

    expect(result.snapshot.completedThisMonthCount).toBe(5);
  });

  it('returns empty data when the user has no active items', async () => {
    const result = await OverviewService.getOverviewData('user-1');

    expect(result.items).toEqual([]);
    expect(result.snapshot).toEqual({
      diamondActiveCount: 0,
      coloringPageInProgressCount: 0,
      completedThisMonthCount: 0,
    });
  });

  it('gets in-progress diamond projects and coloring pages as default note targets', async () => {
    pbMock.collections.projects.getFullList.mockResolvedValue([
      projectRecord({
        id: 'project-1',
        title: 'Moonlit Greenhouse',
        updated: '2026-04-20T00:00:00.000Z',
      }),
    ]);
    pbMock.collections.coloring_pages.getFullList.mockResolvedValue([
      pageRecord({
        id: 'page-1',
        page_number: 12,
        updated: '2026-04-26T00:00:00.000Z',
      }),
    ]);

    const result = await OverviewService.getNoteTargets('user-1');

    expect(result).toEqual([
      expect.objectContaining({
        id: 'page-1',
        kind: 'coloring-page',
        title: 'Page 12',
      }),
      expect.objectContaining({
        id: 'project-1',
        kind: 'diamond-project',
        title: 'Moonlit Greenhouse',
      }),
    ]);
    expect(pbMock.collections.projects.getFullList).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: 'user = user-1 && status = progress',
        requestKey: null,
        sort: '-updated',
      })
    );
    expect(pbMock.collections.coloring_pages.getFullList).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: 'book.user = user-1 && status = in_progress',
        requestKey: null,
        sort: '-updated',
      })
    );
  });

  it('expands diamond note target search beyond progress while excluding archived and destashed', async () => {
    pbMock.collections.projects.getFullList.mockResolvedValue([
      projectRecord({
        id: 'wishlist-project',
        title: 'Winter Window',
        status: 'wishlist',
      }),
    ]);

    const result = await OverviewService.getNoteTargets('user-1', { searchTerm: 'winter' });

    expect(result).toEqual([
      expect.objectContaining({
        id: 'wishlist-project',
        kind: 'diamond-project',
      }),
    ]);
    expect(pbMock.collections.projects.getFullList).toHaveBeenCalledWith(
      expect.objectContaining({
        filter:
          'user = user-1 && status != archived && status != destashed && (title ~ %winter% || company.name ~ %winter% || artist.name ~ %winter%)',
      })
    );
  });

  it('expands coloring note target search and can match a page number', async () => {
    pbMock.collections.coloring_pages.getFullList.mockResolvedValue([
      pageRecord({
        id: 'page-27',
        page_number: 27,
        status: 'completed',
      }),
    ]);

    const result = await OverviewService.getNoteTargets('user-1', { searchTerm: 'page 27' });

    expect(result).toEqual([
      expect.objectContaining({
        id: 'page-27',
        kind: 'coloring-page',
        title: 'Page 27',
      }),
    ]);
    expect(pbMock.collections.coloring_pages.getFullList).toHaveBeenCalledWith(
      expect.objectContaining({
        filter:
          'book.user = user-1 && (book.title ~ %page 27% || revealed_subject ~ %page 27% || page_number = 27)',
      })
    );
  });

  it('skips diamond note target queries when diamond painting is disabled', async () => {
    await OverviewService.getNoteTargets('user-1', {
      verticals: { diamond_painting: false, coloring_books: true },
    });

    expect(pbMock.collections.projects.getFullList).not.toHaveBeenCalled();
    expect(pbMock.collections.coloring_pages.getFullList).toHaveBeenCalledTimes(1);
  });

  it('skips coloring note target queries when coloring books are disabled', async () => {
    await OverviewService.getNoteTargets('user-1', {
      verticals: { diamond_painting: true, coloring_books: false },
    });

    expect(pbMock.collections.projects.getFullList).toHaveBeenCalledTimes(1);
    expect(pbMock.collections.coloring_pages.getFullList).not.toHaveBeenCalled();
  });

  it('gets every page for a book sorted by page number and filtered by user', async () => {
    pbMock.collections.coloring_pages.getFullList.mockResolvedValue([
      pageRecord({ id: 'page-2', page_number: 2, status: 'completed' }),
      pageRecord({ id: 'page-10', page_number: 10, status: 'blank' }),
    ]);

    const result = await OverviewService.getPagesForBook('user-1', 'book-1');

    expect(result.map(target => target.id)).toEqual(['page-2', 'page-10']);
    expect(pbMock.collections.coloring_pages.getFullList).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: 'book.user = user-1 && book = book-1',
        sort: 'page_number',
        requestKey: null,
      })
    );
  });

  it('returns no note targets for empty user or book ids without querying PocketBase', async () => {
    await expect(OverviewService.getNoteTargets('')).resolves.toEqual([]);
    await expect(OverviewService.getPagesForBook('', 'book-1')).resolves.toEqual([]);
    await expect(OverviewService.getPagesForBook('user-1', '')).resolves.toEqual([]);

    expect(pbMock.collections.projects.getFullList).not.toHaveBeenCalled();
    expect(pbMock.collections.coloring_pages.getFullList).not.toHaveBeenCalled();
  });
});
