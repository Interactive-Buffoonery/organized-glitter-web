import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { setupAutomaticCacheCleaning } from '../cacheValidation';

describe('navigation cache cleanup', () => {
  let client: QueryClient;
  let cleanup: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    cleanup = setupAutomaticCacheCleaning(client);
  });

  afterEach(() => {
    cleanup();
    client.clear();
    vi.useRealTimers();
  });

  it('preserves loaded coloring data when navigation cleanup runs after editing begins', () => {
    const bookKey = queryKeys.coloring.books.detail('abcdefghijklmno');
    const pageKey = queryKeys.coloring.pages.detail('pqrstuvwxyz0123');
    const referenceKey = queryKeys.coloring.colorReferences.detail('owner', 'pqrstuvwxyz0123');
    for (const key of [bookKey, pageKey, referenceKey]) client.setQueryData(key, { saved: true });
    const records = client.getQueryCache().getAll();

    window.dispatchEvent(new Event('navigation'));
    vi.advanceTimersByTime(100);

    for (const key of [bookKey, pageKey, referenceKey])
      expect(client.getQueryData(key)).toEqual({ saved: true });
    expect(client.getQueryCache().getAll()).toEqual(records);
  });

  it('still removes a query with a confirmed 404 response', async () => {
    const key = queryKeys.coloring.pages.detail('missingpage0001');
    await expect(
      client.fetchQuery({
        queryKey: key,
        queryFn: async () => {
          throw { status: 404 };
        },
      })
    ).rejects.toEqual({ status: 404 });

    window.dispatchEvent(new Event('navigation'));
    vi.advanceTimersByTime(100);

    expect(client.getQueryCache().find({ queryKey: key, exact: true })).toBeUndefined();
  });

  it('keeps retryable errors instead of treating their query labels as invalid IDs', async () => {
    const key = queryKeys.coloring.pages.detail('pqrstuvwxyz0123');
    await expect(
      client.fetchQuery({
        queryKey: key,
        queryFn: async () => {
          throw { status: 503 };
        },
      })
    ).rejects.toEqual({ status: 503 });

    window.dispatchEvent(new Event('navigation'));
    vi.advanceTimersByTime(100);

    expect(client.getQueryState(key)?.error).toEqual({ status: 503 });
  });
});
