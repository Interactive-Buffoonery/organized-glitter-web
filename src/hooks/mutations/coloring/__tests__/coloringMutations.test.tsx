import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const {
  captureMock,
  coloringMock,
  coloringTagsMock,
  notifyMock,
  pageProgressNotesMock,
  publishersMock,
  illustratorsMock,
} = vi.hoisted(() => ({
  captureMock: vi.fn(),
  coloringMock: {
    createBook: vi.fn(),
    updateBook: vi.fn(),
    createBookWithTags: vi.fn(),
    updateBookWithTags: vi.fn(),
    deleteBook: vi.fn(),
    getBookById: vi.fn(),
    getPageById: vi.fn(),
    listPages: vi.fn(),
    updatePage: vi.fn(),
    setMainPagePhoto: vi.fn(),
  },
  coloringTagsMock: {
    deleteColoringTag: vi.fn(),
  },
  notifyMock: vi.fn(),
  pageProgressNotesMock: {
    create: vi.fn(),
    updateContent: vi.fn(),
    delete: vi.fn(),
    removeImage: vi.fn(),
  },
  publishersMock: { createIfNotExists: vi.fn() },
  illustratorsMock: { createIfNotExists: vi.fn() },
}));

vi.mock('../../../../services/pocketbase/coloring.service', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../../../services/pocketbase/coloring.service')>();
  return { ...actual, ColoringService: coloringMock };
});

vi.mock('../../../../services/pocketbase/coloringTags.service', () => ({
  ColoringTagService: coloringTagsMock,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/lib/notifications', () => ({
  notify: notifyMock,
}));

vi.mock('../../../../services/pocketbase/bookPublishers.service', () => ({
  BookPublishersService: publishersMock,
}));

vi.mock('../../../../services/pocketbase/bookIllustrators.service', () => ({
  BookIllustratorsService: illustratorsMock,
}));

vi.mock('../../../../services/pocketbase/coloringPageProgressNotes.service', () => ({
  ColoringPageProgressNotesService: pageProgressNotesMock,
}));

vi.mock('@/hooks/useUserTimezone', () => ({
  useUserTimezone: () => 'UTC',
}));

vi.mock('../../../../services/analytics-escape-hatch', () => ({
  capture: captureMock,
}));

import { queryKeys } from '../../../queries/queryKeys';
import { useCreateColoringBook } from '../useCreateColoringBook';
import { useUpdateColoringBook } from '../useUpdateColoringBook';
import { useDeleteColoringBook } from '../useDeleteColoringBook';
import { useColoringBook } from '../../../queries/coloring/useColoringBook';
import { useColoringPages } from '../../../queries/coloring/useColoringPages';
import { useColoringPage } from '../../../queries/coloring/useColoringPage';
import type {
  ColoringBookDTO,
  ColoringPageDTO,
} from '../../../../services/pocketbase/coloring.service';

const book: ColoringBookDTO = {
  id: 'book-1',
  userId: 'user-1',
  title: 'Book',
  publisherId: '',
  illustratorId: '',
  series: '',
  theme: '',
  isbn: '',
  publicationYear: undefined,
  edition: '',
  language: '',
  sourceUrl: '',
  datePurchased: '',
  dateReceived: '',
  dateStarted: '',
  dateCompleted: '',
  bookFormat: '',
  notes: '',
  coverImage: '',
  isMystery: false,
  status: 'purchased',
  totalPages: 20,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

const page: ColoringPageDTO = {
  id: 'page-1',
  bookId: 'book-1',
  pageNumber: 1,
  status: 'not_started',
  photos: [],
  mediumIds: [],
  revealedSubject: '',
  revealedAt: '',
  startedAt: '',
  completedAt: '',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

describe('coloring mutation hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureMock.mockReset();
    window.localStorage?.clear?.();
  });

  it('refreshes every cached coloring Stats projection after creating a book', async () => {
    const client = makeClient();
    const coloringKeys = [
      queryKeys.stats.overview('user-1'),
      queryKeys.stats.coloringSummary('user-1', 2025),
      queryKeys.stats.coloringCompletionsByMonth('user-1', 2025),
      queryKeys.stats.coloringCompletionsYearly('user-1'),
      queryKeys.stats.coloringCompletionTimes('user-1'),
      queryKeys.stats.coloringCollection('user-1'),
    ];
    const diamondKey = queryKeys.stats.summary('user-1', 2025);
    const reads = [...coloringKeys, diamondKey].map(() =>
      vi.fn().mockResolvedValue({ fresh: true })
    );
    await Promise.all(
      [...coloringKeys, diamondKey].map((queryKey, index) =>
        client.fetchQuery({ queryKey, queryFn: reads[index], staleTime: Infinity })
      )
    );
    coloringMock.createBookWithTags.mockResolvedValue({ book });

    const { result } = renderHook(() => useCreateColoringBook(), { wrapper: makeWrapper(client) });
    await act(async () => {
      await result.current.mutateAsync({ input: { title: 'Book' }, tagIds: [] });
    });

    await Promise.all(
      [...coloringKeys, diamondKey].map((queryKey, index) =>
        client.fetchQuery({ queryKey, queryFn: reads[index], staleTime: Infinity })
      )
    );

    coloringKeys.forEach((_, index) => expect(reads[index]).toHaveBeenCalledTimes(2));
    expect(reads[coloringKeys.length]).toHaveBeenCalledTimes(1);
  });

  it('refetches books and pages when a batched coloring book update fails', async () => {
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    coloringMock.updateBookWithTags.mockRejectedValue(new Error('Reduction interrupted'));
    const { result } = renderHook(() => useUpdateColoringBook(), { wrapper: makeWrapper(client) });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          bookId: book.id,
          patch: { total_pages: 100 },
        })
      ).rejects.toThrow('Reduction interrupted');
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.coloring.books.all });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.coloring.books.detail(book.id),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.coloring.pages.all });
  });

  it('does not refetch deleted books or pages while the detail view is still mounted', async () => {
    const client = makeClient();
    coloringMock.getBookById.mockResolvedValue(book);
    coloringMock.getPageById.mockResolvedValue(page);
    coloringMock.listPages.mockResolvedValue({ items: [page], totalItems: 1 });
    coloringMock.deleteBook.mockResolvedValue(undefined);
    const otherPage = { ...page, id: 'other-page', bookId: 'other-book' };
    client.setQueryData(queryKeys.coloring.pages.detail(otherPage.id), otherPage);
    const { result, rerender } = renderHook(
      () => ({
        book: useColoringBook(book.id),
        pages: useColoringPages({ bookId: book.id }),
        page: useColoringPage(page.id),
        deleteBook: useDeleteColoringBook(),
      }),
      { wrapper: makeWrapper(client) }
    );
    await waitFor(() => {
      expect(result.current.book.data).toEqual(book);
      expect(result.current.pages.data?.items).toEqual([page]);
      expect(result.current.page.data).toEqual(page);
    });
    coloringMock.getBookById.mockClear();
    coloringMock.listPages.mockClear();
    coloringMock.getPageById.mockClear();

    await act(async () => {
      await result.current.deleteBook.mutateAsync(book.id);
    });
    rerender();

    expect(coloringMock.getBookById).not.toHaveBeenCalled();
    expect(coloringMock.listPages).not.toHaveBeenCalled();
    expect(coloringMock.getPageById).not.toHaveBeenCalled();
    expect(result.current.pages.data?.items).toEqual([]);
    expect(result.current.page.data).toBeNull();
    expect(client.getQueryData(queryKeys.coloring.pages.detail(page.id))).toBeNull();
    expect(client.getQueryData(queryKeys.coloring.pages.detail(otherPage.id))).toEqual(otherPage);
  });

  it.each(['analytics', 'cache'] as const)(
    'keeps a confirmed coloring-book deletion successful when %s follow-up throws',
    async failure => {
      const client = makeClient();
      coloringMock.deleteBook.mockResolvedValue(undefined);
      if (failure === 'analytics') {
        captureMock.mockImplementationOnce(() => {
          throw new Error('Analytics unavailable');
        });
      } else {
        vi.spyOn(client, 'invalidateQueries').mockImplementationOnce(() => {
          throw new Error('Cache unavailable');
        });
      }
      const { result } = renderHook(() => useDeleteColoringBook(), {
        wrapper: makeWrapper(client),
      });

      await act(async () => {
        await expect(result.current.mutateAsync(book.id)).resolves.toBeUndefined();
      });
      expect(coloringMock.deleteBook).toHaveBeenCalledExactlyOnceWith(book.id);
    }
  );
});
