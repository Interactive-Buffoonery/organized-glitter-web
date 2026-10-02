/**
 * Bounded-concurrency batch delete utility.
 * Prevents unbounded Promise.all fan-outs that can trigger 429s on large datasets.
 *
 * @param ids       Record IDs to delete
 * @param deleteFn  Function that deletes a single record by ID
 * @param options   concurrency: max parallel deletes (default 10)
 * @returns         Array of { id, error? } for partial-failure reporting
 */

export interface BatchDeleteResult {
  id: string;
  error?: Error;
}

/**
 * Delete records with bounded concurrency.
 * By default, failures on individual records are collected but do not abort the batch.
 * Pass `throwOnFailure: true` to throw after all workers finish if any record failed.
 */
export async function deleteBatch(
  ids: string[],
  deleteFn: (id: string) => Promise<unknown>,
  options: { concurrency?: number; throwOnFailure?: boolean } = {}
): Promise<void> {
  const { concurrency = 10, throwOnFailure = false } = options;
  if (ids.length === 0) return;

  const failures: BatchDeleteResult[] = [];
  let index = 0;

  async function worker() {
    while (index < ids.length) {
      const currentIndex = index++;
      const id = ids[currentIndex];
      try {
        await deleteFn(id);
      } catch (error) {
        failures.push({ id, error: error instanceof Error ? error : new Error(String(error)) });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, ids.length) }, () => worker());
  await Promise.all(workers);

  if (throwOnFailure && failures.length > 0) {
    throw new Error(
      `Failed to delete ${failures.length}/${ids.length} records: ${failures.map(f => f.id).join(', ')}`
    );
  }
}
