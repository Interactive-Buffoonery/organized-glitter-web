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

import { ColoringBooksStatusOptions, ColoringPagesStatusOptions } from '@/types/pocketbase.types';
import { ColoringService } from '../coloring.service';
import {
  SessionChangedError,
  captureSessionDrafts,
  clearSessionDrafts,
  markSessionTokenInactive,
  takeCompletedSessionDestination,
} from '@/services/auth/sessionRecovery';

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

const bookRecordWithTags = {
  ...bookRecord,
  expand: {
    coloring_book_tags_via_book: [
      {
        id: 'join-1',
        book: 'book-1',
        tag: 'tag-1',
        expand: {
          tag: {
            id: 'tag-1',
            user: 'user-123',
            name: 'Disney princesses',
            slug: 'disney-princesses',
            color: '#ec4899',
            created: '2026-01-01',
            updated: '2026-01-01',
          },
        },
      },
    ],
  },
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

  it('forwards book pagination and preserves PocketBase list metadata', async () => {
    pbMock.collectionMethods.getList.mockResolvedValue({
      items: [bookRecord],
      page: 2,
      perPage: 50,
      totalItems: 51,
      totalPages: 2,
    });

    const result = await ColoringService.listBooks({
      userId: 'user-123',
      page: 2,
      perPage: 50,
      sort: '+title,+id',
    });

    expect(pbMock.collectionMethods.getList).toHaveBeenCalledWith(2, 50, {
      filter: 'book = "book-1"',
      sort: '+title,+id',
      expand: undefined,
    });
    expect(result).toMatchObject({
      page: 2,
      perPage: 50,
      totalItems: 51,
      totalPages: 2,
    });
    expect(result.items).toHaveLength(1);
  });

  it('omits empty publisher and illustrator relations on create', async () => {
    pbMock.collectionMethods.create.mockResolvedValue(bookRecord);

    await ColoringService.createBook({
      title: 'Book',
      publisher: '',
      illustrator: '',
    });

    expect(pbMock.collectionMethods.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ publisher: expect.anything(), illustrator: expect.anything() })
    );
  });

  it('omits undefined optional metadata fields on create', async () => {
    pbMock.collectionMethods.create.mockResolvedValue(bookRecord);

    await ColoringService.createBook({
      title: 'Book',
      publication_year: undefined,
      book_format: undefined,
      language: undefined,
    });

    expect(pbMock.collectionMethods.create).toHaveBeenCalledWith(
      expect.not.objectContaining({
        publication_year: expect.anything(),
        book_format: expect.anything(),
        language: expect.anything(),
      })
    );
  });

  it('sends false as a real boolean when creating a non-mystery book', async () => {
    pbMock.collectionMethods.create.mockResolvedValue(bookRecord);

    await ColoringService.createBook({
      title: 'Book',
      is_mystery: false,
    });

    expect(pbMock.collectionMethods.create).toHaveBeenCalledWith(
      expect.objectContaining({ is_mystery: false })
    );
  });

  it('preserves false in FormData when creating a non-mystery book with a cover', async () => {
    pbMock.collectionMethods.create.mockResolvedValue(bookRecord);

    await ColoringService.createBook({
      title: 'Book',
      cover_image: new File(['cover'], 'cover.png', { type: 'image/png' }),
      is_mystery: false,
    });

    const payload = pbMock.collectionMethods.create.mock.calls[0][0];
    expect(payload).toBeInstanceOf(FormData);
    expect(payload.get('is_mystery')).toBe('false');
  });

  it('clears null publication year updates in FormData payloads', async () => {
    pbMock.collectionMethods.update.mockResolvedValue(bookRecord);

    await ColoringService.updateBook('book-1', {
      cover_image: new File(['cover'], 'cover.png', { type: 'image/png' }),
      publication_year: null,
    });

    const payload = pbMock.collectionMethods.update.mock.calls[0][1];
    expect(payload).toBeInstanceOf(FormData);
    expect(payload.get('publication_year')).toBe('0');
  });

  it('clears null publication year updates in object payloads', async () => {
    pbMock.collectionMethods.update.mockResolvedValue(bookRecord);

    await ColoringService.updateBook('book-1', {
      publication_year: null,
    });

    expect(pbMock.collectionMethods.update).toHaveBeenCalledWith(
      'book-1',
      expect.objectContaining({ publication_year: 0 })
    );
  });

  it('normalizes PocketBase zero-default publication years to empty metadata', async () => {
    pbMock.collectionMethods.getOne.mockResolvedValue({
      ...bookRecord,
      publication_year: 0,
    });

    const book = await ColoringService.getBookById('book-1');

    expect(book.publicationYear).toBeUndefined();
  });

  it('normalizes PocketBase book date fields without shifting the calendar day', async () => {
    pbMock.collectionMethods.getOne.mockResolvedValue({
      ...bookRecord,
      date_purchased: '2025-08-03 00:00:00.000Z',
      date_received: '2025-08-04T00:00:00.000Z',
      date_started: '2025-08-05',
      date_completed: '',
    });

    const book = await ColoringService.getBookById('book-1');

    expect(book.datePurchased).toBe('2025-08-03');
    expect(book.dateReceived).toBe('2025-08-04');
    expect(book.dateStarted).toBe('2025-08-05');
    expect(book.dateCompleted).toBe('');
  });

  it('clears empty publisher and illustrator relations on update', async () => {
    pbMock.collectionMethods.update.mockResolvedValue(bookRecord);

    await ColoringService.updateBook('book-1', {
      publisher: '',
      illustrator: '',
    });

    expect(pbMock.collectionMethods.update).toHaveBeenCalledWith(
      'book-1',
      expect.objectContaining({ publisher: '', illustrator: '' })
    );
  });

  it('sends false as a real boolean when updating a book from mystery to non-mystery', async () => {
    pbMock.collectionMethods.update.mockResolvedValue(bookRecord);

    await ColoringService.updateBook('book-1', {
      is_mystery: false,
    });

    expect(pbMock.collectionMethods.update).toHaveBeenCalledWith(
      'book-1',
      expect.objectContaining({ is_mystery: false })
    );
  });

  it('leaves completion percentage ownership to the server when total pages changes', async () => {
    pbMock.collectionMethods.getOne.mockResolvedValue({
      ...bookRecord,
      total_pages: 20,
      completed_pages: 5,
      completion_percentage: 25,
    });
    pbMock.collectionMethods.update.mockResolvedValue({
      ...bookRecord,
      total_pages: 10,
      completed_pages: 5,
      completion_percentage: 50,
    });
    pbMock.pb.send.mockResolvedValue({
      bookId: 'book-1',
      currentTotalPages: 10,
      targetTotalPages: 10,
      deletedPages: 10,
      remainingPages: 0,
      done: true,
    });

    await ColoringService.updateBook('book-1', {
      total_pages: 10,
    });

    expect(pbMock.collectionMethods.update).toHaveBeenCalledWith(
      'book-1',
      expect.objectContaining({ total_pages: 10 })
    );
    expect(pbMock.collectionMethods.update.mock.calls[0][1]).not.toHaveProperty(
      'completion_percentage'
    );
  });

  it('does not request page reduction when a metadata edit keeps the same page count', async () => {
    pbMock.collectionMethods.getOne.mockResolvedValue({
      ...bookRecord,
      total_pages: 20,
    });
    pbMock.collectionMethods.update.mockResolvedValue({
      ...bookRecord,
      title: 'Updated book',
      status: ColoringBooksStatusOptions.in_stash,
    });
    pbMock.pb.send.mockResolvedValue({
      bookId: 'book-1',
      currentTotalPages: 20,
      targetTotalPages: 20,
      deletedPages: 0,
      remainingPages: 0,
      done: true,
    });

    await ColoringService.updateBook('book-1', {
      title: 'Updated book',
      status: ColoringBooksStatusOptions.in_stash,
      total_pages: 20,
    });

    expect(pbMock.pb.send).not.toHaveBeenCalled();
    expect(pbMock.collectionMethods.update).toHaveBeenCalledWith(
      'book-1',
      expect.objectContaining({
        title: 'Updated book',
        status: ColoringBooksStatusOptions.in_stash,
        total_pages: 20,
      })
    );
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

  it('maps page medium relation ids from PocketBase records', async () => {
    pbMock.collectionMethods.getOne.mockResolvedValue(pageRecord);

    const page = await ColoringService.getPageById('page-1');

    expect(page.mediumIds).toEqual(['medium-1', 'medium-2']);
  });

  it('normalizes PocketBase page lifecycle dates without shifting the calendar day', async () => {
    pbMock.collectionMethods.getOne.mockResolvedValue({
      ...pageRecord,
      started_at: '2025-08-03 00:00:00.000Z',
      completed_at: '2025-08-04T00:00:00.000Z',
    });

    const page = await ColoringService.getPageById('page-1');

    expect(page.startedAt).toBe('2025-08-03');
    expect(page.completedAt).toBe('2025-08-04');
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

  it('loads all bounded pages for multiple books with stable page order', async () => {
    pbMock.collectionMethods.getList
      .mockResolvedValueOnce({
        items: [
          { ...pageRecord, id: 'page-2', page_number: 2 },
          { ...pageRecord, id: 'page-0', book: 'other-book' },
        ],
        totalItems: 4,
        totalPages: 2,
      })
      .mockResolvedValueOnce({
        items: [
          { ...pageRecord, id: 'page-3', book: 'book-2', page_number: 2 },
          { ...pageRecord, id: 'page-1', page_number: 1 },
        ],
        totalItems: 4,
        totalPages: 2,
      });

    const pages = await ColoringService.listAllPagesByBook('user-123', ['book-2', 'book-1']);

    expect(pbMock.pb.filter).toHaveBeenCalledWith('book.user = {:userId}', {
      userId: 'user-123',
    });
    expect(pbMock.collectionMethods.getFullList).not.toHaveBeenCalled();
    expect(pbMock.collectionMethods.getList).toHaveBeenNthCalledWith(1, 1, 1000, {
      filter: 'book = "book-1"',
      sort: 'book,page_number,id',
    });
    expect(pbMock.collectionMethods.getList).toHaveBeenNthCalledWith(2, 2, 1000, {
      filter: 'book = "book-1"',
      sort: 'book,page_number,id',
    });
    expect(Object.keys(pages)).toEqual(['book-2', 'book-1']);
    expect(pages['book-2'].map(page => page.id)).toEqual(['page-3']);
    expect(pages['book-1'].map(page => page.id)).toEqual(['page-1', 'page-2']);
  });

  it('rejects oversized coloring page reads with support guidance before more requests', async () => {
    pbMock.collectionMethods.getList.mockResolvedValue({
      items: [],
      totalItems: 100_001,
      totalPages: 101,
      perPage: 1000,
    });
    await expect(ColoringService.listAllPagesByBook('user-123', ['book-1'])).rejects.toMatchObject({
      message: expect.stringContaining('100,000 coloring pages'),
      reason: 'read_limit_exceeded',
      retryable: false,
    });
    expect(pbMock.collectionMethods.getList).toHaveBeenCalledTimes(1);
  });

  it('sends medium relation ids when updating a coloring page', async () => {
    pbMock.collectionMethods.getOne.mockResolvedValue({ ...pageRecord, mediums: [] });
    pbMock.collectionMethods.update.mockResolvedValue(pageRecord);

    await ColoringService.updatePage('page-1', {
      mediums: ['medium-1', 'medium-2'],
    });

    expect(pbMock.collectionMethods.update).toHaveBeenCalledWith(
      'page-1',
      expect.objectContaining({ mediums: ['medium-1', 'medium-2'] })
    );
  });

  it('updates page status without syncing book metrics client-side', async () => {
    const completedPageRecord = {
      ...pageRecord,
      status: ColoringPagesStatusOptions.completed,
    };
    pbMock.collectionMethods.update.mockResolvedValue(completedPageRecord);

    const result = await ColoringService.updatePage('page-1', {
      status: ColoringPagesStatusOptions.completed,
    });

    expect(result.status).toBe(ColoringPagesStatusOptions.completed);
    expect(pbMock.collectionMethods.update).toHaveBeenCalledTimes(1);
    expect(pbMock.collectionMethods.update).toHaveBeenCalledWith(
      'page-1',
      expect.objectContaining({
        status: ColoringPagesStatusOptions.completed,
      })
    );
    expect(pbMock.collectionMethods.update.mock.calls[0][1]).not.toHaveProperty('completed_at');
    expect(pbMock.collectionMethods.getList).not.toHaveBeenCalled();
    expect(pbMock.collectionMethods.getOne).not.toHaveBeenCalled();
  });

  it('does not synthesize start or completion dates for page status changes', async () => {
    const inProgressPageRecord = {
      ...pageRecord,
      status: ColoringPagesStatusOptions.in_progress,
    };
    pbMock.collectionMethods.update.mockResolvedValue(inProgressPageRecord);

    await ColoringService.updatePage('page-1', {
      status: ColoringPagesStatusOptions.in_progress,
    });

    expect(pbMock.collectionMethods.update).toHaveBeenNthCalledWith(1, 'page-1', {
      status: ColoringPagesStatusOptions.in_progress,
    });
    expect(pbMock.collectionMethods.update.mock.calls[0][1]).not.toHaveProperty('started_at');
    expect(pbMock.collectionMethods.update.mock.calls[0][1]).not.toHaveProperty('completed_at');
  });

  it('sends explicit coloring page date changes without requiring a status change', async () => {
    pbMock.collectionMethods.update.mockResolvedValue({
      ...pageRecord,
      started_at: '2026-04-01',
      completed_at: '',
    });

    const result = await ColoringService.updatePage('page-1', {
      started_at: '2026-04-01',
      completed_at: '',
    });

    expect(pbMock.collectionMethods.update).toHaveBeenCalledWith('page-1', {
      started_at: '2026-04-01',
      completed_at: '',
    });
    expect(result.startedAt).toBe('2026-04-01');
    expect(result.completedAt).toBe('');
  });

  it('appends coloring page photos with the PocketBase file append modifier', async () => {
    const file = new File(['photo'], 'page-photo.jpg', { type: 'image/jpeg' });
    pbMock.collectionMethods.update.mockResolvedValue({
      ...pageRecord,
      photos: ['page-photo.jpg'],
    });

    await ColoringService.updatePage('page-1', {
      'photos+': [file],
    });

    const payload = pbMock.collectionMethods.update.mock.calls[0][1] as FormData;
    expect(payload).toBeInstanceOf(FormData);
    expect(payload.getAll('photos+')).toEqual([file]);
    expect(payload.getAll('photos')).toEqual([]);
  });

  it('deletes individual coloring page photos with the PocketBase delete modifier', async () => {
    pbMock.collectionMethods.update.mockResolvedValue({ ...pageRecord, photos: [] });

    await ColoringService.deletePagePhoto('page-1', 'detail.jpg');

    expect(pbMock.collectionMethods.getOne).not.toHaveBeenCalled();
    expect(pbMock.collectionMethods.update).toHaveBeenCalledWith('page-1', {
      'photos-': ['detail.jpg'],
    });
  });

  it('sets the main coloring page photo through the atomic server route', async () => {
    pbMock.pb.send.mockResolvedValue({
      ...pageRecord,
      photos: ['detail.jpg', 'main.jpg', 'concurrent.jpg'],
    });

    const result = await ColoringService.setMainPagePhoto('page-1', 'detail.jpg');

    expect(pbMock.pb.send).toHaveBeenCalledWith('/api/coloring/pages/page-1/main-photo', {
      method: 'POST',
      body: { filename: 'detail.jpg' },
    });
    expect(result.photos).toEqual(['detail.jpg', 'main.jpg', 'concurrent.jpg']);
  });

  it('syncs coloring tags after creating a book', async () => {
    pbMock.collectionMethods.create.mockResolvedValue(bookRecord);
    pbMock.collectionMethods.getOne.mockResolvedValue(bookRecordWithTags);
    syncBookTagsMock.mockResolvedValue({ status: 'success', data: undefined, error: null });

    const result = await ColoringService.createBookWithTags({ title: 'Book' }, ['tag-1', 'tag-2']);

    expect(syncBookTagsMock).toHaveBeenCalledWith('book-1', ['tag-1', 'tag-2']);
    expect(pbMock.collectionMethods.getOne).toHaveBeenCalledWith('book-1', {
      expand: 'publisher,illustrator,coloring_book_tags_via_book.tag',
    });
    expect(result).toEqual({
      book: expect.objectContaining({
        id: 'book-1',
        title: 'Book',
        tags: [
          expect.objectContaining({
            id: 'tag-1',
            name: 'Disney princesses',
            color: '#ec4899',
          }),
        ],
      }),
    });
  });

  it('retires a coloring create draft before tag synchronization', async () => {
    pbMock.collectionMethods.create.mockResolvedValue(bookRecord);
    const onPrimarySave = vi.fn();
    syncBookTagsMock.mockImplementation(async () => {
      expect(onPrimarySave).toHaveBeenCalledOnce();
      return { status: 'error', data: null, error: new Error('tag sync failed') };
    });

    const result = await ColoringService.createBookWithTags(
      { title: 'Book' },
      ['tag-1'],
      onPrimarySave
    );

    expect(result.tagSyncError).toBeInstanceOf(Error);
    expect(onPrimarySave).toHaveBeenCalledOnce();
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

  it('skips tag sync after creating a book without selected tags', async () => {
    pbMock.collectionMethods.create.mockResolvedValue(bookRecord);

    const result = await ColoringService.createBookWithTags({ title: 'Book' }, []);

    expect(syncBookTagsMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      book: expect.objectContaining({ id: 'book-1', title: 'Book' }),
    });
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

  it('skips tag sync when updating a book without tag ids', async () => {
    pbMock.collectionMethods.update.mockResolvedValue(bookRecord);

    const result = await ColoringService.updateBookWithTags('book-1', { title: 'Updated' });

    expect(syncBookTagsMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      book: expect.objectContaining({ id: 'book-1', title: 'Book' }),
    });
  });

  it('returns a refreshed expanded book after updating coloring tags', async () => {
    pbMock.collectionMethods.update.mockResolvedValue(bookRecord);
    pbMock.collectionMethods.getOne.mockResolvedValue(bookRecordWithTags);
    syncBookTagsMock.mockResolvedValue({ status: 'success', data: undefined, error: null });

    const result = await ColoringService.updateBookWithTags('book-1', { title: 'Updated' }, [
      'tag-1',
    ]);

    expect(syncBookTagsMock).toHaveBeenCalledWith('book-1', ['tag-1']);
    expect(result.book.tags).toEqual([
      expect.objectContaining({
        id: 'tag-1',
        name: 'Disney princesses',
        color: '#ec4899',
      }),
    ]);
  });

  it('sends guarded tag changes with the primary update and skips follow-up sync', async () => {
    pbMock.collectionMethods.update.mockResolvedValue({ ...bookRecord, revision: 1 });
    pbMock.collectionMethods.getOne.mockResolvedValue(bookRecordWithTags);

    await ColoringService.updateBookWithTags(
      'book-1',
      { title: 'Updated' },
      ['tag-1'],
      undefined,
      0
    );

    expect(pbMock.collectionMethods.update).toHaveBeenCalledWith(
      'book-1',
      expect.objectContaining({ og_tag_ids: '["tag-1"]' }),
      expect.objectContaining({ headers: { 'X-OG-Expected-Revision': '0' } })
    );
    expect(syncBookTagsMock).not.toHaveBeenCalled();
  });

  it('keeps a successful book update when the post-tag refresh fails', async () => {
    pbMock.collectionMethods.update.mockResolvedValue(bookRecord);
    pbMock.collectionMethods.getOne.mockRejectedValue(new Error('refresh failed'));
    syncBookTagsMock.mockResolvedValue({ status: 'success', data: undefined, error: null });

    await expect(
      ColoringService.updateBookWithTags('book-1', { title: 'Updated' }, ['tag-1'])
    ).resolves.toEqual({
      book: expect.objectContaining({ id: 'book-1', title: 'Book' }),
    });
  });

  it('fetches coloring summary stats for the requested year', async () => {
    const response = {
      generatedAt: '2026-05-02T12:00:00.000Z',
      year: 2026,
      metrics: {},
      bookStatusBreakdown: {},
      pageStatusBreakdown: {},
    };
    pbMock.pb.send.mockResolvedValue(response);

    await expect(ColoringService.getStatsSummary(2026)).resolves.toEqual(response);

    expect(pbMock.pb.send).toHaveBeenCalledWith('/api/stats/coloring/summary', {
      method: 'GET',
      query: { year: 2026 },
    });
  });

  it('fetches coloring completion stats endpoints', async () => {
    pbMock.pb.send.mockResolvedValue({ generatedAt: 'now', year: 2026, total: 0, months: [] });

    await ColoringService.getCompletionsByMonth(2026);
    await ColoringService.getCompletionsYearly();
    await ColoringService.getCompletionTimeStats();
    await ColoringService.getCollectionStats();

    expect(pbMock.pb.send).toHaveBeenNthCalledWith(1, '/api/stats/coloring/completions', {
      method: 'GET',
      query: { year: 2026 },
    });
    expect(pbMock.pb.send).toHaveBeenNthCalledWith(2, '/api/stats/coloring/completions/yearly', {
      method: 'GET',
    });
    expect(pbMock.pb.send).toHaveBeenNthCalledWith(3, '/api/stats/coloring/completion-times', {
      method: 'GET',
    });
    expect(pbMock.pb.send).toHaveBeenNthCalledWith(4, '/api/stats/coloring/collection', {
      method: 'GET',
    });
  });
});
