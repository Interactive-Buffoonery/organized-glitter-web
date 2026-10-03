import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RandomizerTargetsService } from '../randomizerTargets.service';

const { getFullListMock, getListMock, collectionMock } = vi.hoisted(() => {
  const getFullList = vi.fn();
  const getList = vi.fn();
  return {
    getFullListMock: getFullList,
    getListMock: getList,
    collectionMock: vi.fn(() => ({
      getFullList,
      getList,
    })),
  };
});

vi.mock('@/lib/pocketbase', () => ({
  getFileUrl: vi.fn((_record, file, thumb) => `/files/projects/${file}?thumb=${thumb}`),
  resolveFileUrl: vi.fn(
    (collection, id, file, thumb) => `/files/${collection}/${id}/${file}?thumb=${thumb}`
  ),
  pb: {
    collection: collectionMock,
    filter: vi.fn((template: string, params: Record<string, string>) =>
      Object.entries(params).reduce(
        (expression, [key, value]) => expression.replaceAll(`{:${key}}`, `"${value}"`),
        template
      )
    ),
  },
}));

const eligibility = {
  diamondStatuses: ['progress'],
  bookStatuses: ['in_progress'],
  pageStatuses: ['palette_chosen', 'in_progress'],
  ownership: 'owned' as const,
};

describe('RandomizerTargetsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['diamond', 'projects', 'user'],
    ['coloring-book', 'coloring_books', 'user'],
    ['coloring-page', 'coloring_pages', 'book.user'],
  ] as const)(
    'checks %s library presence without status filters or full scans',
    async (mode, collection, ownerField) => {
      getListMock.mockResolvedValue({ items: [{ id: 'item12345678901' }] });
      expect(await RandomizerTargetsService.hasTargets('user-123', mode)).toBe(true);
      expect(collectionMock).toHaveBeenCalledWith(collection);
      expect(getListMock).toHaveBeenCalledWith(1, 1, {
        filter: `${ownerField} = "user-123"`,
        fields: 'id',
        skipTotal: true,
      });
      getListMock.mockResolvedValue({ items: [] });
      expect(await RandomizerTargetsService.hasTargets('user-123', mode)).toBe(false);
    }
  );

  it('maps diamond project records to randomizer targets', async () => {
    getFullListMock.mockResolvedValue([
      {
        id: 'project-123456789',
        title: 'Aurora Wolves',
        status: 'progress',
        image: 'cover.jpg',
        width: 40,
        height: 50,
        total_diamonds: 80000,
        expand: {
          company: { name: 'Moonlight Co.' },
          artist: { name: 'A. Artist' },
        },
      },
    ]);

    const targets = await RandomizerTargetsService.listDiamondTargets('user-123', eligibility);

    expect(collectionMock).toHaveBeenCalledWith('projects');
    expect(targets[0]).toMatchObject({
      id: 'project-123456789',
      mode: 'diamond',
      targetType: 'diamond_project',
      title: 'Aurora Wolves',
      subtitle: 'Moonlight Co. · A. Artist',
      href: '/projects/project-123456789',
      statusLabel: 'In progress',
      width: 40,
      height: 50,
      totalDiamonds: 80000,
    });
  });

  it('builds a supported OR status filter for diamond projects', async () => {
    getFullListMock.mockResolvedValue([]);

    await RandomizerTargetsService.listDiamondTargets('user-123', {
      ...eligibility,
      diamondStatuses: ['progress', 'kitted', 'onhold'],
    });

    expect(getFullListMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filter:
          'user = "user-123" && (status = "progress" || status = "kitted" || status = "onhold")',
      })
    );
  });

  it('builds a deliberate no-match filter when diamond statuses are empty', async () => {
    getFullListMock.mockResolvedValue([]);

    await RandomizerTargetsService.listDiamondTargets('user-123', {
      ...eligibility,
      diamondStatuses: [],
    });

    expect(getFullListMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: 'user = "user-123" && id = "__none__"',
      })
    );
  });

  it('maps coloring book records to randomizer targets', async () => {
    getFullListMock.mockResolvedValue([
      {
        id: 'book-12345678901',
        title: 'Garden Pages',
        status: 'in_progress',
        cover_image: 'cover.jpg',
        expand: {
          publisher: { name: 'Indie Press' },
          illustrator: { name: 'Line Artist' },
        },
      },
    ]);

    const targets = await RandomizerTargetsService.listColoringBookTargets('user-123', eligibility);

    expect(collectionMock).toHaveBeenCalledWith('coloring_books');
    expect(targets[0]).toMatchObject({
      id: 'book-12345678901',
      mode: 'coloring-book',
      targetType: 'coloring_book',
      title: 'Garden Pages',
      subtitle: 'Indie Press · Line Artist',
      href: '/coloring/book-12345678901',
      statusLabel: 'In progress',
    });
  });

  it('does not apply hidden ownership filters to coloring books', async () => {
    getFullListMock.mockResolvedValue([]);

    await RandomizerTargetsService.listColoringBookTargets('user-123', {
      ...eligibility,
      bookStatuses: ['purchased', 'in_progress'],
    });

    expect(getFullListMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: 'user = "user-123" && (status = "purchased" || status = "in_progress")',
      })
    );
  });

  it('maps coloring page records to randomizer targets', async () => {
    getFullListMock.mockResolvedValue([
      {
        id: 'page-12345678901',
        status: 'palette_chosen',
        page_number: 7,
        photos: ['page.jpg'],
        expand: {
          book: {
            id: 'book-12345678901',
            title: 'Garden Pages',
            cover_image: 'cover.jpg',
            expand: {
              publisher: { name: 'Indie Press' },
              illustrator: { name: 'Line Artist' },
            },
          },
        },
      },
    ]);

    const targets = await RandomizerTargetsService.listColoringPageTargets('user-123', eligibility);

    expect(collectionMock).toHaveBeenCalledWith('coloring_pages');
    expect(targets[0]).toMatchObject({
      id: 'page-12345678901',
      mode: 'coloring-page',
      targetType: 'coloring_page',
      title: 'Garden Pages, page 7',
      subtitle: 'Garden Pages · Indie Press · Line Artist',
      href: '/coloring/book-12345678901/pages/page-12345678901',
      statusLabel: 'Palette chosen',
    });
    expect(targets[0].selectedMetadata).toMatchObject({
      coloringPage: 'page-12345678901',
      coloringBook: 'book-12345678901',
      pageNumber: 7,
    });
  });

  it('builds a supported OR status filter for coloring pages', async () => {
    getFullListMock.mockResolvedValue([]);

    await RandomizerTargetsService.listColoringPageTargets('user-123', {
      ...eligibility,
      pageStatuses: ['palette_chosen', 'in_progress'],
    });

    expect(getFullListMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: 'book.user = "user-123" && (status = "palette_chosen" || status = "in_progress")',
      })
    );
  });

  it('scopes coloring page targets to a selected book without dropping user ownership', async () => {
    getFullListMock.mockResolvedValue([]);

    await RandomizerTargetsService.listColoringPageTargets(
      'user-123',
      {
        ...eligibility,
        pageStatuses: ['palette_chosen', 'in_progress'],
      },
      { bookId: 'book-12345678901' }
    );

    expect(getFullListMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filter:
          'book.user = "user-123" && book = "book-12345678901" && (status = "palette_chosen" || status = "in_progress")',
      })
    );
  });
});
