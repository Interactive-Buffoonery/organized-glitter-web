import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { getColoringPageCommandEffects } from '@/features/coloring-progress/coloringProgressCommands';
import { queryKeys } from '@/hooks/queries/queryKeys';
import type { ColoringPageDTO } from '@/services/pocketbase/coloring.service';

import {
  beginColoringPageMutation,
  cacheUpdatedColoringPage,
  refreshColoringBookAfterFormSave,
  refreshColoringBookTags,
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

  it('does not invent a page when there was no detail cache to roll back', async () => {
    const client = makeClient();
    const previous = await beginColoringPageMutation(
      client,
      page.id,
      { status: 'completed' },
      getColoringPageCommandEffects({ type: 'set-status', status: 'completed' })
    );

    restoreColoringPage(client, page.id, previous);
    expect(client.getQueryData(queryKeys.coloring.pages.detail(page.id))).toBeUndefined();
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

  it('keeps a confirmed form save successful when a refresh rejects', async () => {
    const client = makeClient();
    const invalidate = vi
      .spyOn(client, 'invalidateQueries')
      .mockRejectedValue(new Error('offline'));

    await expect(
      refreshColoringBookAfterFormSave(client, 'book-1', 'create')
    ).resolves.toBeUndefined();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.coloring.books.all });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.coloring.pages.all });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.coloring.books.detail('book-1'),
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.coloring.tags.stats() });
  });

  it('refreshes all tag consumers without rejecting a confirmed sync', async () => {
    const client = makeClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockImplementation(({ queryKey }) => {
      if (queryKey?.[1] === 'book') throw new Error('cache unavailable');
      return Promise.resolve();
    });

    await expect(refreshColoringBookTags(client, 'book-1')).resolves.toBeUndefined();
    expect(invalidate).toHaveBeenCalledTimes(4);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.coloring.tags.book('book-1') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.coloring.tags.stats() });
  });
});
