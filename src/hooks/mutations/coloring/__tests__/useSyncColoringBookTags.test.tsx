import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryKeys } from '@/hooks/queries/queryKeys';
import { useSyncColoringBookTags } from '../useSyncColoringBookTags';

const { syncBookTagsMock } = vi.hoisted(() => ({ syncBookTagsMock: vi.fn() }));

vi.mock('@/services/pocketbase/coloringTags.service', () => ({
  ColoringTagService: { syncBookTags: syncBookTagsMock },
}));

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

describe('useSyncColoringBookTags', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refreshes book, tag, and coloring Stats queries after a successful sync', async () => {
    const client = makeClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const overviewKey = queryKeys.stats.overview('user-1');
    const coloringKey = queryKeys.stats.coloringCollection('user-1');
    const diamondKey = queryKeys.stats.summary('user-1', 2026);
    for (const key of [overviewKey, coloringKey, diamondKey]) {
      client.setQueryData(key, { total: 1 });
    }
    syncBookTagsMock.mockResolvedValue({ status: 'success', data: undefined, error: null });
    const { result } = renderHook(() => useSyncColoringBookTags(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ bookId: 'book-1', tagIds: [] });
    });

    expect(syncBookTagsMock).toHaveBeenCalledWith('book-1', []);
    for (const queryKey of [
      queryKeys.coloring.books.all,
      queryKeys.coloring.books.detail('book-1'),
      queryKeys.coloring.tags.book('book-1'),
      queryKeys.coloring.tags.stats(),
    ]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey });
    }
    expect(client.getQueryState(overviewKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(coloringKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(diamondKey)?.isInvalidated).toBe(false);
  });

  it('does not refresh caches when the service returns an error', async () => {
    const client = makeClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const response = { status: 'error', data: null, error: new Error('Tag sync failed') };
    syncBookTagsMock.mockResolvedValue(response);
    const { result } = renderHook(() => useSyncColoringBookTags(), {
      wrapper: makeWrapper(client),
    });

    let actual;
    await act(async () => {
      actual = await result.current.mutateAsync({ bookId: 'book-1', tagIds: ['tag-1'] });
    });

    expect(actual).toBe(response);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('preserves a successful sync when a cache refresh fails', async () => {
    const client = makeClient();
    const originalInvalidate = client.invalidateQueries.bind(client);
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockImplementation(filters => {
      if (filters?.queryKey === queryKeys.coloring.tags.book('book-1')) {
        return Promise.reject(new Error('Refresh failed'));
      }
      return originalInvalidate(filters);
    });
    const response = { status: 'success', data: undefined, error: null };
    syncBookTagsMock.mockResolvedValue(response);
    const { result } = renderHook(() => useSyncColoringBookTags(), {
      wrapper: makeWrapper(client),
    });

    let actual;
    await act(async () => {
      actual = await result.current.mutateAsync({ bookId: 'book-1', tagIds: ['tag-1'] });
    });

    expect(actual).toBe(response);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.coloring.tags.book('book-1') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.coloring.tags.stats() });
    await waitFor(() => expect(result.current.isPending).toBe(false));
  });

  it('stays pending until cache refresh finishes after the service saves', async () => {
    const client = makeClient();
    const originalInvalidate = client.invalidateQueries.bind(client);
    let finishRefresh!: () => void;
    const refresh = new Promise<void>(resolve => {
      finishRefresh = resolve;
    });
    vi.spyOn(client, 'invalidateQueries').mockImplementation(filters => {
      if (filters?.queryKey === queryKeys.coloring.books.all) return refresh;
      return originalInvalidate(filters);
    });
    syncBookTagsMock.mockResolvedValue({ status: 'success', data: undefined, error: null });
    const { result } = renderHook(() => useSyncColoringBookTags(), {
      wrapper: makeWrapper(client),
    });

    let mutation: Promise<unknown> | undefined;
    await act(async () => {
      mutation = result.current.mutateAsync({ bookId: 'book-1', tagIds: ['tag-1'] });
      await Promise.resolve();
    });

    expect(syncBookTagsMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.isPending).toBe(true));

    await act(async () => {
      finishRefresh();
      await mutation;
    });
    await waitFor(() => expect(result.current.isPending).toBe(false));
  });

  it('keeps a saved sync successful when Stats refresh throws synchronously', async () => {
    const client = makeClient();
    const originalInvalidate = client.invalidateQueries.bind(client);
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockImplementation(filters => {
      if (filters?.queryKey === queryKeys.stats.all) throw new Error('Stats refresh failed');
      return originalInvalidate(filters);
    });
    const response = { status: 'success', data: undefined, error: null };
    syncBookTagsMock.mockResolvedValue(response);
    const { result } = renderHook(() => useSyncColoringBookTags(), {
      wrapper: makeWrapper(client),
    });

    let actual;
    await act(async () => {
      actual = await result.current.mutateAsync({ bookId: 'book-1', tagIds: ['tag-1'] });
    });

    expect(actual).toBe(response);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.coloring.tags.book('book-1') });
  });

  it('rejects a thrown service error without refreshing caches', async () => {
    const client = makeClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const failure = new Error('Service unavailable');
    syncBookTagsMock.mockRejectedValue(failure);
    const { result } = renderHook(() => useSyncColoringBookTags(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ bookId: 'book-1', tagIds: ['tag-1'] })
      ).rejects.toBe(failure);
    });

    expect(invalidate).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.isPending).toBe(false));
  });
});
