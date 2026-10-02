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
import { useUpdateColoringPage } from '../useUpdateColoringPage';
import { useCreateBookPublisher } from '../useCreateBookPublisher';
import { useCreateBookIllustrator } from '../useCreateBookIllustrator';
import { useDeleteColoringTag } from '../useDeleteColoringTag';
import {
  useAddColoringPageProgressNoteMutation,
  useDeleteColoringPageProgressNoteImageMutation,
  useDeleteColoringPageProgressNoteMutation,
  useUpdateColoringPageProgressNoteMutation,
} from '../useColoringPageProgressNotes';
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

  it('creates a coloring book and invalidates book lists', async () => {
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    coloringMock.createBookWithTags.mockResolvedValue({ book });
    const { result } = renderHook(() => useCreateColoringBook(), { wrapper: makeWrapper(client) });

    await act(async () => {
      await result.current.mutateAsync({ input: { title: 'Book' }, tagIds: [] });
    });

    expect(coloringMock.createBookWithTags).toHaveBeenCalledWith({ title: 'Book' }, []);
    expect(client.getQueryData(queryKeys.coloring.books.detail(book.id))).toEqual(book);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.coloring.books.all });
    expect(captureMock).toHaveBeenCalledWith(
      'coloring_book_created',
      expect.objectContaining({
        craft: 'coloring',
        surface: 'new_coloring_book',
        status: 'purchased',
        total_pages_bucket: '1-25',
        has_notes: false,
      })
    );
    expect(captureMock).toHaveBeenCalledWith(
      'first_coloring_book_created',
      expect.objectContaining({
        craft: 'coloring',
        entity_type: 'coloring_book',
        source_surface: 'new_coloring_book',
        total_pages_bucket: '1-25',
        is_mystery: false,
      })
    );
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

  it('still caches the book and fires create analytics when tag sync fails', async () => {
    const client = makeClient();
    coloringMock.createBookWithTags.mockResolvedValue({
      book,
      tagSyncError: new Error('tags exploded'),
    });
    const { result } = renderHook(() => useCreateColoringBook(), { wrapper: makeWrapper(client) });

    let outcome: { book: ColoringBookDTO; tagSyncError?: Error } | undefined;
    await act(async () => {
      outcome = await result.current.mutateAsync({ input: { title: 'Book' }, tagIds: ['tag-1'] });
    });

    expect(outcome?.book).toEqual(book);
    expect(outcome?.tagSyncError).toBeInstanceOf(Error);
    expect(client.getQueryData(queryKeys.coloring.books.detail(book.id))).toEqual(book);
    expect(captureMock).toHaveBeenCalledWith('coloring_book_created', expect.any(Object));
  });

  it('keeps a confirmed create successful when cache writes throw', async () => {
    const client = makeClient();
    vi.spyOn(client, 'setQueryData').mockImplementation(() => {
      throw new Error('cache unavailable');
    });
    coloringMock.createBookWithTags.mockResolvedValue({ book });
    const { result } = renderHook(() => useCreateColoringBook(), { wrapper: makeWrapper(client) });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ input: { title: 'Book' }, tagIds: [] })
      ).resolves.toEqual({ book });
    });

    expect(coloringMock.createBookWithTags).toHaveBeenCalledTimes(1);
  });

  it('keeps a confirmed create successful when analytics throws', async () => {
    const client = makeClient();
    captureMock.mockImplementation(() => {
      throw new Error('analytics unavailable');
    });
    coloringMock.createBookWithTags.mockResolvedValue({ book });
    const { result } = renderHook(() => useCreateColoringBook(), { wrapper: makeWrapper(client) });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ input: { title: 'Book' }, tagIds: [] })
      ).resolves.toEqual({ book });
    });

    expect(coloringMock.createBookWithTags).toHaveBeenCalledTimes(1);
  });

  it('updates a coloring book and invalidates book keys', async () => {
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    client.setQueryData(queryKeys.coloring.books.detail(book.id), book);
    coloringMock.updateBookWithTags.mockResolvedValue({ book: { ...book, title: 'Updated' } });
    const { result } = renderHook(() => useUpdateColoringBook(), { wrapper: makeWrapper(client) });

    await act(async () => {
      await result.current.mutateAsync({
        bookId: book.id,
        patch: { title: 'Updated' },
        tagIds: [],
      });
    });

    expect(coloringMock.updateBookWithTags).toHaveBeenCalledWith(book.id, { title: 'Updated' }, []);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.coloring.books.all });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.coloring.books.detail(book.id),
    });
    expect(captureMock).toHaveBeenCalledWith(
      'coloring_book_updated',
      expect.objectContaining({
        craft: 'coloring',
        surface: 'coloring_book_detail',
        status: 'purchased',
        changed_field_count: 1,
      })
    );
  });

  it('keeps a confirmed update successful when cache work throws', async () => {
    const client = makeClient();
    const onConfirmedSave = vi.fn();
    vi.spyOn(client, 'setQueryData').mockImplementation(() => {
      throw new Error('cache unavailable');
    });
    coloringMock.updateBookWithTags.mockImplementation(
      async (_bookId, _patch, _tags, confirmed) => {
        confirmed?.();
        return { book };
      }
    );
    const { result } = renderHook(() => useUpdateColoringBook(), { wrapper: makeWrapper(client) });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          bookId: book.id,
          patch: { title: 'Updated' },
          onConfirmedSave,
        })
      ).resolves.toEqual({ book });
    });

    expect(onConfirmedSave).toHaveBeenCalledOnce();
    expect(coloringMock.updateBookWithTags).toHaveBeenCalledOnce();
  });

  it('keeps a confirmed update successful when Stats invalidation throws', async () => {
    const client = makeClient();
    vi.spyOn(client, 'invalidateQueries').mockImplementation(() => {
      throw new Error('stats cache unavailable');
    });
    coloringMock.updateBookWithTags.mockResolvedValue({ book });
    const { result } = renderHook(() => useUpdateColoringBook(), { wrapper: makeWrapper(client) });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ bookId: book.id, patch: { title: 'Updated' } })
      ).resolves.toEqual({ book });
    });

    expect(coloringMock.updateBookWithTags).toHaveBeenCalledOnce();
  });

  it('keeps a confirmed update successful when analytics throws', async () => {
    const client = makeClient();
    captureMock.mockImplementation(() => {
      throw new Error('analytics unavailable');
    });
    coloringMock.updateBookWithTags.mockResolvedValue({ book });
    const { result } = renderHook(() => useUpdateColoringBook(), { wrapper: makeWrapper(client) });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ bookId: book.id, patch: { status: 'completed' } })
      ).resolves.toEqual({ book });
    });

    expect(coloringMock.updateBookWithTags).toHaveBeenCalledOnce();
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

  it('captures coloring book status changes with previous status', async () => {
    const client = makeClient();
    client.setQueryData(queryKeys.coloring.books.detail(book.id), book);
    coloringMock.updateBookWithTags.mockResolvedValue({ book: { ...book, status: 'completed' } });
    const { result } = renderHook(() => useUpdateColoringBook(), { wrapper: makeWrapper(client) });

    await act(async () => {
      await result.current.mutateAsync({
        bookId: book.id,
        patch: { status: 'completed' },
        tagIds: [],
      });
    });

    expect(captureMock).toHaveBeenCalledWith(
      'coloring_book_status_changed',
      expect.objectContaining({
        craft: 'coloring',
        surface: 'coloring_book_detail',
        previous_status: 'purchased',
        status: 'completed',
      })
    );
  });

  it('deletes a coloring book and invalidates book and page keys', async () => {
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const removeSpy = vi.spyOn(client, 'removeQueries');
    coloringMock.deleteBook.mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteColoringBook(), { wrapper: makeWrapper(client) });

    await act(async () => {
      await result.current.mutateAsync(book.id);
    });

    expect(coloringMock.deleteBook).toHaveBeenCalledWith(book.id);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.coloring.books.all });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.coloring.books.detail(book.id),
    });
    expect(removeSpy).toHaveBeenCalledWith({ queryKey: queryKeys.coloring.books.detail(book.id) });
    expect(removeSpy).toHaveBeenCalledWith({ queryKey: queryKeys.coloring.pages.all });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.coloring.pages.all });
    expect(captureMock).toHaveBeenCalledWith('coloring_book_deleted', {
      craft: 'coloring',
      surface: 'coloring_book_detail',
      had_cached_book: false,
    });
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

  it('optimistically updates coloring page status and refreshes book progress keys', async () => {
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    client.setQueryData(queryKeys.coloring.pages.detail(page.id), page);
    let resolveUpdate: (value: ColoringPageDTO) => void = () => undefined;
    coloringMock.updatePage.mockReturnValue(
      new Promise<ColoringPageDTO>(resolve => {
        resolveUpdate = resolve;
      })
    );
    const { result } = renderHook(() => useUpdateColoringPage(), { wrapper: makeWrapper(client) });

    act(() => {
      result.current.mutate({
        pageId: page.id,
        command: { type: 'set-status', status: 'completed' },
      });
    });

    await waitFor(() => {
      expect(
        client.getQueryData<ColoringPageDTO>(queryKeys.coloring.pages.detail(page.id))?.status
      ).toBe('completed');
    });

    await act(async () => {
      resolveUpdate({ ...page, status: 'completed', completedAt: '2026-04-27' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.coloring.pages.all });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.coloring.pages.detail(page.id),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.coloring.books.detail(book.id),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.coloring.books.lists() });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: queryKeys.coloring.books.all });
    expect(captureMock).toHaveBeenCalledWith(
      'coloring_page_status_changed',
      expect.objectContaining({
        craft: 'coloring',
        surface: 'coloring_page_detail',
        previous_status: 'not_started',
        status: 'completed',
      })
    );
  });

  it('updates coloring page mediums without refreshing book progress keys', async () => {
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    client.setQueryData(queryKeys.coloring.pages.detail(page.id), page);
    coloringMock.updatePage.mockResolvedValue({ ...page, mediumIds: ['medium-1'] });
    const { result } = renderHook(() => useUpdateColoringPage(), { wrapper: makeWrapper(client) });

    await act(async () => {
      await result.current.mutateAsync({
        pageId: page.id,
        command: { type: 'set-mediums', mediumIds: ['medium-1'] },
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.coloring.pages.all });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.coloring.pages.detail(page.id),
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: queryKeys.coloring.books.detail(book.id),
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: queryKeys.coloring.books.lists() });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: queryKeys.coloring.books.all });
  });

  it('keeps a confirmed page update successful when cache refresh throws', async () => {
    const client = makeClient();
    coloringMock.updatePage.mockResolvedValue({ ...page, mediumIds: ['medium-1'] });
    vi.spyOn(client, 'invalidateQueries').mockImplementation(() => {
      throw new Error('cache unavailable');
    });
    const { result } = renderHook(() => useUpdateColoringPage(), { wrapper: makeWrapper(client) });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          pageId: page.id,
          command: { type: 'set-mediums', mediumIds: ['medium-1'] },
        })
      ).resolves.toMatchObject({ mediumIds: ['medium-1'] });
    });

    expect(client.getQueryData(queryKeys.coloring.pages.detail(page.id))).toMatchObject({
      mediumIds: ['medium-1'],
    });
  });

  it('optimistically updates coloring page lifecycle dates', async () => {
    const client = makeClient();
    client.setQueryData(queryKeys.coloring.pages.detail(page.id), page);
    coloringMock.updatePage.mockResolvedValue({
      ...page,
      startedAt: '2026-04-01',
    });
    const { result } = renderHook(() => useUpdateColoringPage(), { wrapper: makeWrapper(client) });

    await act(async () => {
      await result.current.mutateAsync({
        pageId: page.id,
        command: { type: 'set-started-date', startedAt: '2026-04-01' },
      });
    });

    expect(coloringMock.updatePage).toHaveBeenCalledWith(page.id, {
      started_at: '2026-04-01',
    });
    expect(client.getQueryData(queryKeys.coloring.pages.detail(page.id))).toEqual(
      expect.objectContaining({
        startedAt: '2026-04-01',
      })
    );
  });

  it('lets the server preserve an archived status when a completion date changes', async () => {
    const client = makeClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    client.setQueryData(queryKeys.coloring.pages.detail(page.id), page);
    coloringMock.updatePage.mockResolvedValue({
      ...page,
      status: 'archived',
      completedAt: '2026-04-20',
    });
    const { result } = renderHook(() => useUpdateColoringPage(), { wrapper: makeWrapper(client) });

    await act(async () => {
      await result.current.mutateAsync({
        pageId: page.id,
        command: { type: 'set-completed-date', completedAt: '2026-04-20' },
      });
    });

    expect(coloringMock.updatePage).toHaveBeenCalledWith(page.id, {
      completed_at: '2026-04-20',
    });
    expect(client.getQueryData(queryKeys.coloring.pages.detail(page.id))).toMatchObject({
      status: 'archived',
    });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: queryKeys.stats.all });
  });

  it('rejects impossible coloring page lifecycle dates before writing', async () => {
    const client = makeClient();
    client.setQueryData(queryKeys.coloring.pages.detail(page.id), {
      ...page,
      startedAt: '2026-04-10',
    });
    const { result } = renderHook(() => useUpdateColoringPage(), { wrapper: makeWrapper(client) });

    await expect(
      result.current.mutateAsync({
        pageId: page.id,
        command: { type: 'set-completed-date', completedAt: '2026-04-01' },
      })
    ).rejects.toThrow('Completed date cannot be before started date.');

    expect(coloringMock.updatePage).not.toHaveBeenCalled();
  });

  it('passes completed status changes without adding a completion date patch', async () => {
    const client = makeClient();
    coloringMock.updatePage.mockResolvedValue({ ...page, status: 'completed' });
    const { result } = renderHook(() => useUpdateColoringPage(), { wrapper: makeWrapper(client) });

    await act(async () => {
      await result.current.mutateAsync({
        pageId: page.id,
        command: { type: 'set-status', status: 'completed' },
      });
    });

    expect(coloringMock.updatePage).toHaveBeenCalledWith(page.id, { status: 'completed' });
  });

  it('passes status changes away from completed without clearing the completion date', async () => {
    const client = makeClient();
    const completedPage = {
      ...page,
      status: 'completed' as const,
      completedAt: '2026-04-27',
    };
    client.setQueryData(queryKeys.coloring.pages.detail(page.id), completedPage);
    coloringMock.updatePage.mockResolvedValue({
      ...completedPage,
      status: 'in_progress',
    });
    const { result } = renderHook(() => useUpdateColoringPage(), { wrapper: makeWrapper(client) });

    await act(async () => {
      await result.current.mutateAsync({
        pageId: page.id,
        command: { type: 'set-status', status: 'in_progress' },
      });
    });

    expect(coloringMock.updatePage).toHaveBeenCalledWith(page.id, { status: 'in_progress' });
  });

  it('captures coloring page photo additions', async () => {
    const client = makeClient();
    client.setQueryData(queryKeys.coloring.pages.detail(page.id), page);
    coloringMock.updatePage.mockResolvedValue({ ...page, photos: ['after.jpg'] });
    const { result } = renderHook(() => useUpdateColoringPage(), { wrapper: makeWrapper(client) });

    await act(async () => {
      await result.current.mutateAsync({
        pageId: page.id,
        command: {
          type: 'add-photos',
          files: [new File(['after'], 'after.jpg')],
        },
      });
    });

    expect(captureMock).toHaveBeenCalledWith(
      'coloring_page_photo_added',
      expect.objectContaining({
        craft: 'coloring',
        surface: 'coloring_page_detail',
        photo_count: 1,
        photo_delta: 1,
      })
    );
    expect(captureMock).toHaveBeenCalledWith(
      'first_photo_added',
      expect.objectContaining({
        craft: 'coloring',
        entity_type: 'coloring_page_photo',
        source_surface: 'coloring_page_detail',
        photo_delta: 1,
      })
    );
  });

  it('sets the main photo through the server-side reorder command', async () => {
    const client = makeClient();
    const pageWithPhotos = { ...page, photos: ['main.jpg', 'detail.jpg'] };
    const reorderedPage = { ...pageWithPhotos, photos: ['detail.jpg', 'main.jpg'] };
    client.setQueryData(queryKeys.coloring.pages.detail(page.id), pageWithPhotos);
    coloringMock.setMainPagePhoto.mockResolvedValue(reorderedPage);
    const { result } = renderHook(() => useUpdateColoringPage(), { wrapper: makeWrapper(client) });

    await act(async () => {
      await result.current.mutateAsync({
        pageId: page.id,
        command: {
          type: 'set-main-photo',
          filename: 'detail.jpg',
        },
      });
    });

    expect(coloringMock.setMainPagePhoto).toHaveBeenCalledWith(page.id, 'detail.jpg');
    expect(coloringMock.updatePage).not.toHaveBeenCalled();
    expect(client.getQueryData(queryKeys.coloring.pages.detail(page.id))).toEqual(reorderedPage);
  });

  it('creates coloring page progress notes and invalidates page note keys', async () => {
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    pageProgressNotesMock.create.mockResolvedValue({
      id: 'note-1',
      pageId: page.id,
      content: 'Started shading',
      date: '2026-05-06',
      createdAt: '2026-05-06',
      updatedAt: '2026-05-06',
    });
    const { result } = renderHook(() => useAddColoringPageProgressNoteMutation(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        pageId: page.id,
        noteData: {
          date: '2026-05-06',
          content: 'Started shading',
        },
      });
    });

    expect(pageProgressNotesMock.create).toHaveBeenCalledWith({
      page: page.id,
      date: '2026-05-06',
      content: 'Started shading',
      imageFile: undefined,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.coloring.pageProgressNotes.list(page.id),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.coloring.pages.detail(page.id),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.notesFeed.all,
    });
    expect(captureMock).toHaveBeenCalledWith('coloring_page_progress_note_added');
    expect(captureMock).toHaveBeenCalledWith(
      'first_progress_note_added',
      expect.objectContaining({
        craft: 'coloring',
        entity_type: 'coloring_page_progress_note',
        source_surface: 'coloring_page_detail',
        has_photo: false,
      })
    );
  });

  it('keeps a confirmed progress note save successful when cache refresh fails', async () => {
    const client = makeClient();
    vi.spyOn(client, 'invalidateQueries').mockRejectedValue(new Error('Refresh failed'));
    const savedNote = { id: 'note-1' };
    pageProgressNotesMock.create.mockResolvedValue(savedNote);
    const { result } = renderHook(() => useAddColoringPageProgressNoteMutation(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          pageId: page.id,
          noteData: { date: '2026-05-06', content: 'Started shading' },
        })
      ).resolves.toEqual(savedNote);
    });

    expect(pageProgressNotesMock.create).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' }));
  });

  it('keeps a confirmed progress note update successful when cache refresh fails', async () => {
    const client = makeClient();
    vi.spyOn(client, 'invalidateQueries').mockRejectedValue(new Error('Refresh failed'));
    const savedNote = { id: 'note-1' };
    pageProgressNotesMock.updateContent.mockResolvedValue(savedNote);
    const { result } = renderHook(() => useUpdateColoringPageProgressNoteMutation(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          noteId: 'note-1',
          pageId: page.id,
          content: 'Updated shading',
        })
      ).resolves.toEqual(savedNote);
    });

    expect(pageProgressNotesMock.updateContent).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' }));
  });

  it('keeps a confirmed progress note deletion successful when cache refresh fails', async () => {
    const client = makeClient();
    vi.spyOn(client, 'invalidateQueries').mockRejectedValue(new Error('Refresh failed'));
    pageProgressNotesMock.delete.mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteColoringPageProgressNoteMutation(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ noteId: 'note-1', pageId: page.id })
      ).resolves.toBeUndefined();
    });

    expect(pageProgressNotesMock.delete).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' }));
  });

  it('keeps a confirmed image removal successful when cache refresh fails', async () => {
    const client = makeClient();
    vi.spyOn(client, 'invalidateQueries').mockRejectedValue(new Error('Refresh failed'));
    pageProgressNotesMock.removeImage.mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteColoringPageProgressNoteImageMutation(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ noteId: 'note-1', pageId: page.id })
      ).resolves.toBeUndefined();
    });

    expect(pageProgressNotesMock.removeImage).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' }));
  });

  it('keeps Overview cached after editing coloring note content', async () => {
    const client = makeClient();
    const key = queryKeys.stats.overview('user-1');
    const readOverview = vi.fn().mockResolvedValue({ items: [] });
    await client.fetchQuery({ queryKey: key, queryFn: readOverview, staleTime: Infinity });
    pageProgressNotesMock.updateContent.mockResolvedValue({ id: 'note-1' });
    const { result } = renderHook(() => useUpdateColoringPageProgressNoteMutation(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        noteId: 'note-1',
        pageId: page.id,
        content: 'Updated shading',
      });
    });
    await client.fetchQuery({ queryKey: key, queryFn: readOverview, staleTime: Infinity });

    expect(readOverview).toHaveBeenCalledTimes(1);
  });

  it('keeps Overview cached after removing a coloring note image', async () => {
    const client = makeClient();
    const key = queryKeys.stats.overview('user-1');
    const readOverview = vi.fn().mockResolvedValue({ items: [] });
    await client.fetchQuery({ queryKey: key, queryFn: readOverview, staleTime: Infinity });
    pageProgressNotesMock.removeImage.mockResolvedValue({ id: 'note-1' });
    const { result } = renderHook(() => useDeleteColoringPageProgressNoteImageMutation(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ noteId: 'note-1', pageId: page.id });
    });
    await client.fetchQuery({ queryKey: key, queryFn: readOverview, staleTime: Infinity });

    expect(readOverview).toHaveBeenCalledTimes(1);
  });

  it('reveals a mystery page and updates page cache', async () => {
    const client = makeClient();
    client.setQueryData(queryKeys.coloring.pages.detail(page.id), page);
    coloringMock.updatePage.mockResolvedValue({ ...page, revealedSubject: 'Dragon' });
    const { result } = renderHook(() => useUpdateColoringPage(), { wrapper: makeWrapper(client) });

    await act(async () => {
      await result.current.mutateAsync({
        pageId: page.id,
        command: {
          type: 'reveal-mystery',
          revealedSubject: 'Dragon',
          revealedAt: '2026-05-17T16:20:00.000Z',
        },
      });
    });

    expect(coloringMock.updatePage).toHaveBeenCalledWith(
      page.id,
      expect.objectContaining({ revealed_subject: 'Dragon', revealed_at: expect.any(String) })
    );
    expect(client.getQueryData(queryKeys.coloring.pages.detail(page.id))).toEqual({
      ...page,
      revealedSubject: 'Dragon',
    });
    expect(captureMock).toHaveBeenCalledWith(
      'coloring_mystery_page_revealed',
      expect.objectContaining({
        craft: 'coloring',
        surface: 'coloring_page_detail',
        is_revealed: true,
      })
    );
  });

  it('marks a mystery page unrevealed without tracking a reveal event', async () => {
    const client = makeClient();
    const revealedPage = {
      ...page,
      revealedSubject: 'Dragon',
      revealedAt: '2026-05-17T16:20:00.000Z',
    };
    client.setQueryData(queryKeys.coloring.pages.detail(page.id), revealedPage);
    coloringMock.updatePage.mockResolvedValue({
      ...revealedPage,
      revealedSubject: '',
      revealedAt: '',
    });
    const { result } = renderHook(() => useUpdateColoringPage(), { wrapper: makeWrapper(client) });

    await act(async () => {
      await result.current.mutateAsync({
        pageId: page.id,
        command: { type: 'clear-mystery-reveal' },
      });
    });

    expect(coloringMock.updatePage).toHaveBeenCalledWith(page.id, {
      revealed_subject: '',
      revealed_at: '',
    });
    expect(client.getQueryData(queryKeys.coloring.pages.detail(page.id))).toEqual({
      ...revealedPage,
      revealedSubject: '',
      revealedAt: '',
    });
    expect(captureMock).not.toHaveBeenCalledWith(
      'coloring_mystery_page_revealed',
      expect.anything()
    );
  });

  it('deletes a coloring tag and invalidates all coloring tag caches', async () => {
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    coloringTagsMock.deleteColoringTag.mockResolvedValue({ status: 'success', data: undefined });
    const { result } = renderHook(() => useDeleteColoringTag(), { wrapper: makeWrapper(client) });

    await act(async () => {
      await result.current.mutateAsync({ id: 'tag-1', name: 'Cozy' });
    });

    expect(coloringTagsMock.deleteColoringTag).toHaveBeenCalledWith('tag-1');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.coloring.tags.all });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.coloring.books.all });
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'success',
        title: 'Coloring tag deleted',
      })
    );
  });

  it('creates a book publisher and invalidates publisher lists', async () => {
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    publishersMock.createIfNotExists.mockResolvedValue({ id: 'pub-1', name: 'Pub' });
    const { result } = renderHook(() => useCreateBookPublisher(), { wrapper: makeWrapper(client) });

    await act(async () => {
      await result.current.mutateAsync({ name: 'Pub' });
    });

    expect(publishersMock.createIfNotExists).toHaveBeenCalledWith({ name: 'Pub' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.coloring.publishers.all });
    expect(captureMock).toHaveBeenCalledWith('book_publisher_created', {
      craft: 'coloring',
      surface: 'coloring_book_form',
      has_website_url: false,
    });
  });

  it('creates a book illustrator and invalidates illustrator lists', async () => {
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    illustratorsMock.createIfNotExists.mockResolvedValue({ id: 'ill-1', name: 'Ill' });
    const { result } = renderHook(() => useCreateBookIllustrator(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ name: 'Ill' });
    });

    expect(illustratorsMock.createIfNotExists).toHaveBeenCalledWith({ name: 'Ill' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.coloring.illustrators.all });
    expect(captureMock).toHaveBeenCalledWith('book_illustrator_created', {
      craft: 'coloring',
      surface: 'coloring_book_form',
    });
  });
});
