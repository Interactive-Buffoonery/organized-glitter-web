import { beforeEach, describe, expect, it, vi } from 'vitest';

const pbMock = vi.hoisted(() => {
  const collectionMethods = {
    getFullList: vi.fn().mockResolvedValue([]),
    getList: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn().mockResolvedValue(true),
  };

  const interpolateFilter = (expr: string, params?: Record<string, string>) =>
    Object.entries(params ?? {}).reduce(
      (filter, [key, value]) => filter.replaceAll(`{:${key}}`, value),
      expr
    );

  return {
    pb: {
      collection: vi.fn(() => collectionMethods),
      filter: vi.fn(interpolateFilter),
    },
    collectionMethods,
    reset: () => {
      Object.values(collectionMethods).forEach(method => method.mockReset());
      collectionMethods.getFullList.mockResolvedValue([]);
      collectionMethods.getList.mockResolvedValue({
        page: 1,
        perPage: 30,
        totalItems: 0,
        totalPages: 1,
        items: [],
      });
      collectionMethods.delete.mockResolvedValue(true);
    },
  };
});

vi.mock('../base/latestNotes', () => ({ fetchLatestNotes: vi.fn().mockResolvedValue(null) }));

vi.mock('@/lib/pocketbase', () => ({
  pb: pbMock.pb,
  getFileUrl: vi.fn((record: { id: string }, filename: string) =>
    record.id && filename ? `https://files.test/${record.id}/${filename}` : ''
  ),
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/services/auth', () => ({
  getCurrentUserId: () => 'user-1',
  isAuthenticated: () => true,
}));

import { ColoringPageProgressNotesService } from '../coloringPageProgressNotes.service';

describe('ColoringPageProgressNotesService', () => {
  beforeEach(() => {
    pbMock.reset();
  });

  it('lists paginated notes for a user with expanded coloring source metadata', async () => {
    pbMock.collectionMethods.getList.mockResolvedValue({
      page: 2,
      perPage: 10,
      totalItems: 11,
      totalPages: 2,
      items: [
        {
          id: 'note-1',
          user: 'user-1',
          page: 'page-1',
          content: 'Finished the sky',
          date: '2026-05-05 00:00:00.000Z',
          image: 'sky.jpg',
          created: '2026-05-05T12:00:00.000Z',
          updated: '2026-05-05T12:00:00.000Z',
          expand: {
            page: {
              id: 'page-1',
              page_number: 12,
              book: 'book-1',
              expand: {
                book: {
                  id: 'book-1',
                  title: 'Garden book',
                  expand: {
                    publisher: { id: 'publisher-1', name: 'Color Press' },
                    illustrator: { id: 'illustrator-1', name: 'A. Artist' },
                  },
                },
              },
            },
          },
        },
      ],
    });

    const result = await ColoringPageProgressNotesService.listForUser({
      userId: 'user-1',
      page: 2,
      perPage: 10,
      sourceId: 'book-1',
      year: 2026,
      hasImage: true,
      cursor: {
        id: 'cursor-note',
        date: '2026-05-05',
        createdAt: '2026-05-05T12:00:00.000Z',
      },
    });

    expect(pbMock.collectionMethods.getList).toHaveBeenCalledWith(
      2,
      10,
      expect.objectContaining({
        filter: expect.stringContaining('id < cursor-note'),
        sort: '-date,-created,-id',
        expand: 'page,page.book,page.book.publisher,page.book.illustrator',
        skipTotal: true,
      })
    );
    expect(result.items[0]).toMatchObject({
      id: 'note-1',
      pageId: 'page-1',
      imageUrl: 'https://files.test/note-1/sky.jpg',
      page: {
        id: 'page-1',
        pageNumber: 12,
        bookId: 'book-1',
        bookTitle: 'Garden book',
        publisher: 'Color Press',
        illustrator: 'A. Artist',
      },
    });
    expect(result.nextCursor).toEqual({
      id: 'note-1',
      date: '2026-05-05 00:00:00.000Z',
      createdAt: '2026-05-05T12:00:00.000Z',
    });
  });

  it('throws after attempting every progress note delete when cleanup partially fails', async () => {
    pbMock.collectionMethods.getFullList.mockResolvedValue([
      { id: 'note-1' },
      { id: 'note-2' },
      { id: 'note-3' },
    ]);
    pbMock.collectionMethods.delete.mockImplementation(async (id: string) => {
      if (id === 'note-2') {
        throw new Error('PocketBase rejected delete');
      }
      return true;
    });

    await expect(ColoringPageProgressNotesService.deleteAllForPage('page-1')).rejects.toThrow(
      'note-2'
    );

    expect(pbMock.collectionMethods.delete).toHaveBeenCalledWith('note-1');
    expect(pbMock.collectionMethods.delete).toHaveBeenCalledWith('note-2');
    expect(pbMock.collectionMethods.delete).toHaveBeenCalledWith('note-3');
  });

  it('maps each book page to its newest note image with a lean query', async () => {
    pbMock.collectionMethods.getFullList.mockResolvedValue([
      { id: 'note-new', page: 'page-1', image: 'new.jpg' },
      { id: 'note-old', page: 'page-1', image: 'old.jpg' },
      { id: 'note-2', page: 'page-2', image: 'two.jpg' },
    ]);

    await expect(
      ColoringPageProgressNotesService.listLatestImagesForBook({
        userId: 'user-1',
        bookId: 'book-1',
      })
    ).resolves.toEqual({
      'page-1': 'https://files.test/note-new/new.jpg',
      'page-2': 'https://files.test/note-2/two.jpg',
    });

    const [options] = pbMock.collectionMethods.getFullList.mock.calls[0];
    expect(options).toEqual({
      filter: "user = user-1 && page.book = book-1 && image != ''",
      sort: '-date,-created,-id',
      fields: 'id,page,image',
    });
  });
});
