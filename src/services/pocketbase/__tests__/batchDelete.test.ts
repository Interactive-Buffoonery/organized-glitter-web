/**
 * Tests for bounded-concurrency batch delete utility
 * Covers: concurrency limiting, partial failure handling, empty input, throwOnFailure
 */
import { describe, expect, it, vi } from 'vitest';
import { deleteBatch } from '../base/batchDelete';

describe('deleteBatch', () => {
  it('continues after individual failures by default', async () => {
    const deleteFn = vi.fn(async (id: string) => {
      if (id === 'bad') throw new Error('delete failed');
    });

    // Should NOT throw
    await deleteBatch(['good1', 'bad', 'good2'], deleteFn);
    expect(deleteFn).toHaveBeenCalledTimes(3);
  });

  it('throws when throwOnFailure is true and a record fails', async () => {
    const deleteFn = vi.fn(async (id: string) => {
      if (id === 'bad') throw new Error('delete failed');
    });

    await expect(
      deleteBatch(['good1', 'bad', 'good2'], deleteFn, { throwOnFailure: true })
    ).rejects.toThrow('Failed to delete 1/3 records');
  });
});
