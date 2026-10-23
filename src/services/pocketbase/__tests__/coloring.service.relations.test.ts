import { beforeEach, describe, expect, it, vi } from 'vitest';

const pbMock = vi.hoisted(() => {
  const collectionMethods = {
    create: vi.fn(),
    getList: vi.fn(),
    getFullList: vi.fn(),
    getOne: vi.fn(),
    update: vi.fn(),
  };

  return {
    pb: {
      collection: vi.fn(() => collectionMethods),
      filter: vi.fn(() => 'book = "book-1"'),
      send: vi.fn(),
      authStore: { token: '' },
    },
    collectionMethods,
    reset: () => {
      Object.values(collectionMethods).forEach(method => method.mockReset());
      pbMock.pb.filter.mockClear();
      pbMock.pb.send.mockReset();
      pbMock.pb.authStore.token = '';
    },
  };
});

vi.mock('@/lib/pocketbase', () => ({ pb: pbMock.pb, resolveFileUrl: vi.fn() }));
vi.mock('@/services/auth', () => ({
  isAuthenticated: vi.fn(() => true),
  getCurrentUserId: vi.fn(() => 'user-123'),
}));
const syncBookTagsMock = vi.hoisted(() => vi.fn());
vi.mock('@/services/pocketbase/coloringTags.service', () => ({
  ColoringTagService: {
    syncBookTags: syncBookTagsMock,
  },
}));

import {
  SessionChangedError,
  captureSessionDrafts,
  clearSessionDrafts,
  markSessionTokenInactive,
  takeCompletedSessionDestination,
} from '@/services/auth/sessionRecovery';
import { ColoringBooksStatusOptions, ColoringPagesStatusOptions } from '@/types/pocketbase.types';
import { ColoringService } from '../coloring.service';

const bookRecord = {
  id: 'book-1',
  user: 'user-123',
  title: 'Book',
  publisher: '',
  illustrator: '',
  series: '',
  theme: '',
  isbn: '',
  cover_image: '',
  is_mystery: false,
  status: ColoringBooksStatusOptions.purchased,
  total_pages: 20,
  created: '2026-01-01',
  updated: '2026-01-01',
};

const pageRecord = {
  id: 'page-1',
  book: 'book-1',
  page_number: 1,
  status: ColoringPagesStatusOptions.not_started,
  mediums: ['medium-1', 'medium-2'],
  photos: [],
  revealed_subject: '',
  revealed_at: '',
  started_at: '',
  completed_at: '',
  created: '2026-01-01',
  updated: '2026-01-01',
};

describe('ColoringService relation payloads', () => {
  beforeEach(() => {
    pbMock.reset();
    syncBookTagsMock.mockReset();
    clearSessionDrafts();
  });

  it('uses bounded server batches before applying the final coloring book patch', async () => {
    pbMock.collectionMethods.getOne.mockResolvedValue({
      ...bookRecord,
      total_pages: 1200,
      completed_pages: 0,
    });
    pbMock.collectionMethods.update.mockResolvedValue({
      ...bookRecord,
      total_pages: 100,
    });
    pbMock.pb.send
      .mockResolvedValueOnce({
        bookId: 'book-1',
        currentTotalPages: 700,
        targetTotalPages: 100,
        deletedPages: 500,
        remainingPages: 600,
        done: false,
      })
      .mockResolvedValueOnce({
        bookId: 'book-1',
        currentTotalPages: 200,
        targetTotalPages: 100,
        deletedPages: 500,
        remainingPages: 100,
        done: false,
      })
      .mockResolvedValueOnce({
        bookId: 'book-1',
        currentTotalPages: 100,
        targetTotalPages: 100,
        deletedPages: 100,
        remainingPages: 0,
        done: true,
      });

    await ColoringService.updateBook('book-1', { total_pages: 100, title: 'Reduced' });

    expect(pbMock.pb.send).toHaveBeenCalledTimes(3);
    expect(pbMock.pb.send).toHaveBeenNthCalledWith(1, '/api/coloring/books/book-1/reduce-pages', {
      method: 'POST',
      body: { targetTotalPages: 100 },
    });
    expect(pbMock.pb.send).toHaveBeenNthCalledWith(3, '/api/coloring/books/book-1/reduce-pages', {
      method: 'POST',
      body: { targetTotalPages: 100 },
    });
    expect(pbMock.collectionMethods.update).toHaveBeenCalledTimes(1);
    expect(pbMock.collectionMethods.update).toHaveBeenCalledWith(
      'book-1',
      expect.objectContaining({ title: 'Reduced', total_pages: 100 })
    );
  });

  it('does not apply metadata when the reduction endpoint rejects worked pages', async () => {
    pbMock.collectionMethods.getOne.mockResolvedValue({
      ...bookRecord,
      total_pages: 1200,
      completed_pages: 0,
    });
    pbMock.pb.send.mockRejectedValue(new Error('Page 900 has saved work'));

    await expect(
      ColoringService.updateBook('book-1', { total_pages: 100, title: 'Not applied' })
    ).rejects.toMatchObject({ message: 'Page 900 has saved work' });

    expect(pbMock.collectionMethods.update).not.toHaveBeenCalled();
  });

  it('builds coloring page list filters through PocketBase params', async () => {
    pbMock.collectionMethods.getList.mockResolvedValue({
      items: [pageRecord],
      totalItems: 1,
      totalPages: 1,
      page: 1,
      perPage: 500,
    });

    await ColoringService.listPages({ bookId: 'book-1', sort: 'page_number', perPage: 500 });

    expect(pbMock.pb.filter).toHaveBeenCalledWith('book = {:bookId}', { bookId: 'book-1' });
    expect(pbMock.collectionMethods.getList).toHaveBeenCalledWith(1, 500, {
      filter: 'book = "book-1"',
      sort: 'page_number',
      expand: undefined,
    });
  });

  it('does not report create success when tag synchronization finishes after a session change', async () => {
    pbMock.pb.authStore.token = 'late-tag-token';
    pbMock.collectionMethods.create.mockResolvedValue(bookRecord);
    syncBookTagsMock.mockImplementation(async () => {
      captureSessionDrafts('user-123', 'late-tag-token');
      markSessionTokenInactive('late-tag-token');
      throw new SessionChangedError();
    });

    await expect(
      ColoringService.createBookWithTags({ title: 'Book' }, ['tag-1'])
    ).rejects.toMatchObject({
      reason: 'session_changed',
    });
    expect(takeCompletedSessionDestination('user-123')).toBe('/coloring/book-1');
  });

  it('returns the saved book plus a tag sync error when create tag sync fails', async () => {
    pbMock.collectionMethods.create.mockResolvedValue(bookRecord);
    syncBookTagsMock.mockResolvedValue({
      status: 'error',
      data: null,
      error: new Error('tag sync failed'),
    });

    const result = await ColoringService.createBookWithTags({ title: 'Book' }, ['tag-1']);

    expect(result.book).toEqual(expect.objectContaining({ id: 'book-1', title: 'Book' }));
    expect(result.tagSyncError).toEqual(new Error('tag sync failed'));
  });
});
