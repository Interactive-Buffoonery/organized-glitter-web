import { describe, expect, it, vi } from 'vitest';

import { mapWithConcurrency } from '../mapWithConcurrency';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

describe('mapWithConcurrency', () => {
  it('stops assigning work after a failure and drains started work before rejecting', async () => {
    const deferredByItem = new Map(
      [0, 1, 2].map(item => [item, createDeferred<number>()] as const)
    );
    const startedItems: number[] = [];
    const mapper = vi.fn(async (item: number) => {
      startedItems.push(item);
      return deferredByItem.get(item)!.promise;
    });
    const failure = new Error('request failed');
    let hasSettled = false;

    const result = mapWithConcurrency([0, 1, 2, 3, 4, 5], 3, mapper).finally(() => {
      hasSettled = true;
    });

    await vi.waitFor(() => expect(startedItems).toEqual([0, 1, 2]));
    deferredByItem.get(0)!.reject(failure);
    await Promise.resolve();

    expect(hasSettled).toBe(false);
    expect(startedItems).toEqual([0, 1, 2]);

    deferredByItem.get(1)!.resolve(10);
    deferredByItem.get(2)!.resolve(20);

    await expect(result).rejects.toBe(failure);
    expect(startedItems).toEqual([0, 1, 2]);
  });
});
