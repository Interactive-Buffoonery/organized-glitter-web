import { describe, expect, it, vi } from 'vitest';

import { listAllPages } from '../listAllPages';
import { ErrorHandler } from '../ErrorHandler';
import { getErrorMessage } from '@/services/errors';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

describe('listAllPages', () => {
  it('rejects an invalid page size before loading data', async () => {
    const loadPage = vi.fn();

    await expect(listAllPages(loadPage, 0)).rejects.toMatchObject({ reason: 'invalid_page_size' });
    expect(loadPage).not.toHaveBeenCalled();
  });

  it('rejects when later pagination metadata grows instead of following it', async () => {
    const loadPage = vi.fn(async (page: number) => {
      if (page === 1) return { items: ['first'], totalItems: 2, totalPages: 2 };
      if (page === 2) return { items: ['second'], totalItems: 3, totalPages: 3 };
      throw new Error(`Unexpected page ${page}`);
    });

    await expect(listAllPages(loadPage)).rejects.toMatchObject({ reason: 'pagination_changed' });
    expect(loadPage).toHaveBeenCalledTimes(2);
  });

  it('starts later pages concurrently while preserving page order', async () => {
    const laterPages = new Map(
      [2, 3, 4].map(page => [
        page,
        createDeferred<{ items: string[]; totalItems: number; totalPages: number }>(),
      ])
    );
    const loadPage = vi.fn(async (page: number) => {
      if (page === 1) return { items: ['first'], totalItems: 4, totalPages: 4 };
      return laterPages.get(page)!.promise;
    });

    const result = listAllPages(loadPage);
    await vi.waitFor(() => expect(loadPage).toHaveBeenCalledTimes(4));

    laterPages.get(4)!.resolve({ items: ['fourth'], totalItems: 4, totalPages: 4 });
    laterPages.get(3)!.resolve({ items: ['third'], totalItems: 4, totalPages: 4 });
    laterPages.get(2)!.resolve({ items: ['second'], totalItems: 4, totalPages: 4 });

    await expect(result).resolves.toEqual({
      items: ['first', 'second', 'third', 'fourth'],
      totalItems: 4,
      totalPages: 4,
    });
  });

  it('rejects an invalid page count instead of returning a partial list', async () => {
    const loadPage = vi
      .fn()
      .mockResolvedValue({ items: ['first'], totalItems: 1, totalPages: Number.NaN });

    await expect(listAllPages(loadPage)).rejects.toMatchObject({ reason: 'invalid_total_pages' });
  });

  it('loads exactly 5,000 taxonomy records in page order', async () => {
    const totalItems = 5_000;
    let active = 0;
    let maxActive = 0;
    const loadPage = vi.fn(async (page: number, pageSize: number) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      const start = (page - 1) * pageSize;
      return {
        items: Array.from(
          { length: Math.min(pageSize, totalItems - start) },
          (_, index) => start + index
        ),
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      };
    });

    const result = await listAllPages(loadPage);

    expect(result.items).toEqual(Array.from({ length: totalItems }, (_, index) => index));
    expect(result.totalItems).toBe(totalItems);
    expect(loadPage).toHaveBeenCalledTimes(10);
    expect(maxActive).toBe(4);
  });

  it.each([Number.NaN, Infinity, -1, 1.5])('rejects invalid item count %s', async totalItems => {
    const loadPage = vi.fn().mockResolvedValue({ items: [], totalItems, totalPages: 1 });
    await expect(listAllPages(loadPage)).rejects.toMatchObject({ reason: 'invalid_total_items' });
    expect(loadPage).toHaveBeenCalledTimes(1);
  });

  it('rejects a failed page instead of returning a partial library', async () => {
    const loadPage = vi.fn(async (page: number) => {
      if (page === 2) throw new Error('Page failed');
      return { items: [page], totalItems: 2, totalPages: 2 };
    });
    await expect(listAllPages(loadPage, 1)).rejects.toThrow('Page failed');
  });

  it('allows exactly 100,000 items with a non-divisor page size', async () => {
    const loadPage = vi
      .fn()
      .mockResolvedValueOnce({
        items: Array(60_000).fill('first'),
        totalItems: 100_000,
        totalPages: 2,
      })
      .mockResolvedValueOnce({
        items: Array(40_000).fill('second'),
        totalItems: 100_000,
        totalPages: 2,
      });

    const result = await listAllPages(loadPage, 60_000, { maxItems: 100_000 });

    expect(result.totalItems).toBe(100_000);
  });

  it('rejects more returned items than the declared total', async () => {
    const loadPage = vi
      .fn()
      .mockResolvedValueOnce({
        items: Array(60_000).fill('first'),
        totalItems: 100_000,
        totalPages: 2,
      })
      .mockResolvedValueOnce({
        items: Array(40_001).fill('second'),
        totalItems: 100_000,
        totalPages: 2,
      });

    await expect(listAllPages(loadPage, 60_000, { maxItems: 100_000 })).rejects.toMatchObject({
      reason: 'item_count_mismatch',
    });
  });

  it.each([
    { totalItems: 5_001, totalPages: 11 },
    { totalItems: 1, totalPages: 1_000_000_000 },
  ])('rejects an excessive workload before scheduling later pages: %o', async metadata => {
    const loadPage = vi
      .fn()
      .mockResolvedValueOnce({ items: [], ...metadata })
      .mockRejectedValue(new Error('Unexpected later page'));
    await expect(listAllPages(loadPage)).rejects.toMatchObject({
      reason: 'read_limit_exceeded',
      retryable: false,
    });
    expect(loadPage).toHaveBeenCalledTimes(1);
  });

  it('allows 100,000 coloring pages with an explicit larger limit', async () => {
    const loadPage = vi.fn(async (page: number, pageSize: number) => ({
      items: Array.from({ length: pageSize }, (_, index) => (page - 1) * pageSize + index),
      totalItems: 100_000,
      totalPages: 100,
    }));
    const result = await listAllPages(loadPage, 1_000, { maxItems: 100_000 });
    expect(result.items).toHaveLength(100_000);
    expect(loadPage).toHaveBeenCalledTimes(100);
  });

  it('rejects coloring reads above their larger limit after one request', async () => {
    const loadPage = vi.fn().mockResolvedValue({ items: [], totalItems: 100_001, totalPages: 101 });
    await expect(listAllPages(loadPage, 1_000, { maxItems: 100_000 })).rejects.toMatchObject({
      reason: 'read_limit_exceeded',
    });
    expect(loadPage).toHaveBeenCalledTimes(1);
  });

  it('uses the returned page size when the server clamps it', async () => {
    const loadPage = vi.fn(async (page: number) => ({
      items: Array(500).fill(page),
      totalItems: 5_000,
      totalPages: 10,
      perPage: 500,
    }));
    await expect(listAllPages(loadPage, 1_000)).resolves.toMatchObject({ totalItems: 5_000 });
    expect(loadPage).toHaveBeenCalledTimes(10);
  });

  it('stops before another batch when returned items exceed the declared total', async () => {
    const loadPage = vi.fn(async () => ({ items: ['item'], totalItems: 2, totalPages: 6 }));
    await expect(listAllPages(loadPage, 1)).rejects.toMatchObject({
      reason: 'item_count_mismatch',
    });
    expect(loadPage).toHaveBeenCalledTimes(5);
  });

  it('rejects missing items instead of returning an incomplete result', async () => {
    const loadPage = vi.fn().mockResolvedValue({ items: [], totalItems: 1, totalPages: 1 });
    await expect(listAllPages(loadPage)).rejects.toMatchObject({ reason: 'item_count_mismatch' });
  });

  it('preserves the limit error and support contact through service normalization', async () => {
    const loadPage = vi.fn().mockResolvedValue({ items: [], totalItems: 5_001, totalPages: 11 });
    const error = await ErrorHandler.handleAsync(() => listAllPages(loadPage)).catch(
      error => error
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ reason: 'read_limit_exceeded', retryable: false });
    expect(getErrorMessage(error)).toContain('Contact your administrator');
    expect(getErrorMessage(error)).toContain('request a higher limit');
  });
});
