import { pb } from '@/lib/pocketbase';
import { Collections } from '@/types/pocketbase.types';
import { savedDay } from '@/features/crafting-streak/streak';

const PAGE_SIZE = 500;
const MAX_RECORDS = 10_000;

export class CraftingStreakService {
  static async dates(userId: string, signal?: AbortSignal): Promise<string[]> {
    const sources = [
      { collection: Collections.ProgressNotes, filter: 'project.user = {:userId}' },
      {
        collection: Collections.ColoringPageProgressNotes,
        filter: 'user = {:userId} && page.book.user = {:userId}',
      },
    ];
    const dates: string[] = [];
    for (const source of sources) {
      const seen = new Set<string>();
      let expected: number | undefined;
      for (let page = 1; ; page += 1) {
        signal?.throwIfAborted();
        const result = await pb
          .collection(source.collection)
          .getList<{ id: string; date: string }>(page, PAGE_SIZE, {
            filter: pb.filter(source.filter, { userId }),
            sort: 'id',
            fields: 'id,date',
            signal,
          });
        if (
          !Number.isInteger(result.totalItems) ||
          result.totalItems < 0 ||
          result.totalItems > MAX_RECORDS ||
          result.page !== page ||
          result.totalPages !== Math.ceil(result.totalItems / PAGE_SIZE) ||
          (expected !== undefined && expected !== result.totalItems)
        ) {
          throw new Error('Crafting history is incomplete');
        }
        expected = result.totalItems;
        const expectedSize = Math.min(PAGE_SIZE, expected - seen.size);
        if (result.items.length !== expectedSize) throw new Error('Crafting history is incomplete');
        for (const item of result.items) {
          if (!item.id || seen.has(item.id))
            throw new Error('Crafting history changed during refresh');
          seen.add(item.id);
          const day = savedDay(item.date);
          if (day) dates.push(day);
        }
        if (seen.size === expected) break;
      }
    }
    signal?.throwIfAborted();
    return dates;
  }
}
