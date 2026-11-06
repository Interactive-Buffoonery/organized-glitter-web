import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { getColoringPageCommandEffects } from '@/features/coloring-progress/coloringProgressCommands';
import { queryKeys } from '@/hooks/queries/queryKeys';
import type { ColoringPageDTO } from '@/services/pocketbase/coloring.service';

import {
  beginColoringPageMutation,
  cacheUpdatedColoringPage,
  clearDeletedColoringBook,
  restoreColoringPage,
} from '../coloringMutationCache';

const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });

const page = {
  id: 'page-1',
  bookId: 'book-1',
  status: 'not_started',
  mediumIds: [],
  photos: [],
} as ColoringPageDTO;

describe('coloring mutation cache', () => {
  it('restores the prior page after an optimistic update fails', async () => {
    const client = makeClient();
    const key = queryKeys.coloring.pages.detail(page.id);
    client.setQueryData(key, page);

    const previous = await beginColoringPageMutation(
      client,
      page.id,
      { status: 'completed' },
      getColoringPageCommandEffects({ type: 'set-status', status: 'completed' })
    );
    expect(client.getQueryData<ColoringPageDTO>(key)?.status).toBe('completed');

    restoreColoringPage(client, page.id, previous);
    expect(client.getQueryData(key)).toEqual(page);
  });

  it('refreshes book progress only for page commands that affect it', async () => {
    const client = makeClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    cacheUpdatedColoringPage(
      client,
      page,
      getColoringPageCommandEffects({ type: 'set-status', status: 'completed' })
    );
    await vi.waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.coloring.books.detail(page.bookId),
      })
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.coloring.books.lists() });

    invalidate.mockClear();
    cacheUpdatedColoringPage(
      client,
      page,
      getColoringPageCommandEffects({ type: 'set-mediums', mediumIds: [] })
    );
    await vi.waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.coloring.pages.all })
    );
    expect(invalidate).not.toHaveBeenCalledWith({
      queryKey: queryKeys.coloring.books.detail(page.bookId),
    });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: queryKeys.coloring.books.lists() });
  });

  it('clears the deleted book pages and photo maps without touching other books', async () => {
    const client = makeClient();
    const detailKey = queryKeys.coloring.pages.detail(page.id);
    const pagesKey = queryKeys.coloring.pages.book('book-1');
    const photosKey = queryKeys.coloring.pages.bookPhotos('book-1', 'user-1');
    const otherPhotosKey = queryKeys.coloring.pages.bookPhotos('book-2', 'user-1');
    client.setQueryData(detailKey, page);
    client.setQueryData(pagesKey, [page]);
    client.setQueryData(photosKey, { [page.id]: 'photo.jpg' });
    client.setQueryData(otherPhotosKey, { 'page-2': 'other.jpg' });
    const unsubscribe = new QueryObserver(client, {
      queryKey: photosKey,
      queryFn: () => ({}),
    }).subscribe(() => undefined);

    await clearDeletedColoringBook(client, 'book-1');

    expect(client.getQueryData(detailKey)).toBeUndefined();
    expect(client.getQueryData(pagesKey)).toBeUndefined();
    expect(client.getQueryData(photosKey)).toEqual({});
    expect(client.getQueryData(otherPhotosKey)).toEqual({ 'page-2': 'other.jpg' });
    unsubscribe();
  });
});
