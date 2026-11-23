import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RandomizerTargetsService } from '../randomizerTargets.service';

const { getFullListMock, collectionMock } = vi.hoisted(() => {
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

  it('includes the book format in coloring book target subtitles', async () => {
    getFullListMock.mockResolvedValue([
      {
        id: 'book-example',
        title: 'Example Book',
        status: 'in_progress',
        book_format: 'pdf',
        expand: { publisher: { name: 'Example Press' } },
      },
    ]);

    const [target] = await RandomizerTargetsService.listColoringBookTargets(
      'user-123',
      eligibility
    );

    expect(target.subtitle).toBe('PDF · Example Press');
  });
});
