import { beforeEach, describe, expect, it, vi } from 'vitest';

const { progressNotesMock, coloringNotesMock } = vi.hoisted(() => ({
  progressNotesMock: {
    listForUser: vi.fn(),
    listLatestForProjects: vi.fn(),
  },
  coloringNotesMock: {
    listForUser: vi.fn(),
    listLatestForPages: vi.fn(),
  },
}));

vi.mock('@/services/pocketbase/progressNotes.service', () => ({
  ProgressNotesService: progressNotesMock,
}));

vi.mock('@/services/pocketbase/coloringPageProgressNotes.service', () => ({
  ColoringPageProgressNotesService: coloringNotesMock,
}));

import { NotesFeedService } from '../notesFeed.service';

const emptyPage = (page = 1) => ({
  page,
  perPage: 30,
  totalItems: 0,
  totalPages: 0,
  items: [],
});

const createDiamondNote = (index: number, date = `2026-05-${String(index).padStart(2, '0')}`) => ({
  id: `diamond-note-${index}`,
  projectId: 'project-1',
  content: `Diamond note ${index}`,
  date,
  createdAt: `${date}T10:00:00.000Z`,
  updatedAt: '',
  project: { id: 'project-1', title: 'Starry Kit' },
});

const createColoringNote = (index: number, date = `2026-04-${String(index).padStart(2, '0')}`) => ({
  id: `coloring-note-${index}`,
  pageId: 'page-1',
  content: `Coloring note ${index}`,
  date,
  createdAt: `${date}T10:00:00.000Z`,
  updatedAt: '',
  page: { id: 'page-1', pageNumber: 12, bookId: 'book-1', bookTitle: 'Garden Book' },
});

const compareSourceNotes = (
  a: { id: string; date: string; createdAt: string },
  b: { id: string; date: string; createdAt: string }
) => {
  const dateCompare = b.date.localeCompare(a.date);
  if (dateCompare !== 0) return dateCompare;
  const createdCompare = b.createdAt.localeCompare(a.createdAt);
  if (createdCompare !== 0) return createdCompare;
  return b.id.localeCompare(a.id);
};

const isAfterCursor = (
  note: { id: string; date: string; createdAt: string },
  cursor?: { id: string; date: string; createdAt: string }
) => !cursor || compareSourceNotes(note, cursor) > 0;

describe('NotesFeedService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    progressNotesMock.listForUser.mockResolvedValue(emptyPage());
    coloringNotesMock.listForUser.mockResolvedValue(emptyPage());
    progressNotesMock.listLatestForProjects.mockResolvedValue({});
    coloringNotesMock.listLatestForPages.mockResolvedValue({});
  });

  it('lists all craft notes with translated source filters and merged totals', async () => {
    progressNotesMock.listForUser.mockResolvedValue({
      page: 1,
      perPage: 31,
      totalItems: 7,
      totalPages: 3,
      items: [
        {
          id: 'diamond-note',
          projectId: 'project-1',
          content: 'Diamond note',
          date: '2026-05-08',
          createdAt: '2026-05-08T10:00:00.000Z',
          updatedAt: '',
          project: { id: 'project-1', title: 'Starry Kit', company: 'Craft Co' },
        },
      ],
    });
    coloringNotesMock.listForUser.mockResolvedValue({
      page: 1,
      perPage: 31,
      totalItems: 4,
      totalPages: 2,
      items: [
        {
          id: 'coloring-note',
          pageId: 'page-1',
          content: 'Coloring note',
          date: '2026-05-10',
          imageFilename: 'coloring.jpg',
          createdAt: '2026-05-10T10:00:00.000Z',
          updatedAt: '',
          page: { id: 'page-1', pageNumber: 12, bookId: 'book-1', bookTitle: 'Garden Book' },
        },
      ],
    });

    const result = await NotesFeedService.listForUser({
      userId: 'user-1',
      page: 1,
      sourceId: 'source-1',
      year: 2026,
      hasImage: true,
    });

    expect(progressNotesMock.listForUser).toHaveBeenCalledWith({
      userId: 'user-1',
      page: 1,
      perPage: 31,
      projectId: 'source-1',
      year: 2026,
      hasImage: true,
    });
    expect(coloringNotesMock.listForUser).toHaveBeenCalledWith({
      userId: 'user-1',
      page: 1,
      perPage: 31,
      sourceId: 'source-1',
      year: 2026,
      hasImage: true,
    });
    expect(result).toMatchObject({
      page: 1,
      perPage: 30,
      totalItems: 11,
      totalPages: 1,
      totalsAreSnapshot: true,
    });
    expect(result.items.map(item => item.id)).toEqual([
      'coloring:coloring-note',
      'diamond:diamond-note',
    ]);
    expect(result.items[0]).toMatchObject({
      craft: 'coloring',
      imageFile: {
        collectionName: 'coloring_page_progress_notes',
        recordId: 'coloring-note',
        filename: 'coloring.jpg',
      },
      source: { id: 'book-1', title: 'Garden Book', pageId: 'page-1' },
    });
  });

  it('sorts same-day notes by createdAt newest first', async () => {
    progressNotesMock.listForUser.mockResolvedValue({
      ...emptyPage(),
      items: [
        {
          id: 'older',
          projectId: 'project-1',
          content: 'Older',
          date: '2026-05-10',
          createdAt: '2026-05-10T09:00:00.000Z',
          updatedAt: '',
        },
      ],
    });
    coloringNotesMock.listForUser.mockResolvedValue({
      ...emptyPage(),
      items: [
        {
          id: 'newer',
          pageId: 'page-1',
          content: 'Newer',
          date: '2026-05-10',
          createdAt: '2026-05-10T11:00:00.000Z',
          updatedAt: '',
        },
      ],
    });

    const result = await NotesFeedService.listForUser({ userId: 'user-1', page: 1 });

    expect(result.items.map(item => item.id)).toEqual(['coloring:newer', 'diamond:older']);
  });

  it('retains the raw PocketBase date in the source keyset cursor', async () => {
    progressNotesMock.listForUser.mockResolvedValue({
      page: 1,
      perPage: 2,
      totalItems: 2,
      totalPages: 1,
      items: [createDiamondNote(2, '2026-05-10'), createDiamondNote(1, '2026-05-10')],
      nextCursor: {
        id: 'diamond-note-1',
        date: '2026-05-10 00:00:00.000Z',
        createdAt: '2026-05-10T10:00:00.000Z',
      },
    });

    const result = await NotesFeedService.listForUser({
      userId: 'user-1',
      page: 1,
      perPage: 1,
    });

    expect(result.items[0].date).toBe('2026-05-10');
    expect(result.nextContinuation?.sources.diamond.cursor?.date).toBe('2026-05-10 00:00:00.000Z');
  });

  it('retrieves ten merged pages linearly without gaps or duplicates across exact ties', async () => {
    const diamondNotes = Array.from({ length: 180 }, (_, index) => ({
      ...createDiamondNote(index),
      id: `diamond-note-${String(index).padStart(3, '0')}`,
      date: '2026-05-10',
      createdAt: `2026-05-10T10:00:${String(Math.floor(index / 2)).padStart(3, '0')}Z`,
    })).sort(compareSourceNotes);
    const coloringNotes = Array.from({ length: 180 }, (_, index) => ({
      ...createColoringNote(index),
      id: `coloring-note-${String(index).padStart(3, '0')}`,
      date: '2026-05-10',
      createdAt: `2026-05-10T10:00:${String(Math.floor(index / 2)).padStart(3, '0')}Z`,
    })).sort(compareSourceNotes);
    let transferredRows = 0;

    const mockSource = (notes: typeof diamondNotes) =>
      vi.fn(async ({ perPage, cursor }: { perPage: number; cursor?: (typeof notes)[number] }) => {
        const items = notes.filter(note => isAfterCursor(note, cursor)).slice(0, perPage);
        const lastItem = items.at(-1);
        transferredRows += items.length;
        return {
          page: 1,
          perPage,
          totalItems: notes.length,
          totalPages: Math.ceil(notes.length / perPage),
          items,
          nextCursor: lastItem
            ? { id: lastItem.id, date: lastItem.date, createdAt: lastItem.createdAt }
            : undefined,
        };
      });

    progressNotesMock.listForUser.mockImplementation(mockSource(diamondNotes));
    coloringNotesMock.listForUser.mockImplementation(mockSource(coloringNotes));

    const collected = [];
    let continuation: unknown;
    for (let page = 1; page <= 10; page += 1) {
      const result = await NotesFeedService.listForUser({
        userId: 'user-1',
        page,
        perPage: 30,
        continuation,
      });
      collected.push(...result.items);
      continuation = result.nextContinuation;
    }

    const expected = [
      ...diamondNotes.map(note => ({ ...note, id: `diamond:${note.id}` })),
      ...coloringNotes.map(note => ({ ...note, id: `coloring:${note.id}` })),
    ]
      .sort(compareSourceNotes)
      .slice(0, 300)
      .map(note => note.id);
    const collectedIds = collected.map(note => note.id);

    expect(collectedIds).toEqual(expected);
    expect(new Set(collectedIds).size).toBe(300);
    expect(transferredRows).toBe(310);
    expect([
      ...progressNotesMock.listForUser.mock.calls,
      ...coloringNotesMock.listForUser.mock.calls,
    ]).toEqual(expect.arrayContaining([[expect.objectContaining({ page: 1, perPage: 31 })]]));
  });

  it('keeps keyset pages stable when source rows change between requests', async () => {
    const diamondNotes = Array.from({ length: 70 }, (_, index) => ({
      ...createDiamondNote(index),
      id: `diamond-note-${String(index).padStart(3, '0')}`,
      date: '2026-05-10',
      createdAt: `2026-05-10T10:00:${String(Math.floor(index / 2)).padStart(3, '0')}Z`,
    })).sort(compareSourceNotes);
    const coloringNotes = Array.from({ length: 70 }, (_, index) => ({
      ...createColoringNote(index),
      id: `coloring-note-${String(index).padStart(3, '0')}`,
      date: '2026-05-10',
      createdAt: `2026-05-10T10:00:${String(Math.floor(index / 2)).padStart(3, '0')}Z`,
    })).sort(compareSourceNotes);
    const originalIds = [
      ...diamondNotes.map(note => ({ ...note, id: `diamond:${note.id}` })),
      ...coloringNotes.map(note => ({ ...note, id: `coloring:${note.id}` })),
    ]
      .sort(compareSourceNotes)
      .map(note => note.id);

    const mockSource = <T extends { id: string; date: string; createdAt: string }>(notes: T[]) =>
      vi.fn(async ({ perPage, cursor }: { perPage: number; cursor?: T }) => {
        const items = notes.filter(note => isAfterCursor(note, cursor)).slice(0, perPage);
        const lastItem = items.at(-1);
        return {
          page: 1,
          perPage,
          totalItems: notes.length,
          totalPages: Math.ceil(notes.length / perPage),
          items,
          nextCursor: lastItem
            ? { id: lastItem.id, date: lastItem.date, createdAt: lastItem.createdAt }
            : undefined,
        };
      });
    progressNotesMock.listForUser.mockImplementation(mockSource(diamondNotes));
    coloringNotesMock.listForUser.mockImplementation(mockSource(coloringNotes));

    const firstPage = await NotesFeedService.listForUser({
      userId: 'user-1',
      page: 1,
      perPage: 10,
    });
    const deletedDiamondId = `diamond:${diamondNotes[40].id}`;
    const secondDeletedDiamondId = `diamond:${diamondNotes[50].id}`;
    const deletedColoringId = `coloring:${coloringNotes[45].id}`;
    diamondNotes.splice(50, 1);
    diamondNotes.splice(40, 1);
    coloringNotes.splice(45, 1);
    diamondNotes.unshift({
      ...createDiamondNote(999),
      id: 'diamond-note-inserted',
      date: '2026-05-11',
      createdAt: '2026-05-11T12:00:00.000Z',
    });
    coloringNotes.unshift({
      ...createColoringNote(999),
      id: 'coloring-note-inserted',
      date: '2026-05-11',
      createdAt: '2026-05-11T12:00:00.000Z',
    });

    const collected = [...firstPage.items];
    let finalPage = firstPage;
    let continuation = firstPage.nextContinuation;
    let page = 2;
    while (continuation) {
      const result = await NotesFeedService.listForUser({
        userId: 'user-1',
        page,
        perPage: 10,
        continuation,
      });
      finalPage = result;
      collected.push(...result.items);
      continuation = result.nextContinuation;
      page += 1;
    }

    const collectedIds = collected.map(note => note.id);
    const expectedIds = originalIds.filter(
      id => id !== deletedDiamondId && id !== secondDeletedDiamondId && id !== deletedColoringId
    );
    expect(collectedIds).toEqual(expectedIds);
    expect(new Set(collectedIds).size).toBe(collectedIds.length);
    expect(collectedIds).not.toContain('diamond:diamond-note-inserted');
    expect(collectedIds).not.toContain('coloring:coloring-note-inserted');
    expect(finalPage).toMatchObject({
      totalItems: 140,
      totalPages: 14,
      totalsAreSnapshot: true,
    });
  });

  it('uses only the requested production adapter for craft-specific feeds', async () => {
    const result = await NotesFeedService.listForUser({
      userId: 'user-1',
      page: 2,
      craft: 'diamond',
      sourceId: 'project-1',
      hasImage: false,
    });

    expect(progressNotesMock.listForUser).toHaveBeenCalledWith({
      userId: 'user-1',
      page: 2,
      perPage: 30,
      projectId: 'project-1',
      year: undefined,
      hasImage: false,
    });
    expect(coloringNotesMock.listForUser).not.toHaveBeenCalled();
    expect(result.totalsAreSnapshot).toBe(false);
  });

  it('normalizes latest note summaries by cross-craft target key', async () => {
    progressNotesMock.listLatestForProjects.mockResolvedValue({
      'project-1': {
        id: 'diamond-note',
        projectId: 'project-1',
        content: 'Diamond',
        date: '2026-05-08',
        createdAt: '2026-05-08T10:00:00.000Z',
        updatedAt: '',
      },
    });
    coloringNotesMock.listLatestForPages.mockResolvedValue({
      'page-1': {
        id: 'coloring-note',
        pageId: 'page-1',
        content: 'Coloring',
        date: '2026-05-09',
        createdAt: '2026-05-09T10:00:00.000Z',
        updatedAt: '',
      },
    });

    const result = await NotesFeedService.listLatestByTargets({
      userId: 'user-1',
      targets: [
        { craft: 'diamond', id: 'project-1' },
        { craft: 'coloring', id: 'page-1' },
      ],
    });

    expect(progressNotesMock.listLatestForProjects).toHaveBeenCalledWith({
      userId: 'user-1',
      projectIds: ['project-1'],
    });
    expect(coloringNotesMock.listLatestForPages).toHaveBeenCalledWith({
      userId: 'user-1',
      pageIds: ['page-1'],
    });
    expect(result).toEqual({
      'diamond:project-1': {
        targetKey: 'diamond:project-1',
        date: '2026-05-08',
        createdAt: '2026-05-08T10:00:00.000Z',
      },
      'coloring:page-1': {
        targetKey: 'coloring:page-1',
        date: '2026-05-09',
        createdAt: '2026-05-09T10:00:00.000Z',
      },
    });
  });
});
