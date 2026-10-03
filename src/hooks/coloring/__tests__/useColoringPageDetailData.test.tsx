import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColoringBookDTO, ColoringPageDTO } from '@/services/pocketbase/coloring.service';
import type { ColoringMediumRecord } from '@/types/coloringMedium';

const {
  bookMock,
  pageMock,
  pagesMock,
  mediumsMock,
  bookLoadingMock,
  bookErrorMock,
  pageLoadingMock,
  pageErrorMock,
  pagesErrorMock,
  pagesRefetchMock,
  mediumsLoadingMock,
  getPagePhotoUrlsMock,
} = vi.hoisted(() => ({
  bookMock: { current: undefined as ColoringBookDTO | undefined },
  pageMock: { current: undefined as ColoringPageDTO | undefined },
  pagesMock: { current: [] as ColoringPageDTO[] },
  mediumsMock: { current: [] as ColoringMediumRecord[] },
  bookLoadingMock: { current: false },
  bookErrorMock: { current: null as unknown },
  pageLoadingMock: { current: false },
  pageErrorMock: { current: null as unknown },
  pagesErrorMock: { current: null as unknown },
  pagesRefetchMock: vi.fn(),
  mediumsLoadingMock: { current: false },
  getPagePhotoUrlsMock: vi.fn(),
}));

vi.mock('@/hooks/useUserTimezone', () => ({
  useUserTimezone: () => 'UTC',
}));

vi.mock('@/hooks/queries/coloring/useColoringBook', () => ({
  useColoringBook: () => ({
    data: bookMock.current,
    isLoading: bookLoadingMock.current,
    isError: Boolean(bookErrorMock.current),
    error: bookErrorMock.current,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/queries/coloring/useColoringPage', () => ({
  useColoringPage: () => ({
    data: pageMock.current,
    isLoading: pageLoadingMock.current,
    isError: Boolean(pageErrorMock.current),
    error: pageErrorMock.current,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/queries/coloring/useColoringPages', () => ({
  useColoringPages: () => ({
    data: { items: pagesMock.current },
    isLoading: false,
    isError: Boolean(pagesErrorMock.current),
    error: pagesErrorMock.current,
    isFetching: false,
    refetch: pagesRefetchMock,
  }),
}));

vi.mock('@/hooks/queries/coloring/useColoringMediums', () => ({
  useColoringMediums: () => ({
    data: { items: mediumsMock.current },
    isLoading: mediumsLoadingMock.current,
  }),
}));

vi.mock('@/services/pocketbase/coloring.service', () => ({
  ColoringService: {
    getPagePhotoUrls: getPagePhotoUrlsMock,
  },
}));

import { useColoringPageDetailData } from '../useColoringPageDetailData';

const makePage = (overrides: Partial<ColoringPageDTO> = {}): ColoringPageDTO => ({
  id: 'page-2',
  bookId: 'book-1',
  pageNumber: 2,
  status: 'not_started',
  photos: [],
  mediumIds: [],
  revealedSubject: '',
  revealedAt: '',
  startedAt: '',
  completedAt: '',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  ...overrides,
});

describe('useColoringPageDetailData', () => {
  beforeEach(() => {
    bookMock.current = {
      id: 'book-1',
      userId: 'user-1',
      title: 'Mystery Worlds',
      publisherId: '',
      illustratorId: '',
      series: '',
      theme: '',
      isbn: '',
      coverImage: '',
      isMystery: true,
      status: 'purchased',
      totalPages: 3,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    } as ColoringBookDTO;
    pageMock.current = makePage({ photos: ['main.jpg', 'detail.jpg'] });
    pagesMock.current = [
      makePage({ id: 'page-1', pageNumber: 1 }),
      pageMock.current,
      makePage({ id: 'page-3', pageNumber: 3 }),
    ];
    mediumsMock.current = [
      {
        id: 'medium-1',
        userId: 'user-1',
        name: 'Prismacolor',
        type: 'colored_pencil',
        brand: 'Prismacolor',
        colorCount: 72,
        notes: '',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ];
    bookLoadingMock.current = false;
    bookErrorMock.current = null;
    pageLoadingMock.current = false;
    pageErrorMock.current = null;
    pagesErrorMock.current = null;
    pagesRefetchMock.mockReset().mockResolvedValue({ isError: false });
    mediumsLoadingMock.current = false;
    getPagePhotoUrlsMock.mockReset().mockReturnValue(['/files/main.jpg', '/files/detail.jpg']);
  });

  it('derives previous and next pages from the book page list', () => {
    const { result } = renderHook(() =>
      useColoringPageDetailData({ bookId: 'book-1', pageId: 'page-2', userId: 'user-1' })
    );

    expect(result.current.previousPage?.id).toBe('page-1');
    expect(result.current.nextPage?.id).toBe('page-3');
  });

  it('treats a page from another book as not found', () => {
    pageMock.current = makePage({ id: 'page-from-book-2', bookId: 'book-2' });

    const { result } = renderHook(() =>
      useColoringPageDetailData({ bookId: 'book-1', pageId: 'page-from-book-2', userId: 'user-1' })
    );

    expect(result.current.page).toBeUndefined();
    expect(result.current.previousPage).toBeNull();
    expect(result.current.nextPage).toBeNull();
  });

  it('keeps full list-seeded page data available when its detail refresh fails', () => {
    pageErrorMock.current = new Error('Detail unavailable');

    const { result } = renderHook(() =>
      useColoringPageDetailData({ bookId: 'book-1', pageId: 'page-2', userId: 'user-1' })
    );

    expect(result.current.page).toBe(pageMock.current);
    expect(result.current.error).toBe(pageErrorMock.current);
  });

  it.each([
    ['permission', 'server', 'page'],
    ['auth', 'server', 'page'],
    ['not_found', 'server', 'page'],
    ['server', 'permission', 'book'],
    ['server', 'auth', 'book'],
    ['server', 'not_found', 'book'],
    ['permission', 'not_found', 'page'],
    ['server', 'network', 'page'],
    ['validation', 'server', 'book'],
    ['validation', 'network', 'book'],
    ['server', 'validation', 'page'],
    ['validation', 'validation', 'page'],
  ] as const)(
    'chooses %s page and %s book failures with %s precedence',
    (pageType, bookType, source) => {
      const pageError = {
        type: pageType,
        message: 'Page failed',
        retryable: pageType === 'server',
      };
      const bookError = {
        type: bookType,
        message: 'Book failed',
        retryable: bookType === 'server' || bookType === 'network',
      };
      pageErrorMock.current = pageError;
      bookErrorMock.current = bookError;

      const { result } = renderHook(() =>
        useColoringPageDetailData({ bookId: 'book-1', pageId: 'page-2', userId: 'user-1' })
      );

      expect(result.current.book).toBe(bookMock.current);
      expect(result.current.page).toBe(pageMock.current);
      expect(result.current.error).toBe(source === 'page' ? pageError : bookError);
    }
  );

  it('keeps neighbor links while exposing a page-list refresh failure and retry', async () => {
    pagesErrorMock.current = new Error('Navigation unavailable');

    const { result } = renderHook(() =>
      useColoringPageDetailData({ bookId: 'book-1', pageId: 'page-2', userId: 'user-1' })
    );

    expect(result.current.previousPage?.id).toBe('page-1');
    expect(result.current.nextPage?.id).toBe('page-3');
    expect(result.current.pagesError).toBe(pagesErrorMock.current);
    await result.current.retryPages();
    expect(pagesRefetchMock).toHaveBeenCalledOnce();
  });

  it.each(['auth', 'permission', 'not_found'])(
    'prioritizes a %s page-list denial over a retryable detail refresh',
    type => {
      pageErrorMock.current = { type: 'server', message: 'Page refresh failed', retryable: true };
      pagesErrorMock.current = { type, message: 'Page list denied', retryable: false };

      const { result } = renderHook(() =>
        useColoringPageDetailData({ bookId: 'book-1', pageId: 'page-2', userId: 'user-1' })
      );

      expect(result.current.page).toBe(pageMock.current);
      expect(result.current.error).toBe(pagesErrorMock.current);
    }
  );

  it('computes page photo URLs', () => {
    const { result } = renderHook(() =>
      useColoringPageDetailData({ bookId: 'book-1', pageId: 'page-2', userId: 'user-1' })
    );

    expect(getPagePhotoUrlsMock).toHaveBeenCalledWith(pageMock.current);
    expect(result.current.pagePhotoUrls).toEqual(['/files/main.jpg', '/files/detail.jpg']);
  });

  it('returns medium loading and list state', () => {
    mediumsLoadingMock.current = true;

    const { result } = renderHook(() =>
      useColoringPageDetailData({ bookId: 'book-1', pageId: 'page-2', userId: 'user-1' })
    );

    expect(result.current.isMediumsLoading).toBe(true);
    expect(result.current.mediums).toEqual(mediumsMock.current);
  });
});
