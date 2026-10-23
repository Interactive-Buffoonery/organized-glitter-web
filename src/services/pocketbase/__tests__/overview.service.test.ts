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
});
