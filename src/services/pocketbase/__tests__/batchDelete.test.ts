/**
 * Tests for bounded-concurrency batch delete utility
 * Covers: concurrency limiting, partial failure handling, empty input, throwOnFailure
 */
import { describe, it, expect, vi } from 'vitest';
import { deleteBatch } from '../base/batchDelete';

describe('deleteBatch', () => {
  it('deletes all records successfully', async () => {
    const deleteFn = vi.fn().mockResolvedValue(true);
    await deleteBatch(['a', 'b', 'c'], deleteFn);
    expect(deleteFn).toHaveBeenCalledTimes(3);
    expect(deleteFn).toHaveBeenCalledWith('a');
    expect(deleteFn).toHaveBeenCalledWith('b');
    expect(deleteFn).toHaveBeenCalledWith('c');
  });

  it('returns without calling the delete function when the record list is empty', async () => {
    const deleteFn = vi.fn();
    await deleteBatch([], deleteFn);
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it('limits concurrency to the specified value', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const deleteFn = vi.fn(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise(resolve => setTimeout(resolve, 10));
      concurrent--;
    });

    await deleteBatch(
      Array.from({ length: 20 }, (_, i) => `id-${i}`),
      deleteFn,
      { concurrency: 3 }
    );

    expect(deleteFn).toHaveBeenCalledTimes(20);
    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });

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

  it('attempts every delete and does not throw by default when all records fail', async () => {
    const deleteFn = vi.fn().mockRejectedValue(new Error('nope'));

    // Default: does not throw
    await deleteBatch(['a', 'b'], deleteFn);
    expect(deleteFn).toHaveBeenCalledTimes(2);
  });

  it('defaults concurrency to 10', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const deleteFn = vi.fn(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise(resolve => setTimeout(resolve, 5));
      concurrent--;
    });

    await deleteBatch(
      Array.from({ length: 30 }, (_, i) => `id-${i}`),
      deleteFn
    );

    expect(maxConcurrent).toBeLessThanOrEqual(10);
    expect(maxConcurrent).toBeGreaterThan(1); // Actually parallel
  });

  it('deletes each record once when concurrency is larger than the item count', async () => {
    const deleteFn = vi.fn().mockResolvedValue(true);
    await deleteBatch(['a', 'b'], deleteFn, { concurrency: 50 });
    expect(deleteFn).toHaveBeenCalledTimes(2);
  });
});
