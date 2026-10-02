import { fetchLatestNotes } from '../base/latestNotes';
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

  it('lists notes for a coloring page in timeline order', async () => {
    pbMock.collectionMethods.getFullList.mockResolvedValue([
      {
        id: 'note-1',
        user: 'user-1',
        page: 'page-1',
        content: 'Finished the sky',
        date: '2026-05-05',
        image: 'sky.jpg',
        created: '2026-05-05T12:00:00.000Z',
        updated: '2026-05-05T12:00:00.000Z',
      },
    ]);

    const notes = await ColoringPageProgressNotesService.listByPage('page-1');

    expect(pbMock.pb.filter).toHaveBeenCalledWith('page = {:pageId}', { pageId: 'page-1' });
    expect(pbMock.collectionMethods.getFullList).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: 'page = page-1',
        sort: '-date,-created',
      })
    );
    expect(notes).toEqual([
      expect.objectContaining({
        id: 'note-1',
        pageId: 'page-1',
        imageUrl: 'https://files.test/note-1/sky.jpg',
      }),
    ]);
  });

  it('transfers at most one summary row per requested coloring page as history grows', async () => {
    pbMock.collectionMethods.getList.mockImplementation(
      async (_page: number, _perPage: number, options: { filter: string }) => ({
        page: 1,
        perPage: 1,
        totalItems: options.filter.includes('page-1') ? 1_000 : 2_000,
        totalPages: options.filter.includes('page-1') ? 1_000 : 2_000,
        items: [
          {
            id: options.filter.includes('page-1') ? 'note-latest-page-1' : 'note-latest-page-2',
            user: 'user-1',
            page: options.filter.includes('page-1') ? 'page-1' : 'page-2',
            content: '',
            date: '2026-05-05',
            image: '',
            created: '2026-05-05T12:00:00.000Z',
            updated: '',
          },
        ],
      })
    );

    const notesByPage = await ColoringPageProgressNotesService.listLatestForPages({
      userId: 'user-1',
      pageIds: ['page-1', 'page-2'],
    });

    expect(pbMock.collectionMethods.getList).toHaveBeenCalledTimes(2);
    expect(pbMock.collectionMethods.getList).toHaveBeenNthCalledWith(
      1,
      1,
      1,
      expect.objectContaining({
        filter: 'user = user-1 && page.book.user = user-1 && page = page-1',
        fields: 'id,page,date,created',
        requestKey: null,
        sort: '-date,-created,-id',
      })
    );
    expect(notesByPage).toEqual({
      'page-1': expect.objectContaining({
        id: 'note-latest-page-1',
        pageId: 'page-1',
      }),
      'page-2': expect.objectContaining({
        id: 'note-latest-page-2',
        pageId: 'page-2',
      }),
    });
    expect(pbMock.collectionMethods.getFullList).not.toHaveBeenCalled();
  });

  it('propagates a latest-note authorization failure', async () => {
    pbMock.collectionMethods.getList.mockRejectedValueOnce(new Error('403 forbidden'));

    await expect(
      ColoringPageProgressNotesService.listLatestForPages({
        userId: 'user-1',
        pageIds: ['page-1'],
      })
    ).rejects.toThrow();
  });

  it('does not query latest notes when no coloring page ids are provided', async () => {
    await expect(
      ColoringPageProgressNotesService.listLatestForPages({ userId: 'user-1', pageIds: [] })
    ).resolves.toEqual({});

    expect(pbMock.collectionMethods.getList).not.toHaveBeenCalled();
  });

  it('creates a note with an optional image', async () => {
    const imageFile = new File(['image'], 'page.jpg', { type: 'image/jpeg' });
    pbMock.collectionMethods.create.mockResolvedValue({
      id: 'note-2',
      user: 'user-1',
      page: 'page-1',
      content: 'Started the border',
      date: '2026-05-06',
      image: 'page.jpg',
      created: '2026-05-06T12:00:00.000Z',
      updated: '2026-05-06T12:00:00.000Z',
    });

    const note = await ColoringPageProgressNotesService.create({
      page: 'page-1',
      content: 'Started the border',
      date: '2026-05-06',
      imageFile,
    });

    expect(pbMock.collectionMethods.create).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 'page-1',
        user: 'user-1',
        content: 'Started the border',
        date: '2026-05-06',
        image: imageFile,
      })
    );
    expect(note.pageId).toBe('page-1');
  });

  it('updates content, removes images, and deletes notes by id', async () => {
    pbMock.collectionMethods.update.mockResolvedValue({
      id: 'note-3',
      user: 'user-1',
      page: 'page-1',
      content: 'Updated',
      date: '2026-05-06',
      image: '',
      created: '',
      updated: '',
    });

    await ColoringPageProgressNotesService.updateContent('note-3', 'Updated');
    await ColoringPageProgressNotesService.removeImage('note-3');
    await ColoringPageProgressNotesService.delete('note-3');

    expect(pbMock.collectionMethods.update).toHaveBeenCalledWith('note-3', {
      content: 'Updated',
    });
    expect(pbMock.collectionMethods.update).toHaveBeenCalledWith('note-3', { image: null });
    expect(pbMock.collectionMethods.delete).toHaveBeenCalledWith('note-3');
  });

  it('deletes all progress notes for a coloring page', async () => {
    pbMock.collectionMethods.getFullList.mockResolvedValue([{ id: 'note-1' }, { id: 'note-2' }]);

    await expect(
      ColoringPageProgressNotesService.deleteAllForPage('page-1')
    ).resolves.toBeUndefined();

    expect(pbMock.pb.filter).toHaveBeenCalledWith('page = {:pageId}', { pageId: 'page-1' });
    expect(pbMock.collectionMethods.getFullList).toHaveBeenCalledWith({
      filter: 'page = page-1',
      fields: 'id',
    });
    expect(pbMock.collectionMethods.delete).toHaveBeenCalledWith('note-1');
    expect(pbMock.collectionMethods.delete).toHaveBeenCalledWith('note-2');
  });

  it('does not delete anything when a coloring page has no progress notes', async () => {
    pbMock.collectionMethods.getFullList.mockResolvedValue([]);

    await expect(
      ColoringPageProgressNotesService.deleteAllForPage('page-1')
    ).resolves.toBeUndefined();

    expect(pbMock.collectionMethods.delete).not.toHaveBeenCalled();
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
});

describe('batched coloring summary mapping', () => {
  it('uses hook summaries without per-target requests', async () => {
    pbMock.reset();
    vi.mocked(fetchLatestNotes).mockResolvedValueOnce([
      {
        id: 'note1',
        targetId: 'target1',
        date: '2026-09-06',
        created: '2026-09-06T12:00:00Z',
      },
    ]);
    const result = await ColoringPageProgressNotesService.listLatestForPages({
      userId: 'user1',
      pageIds: ['target1'],
    });
    expect(result.target1).toEqual({
      id: 'note1',
      pageId: 'target1',
      date: '2026-09-06',
      createdAt: '2026-09-06T12:00:00Z',
    });
    expect(pbMock.collectionMethods.getList).not.toHaveBeenCalled();
  });
});
