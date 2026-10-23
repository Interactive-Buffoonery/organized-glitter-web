import { describe, expect, it, vi } from 'vitest';

import { listAllPages } from '../listAllPages';

describe('listAllPages', () => {
  it('rejects when later pagination metadata grows instead of following it', async () => {
    const loadPage = vi.fn(async (page: number) => {
      if (page === 1) return { items: ['first'], totalItems: 2, totalPages: 2 };
      if (page === 2) return { items: ['second'], totalItems: 3, totalPages: 3 };
      throw new Error(`Unexpected page ${page}`);
    });

    await expect(listAllPages(loadPage)).rejects.toMatchObject({ reason: 'pagination_changed' });
    expect(loadPage).toHaveBeenCalledTimes(2);
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

  it('rejects a failed page instead of returning a partial library', async () => {
    const loadPage = vi.fn(async (page: number) => {
      if (page === 2) throw new Error('Page failed');
      return { items: [page], totalItems: 2, totalPages: 2 };
    });
    await expect(listAllPages(loadPage, 1)).rejects.toThrow('Page failed');
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

  it('rejects missing items instead of returning an incomplete result', async () => {
    const loadPage = vi.fn().mockResolvedValue({ items: [], totalItems: 1, totalPages: 1 });
    await expect(listAllPages(loadPage)).rejects.toMatchObject({ reason: 'item_count_mismatch' });
  });
});
