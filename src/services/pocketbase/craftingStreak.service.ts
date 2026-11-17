import { pb } from '@/lib/pocketbase';
import { Collections } from '@/types/pocketbase.types';
import { savedDay, type DayMark } from '@/features/crafting-streak/streak';

const PAGE_SIZE = 500;
const MAX_RECORDS = 10_000;
// ponytail: activity older than 400 days is not read, so a longer streak counts only notes
// and marks there. Store daily rollups if that ever matters.
const ACTIVITY_WINDOW_DAYS = 400;

export interface CraftingHistory {
  noteDates: string[];
  slots: string[];
  marks: DayMark[];
}

type Row = { id: string } & Record<string, string>;

async function readAll(
  collection: string,
  filter: string,
  params: Record<string, string>,
  field: string,
  signal?: AbortSignal
): Promise<Row[]> {
  const rows: Row[] = [];
  const seen = new Set<string>();
  let expected: number | undefined;
  for (let page = 1; ; page += 1) {
    signal?.throwIfAborted();
    const result = await pb.collection(collection).getList<Row>(page, PAGE_SIZE, {
      filter: pb.filter(filter, params),
      sort: 'id',
      fields: `id,${field}`,
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
      if (!item.id || seen.has(item.id)) throw new Error('Crafting history changed during refresh');
      seen.add(item.id);
      rows.push(item);
    }
    if (seen.size === expected) return rows;
  }
}

export class CraftingStreakService {
  static async history(userId: string, now: Date, signal?: AbortSignal): Promise<CraftingHistory> {
    const notes = [
      ...(await readAll(
        Collections.ProgressNotes,
        'project.user = {:userId}',
        { userId },
        'date',
        signal
      )),
      ...(await readAll(
        Collections.ColoringPageProgressNotes,
        'user = {:userId} && page.book.user = {:userId}',
        { userId },
        'date',
        signal
      )),
    ];
    const since = new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * 86_400_000)
      .toISOString()
      .replace('T', ' ');
    const activity = await readAll(
      Collections.CraftingActivity,
      'user = {:userId} && slot >= {:since}',
      { userId, since },
      'slot',
      signal
    );
    const marks = await readAll(
      Collections.CraftingDayMarks,
      'user = {:userId}',
      { userId },
      'day',
      signal
    );
    signal?.throwIfAborted();
    return {
      noteDates: notes.map(row => savedDay(row.date)).filter((day): day is string => !!day),
      slots: activity.map(row => row.slot),
      marks: marks.map(row => ({ id: row.id, day: row.day })),
    };
  }

  static async mark(userId: string, day: string): Promise<DayMark> {
    const record = await pb
      .collection(Collections.CraftingDayMarks)
      .create<DayMark>({ user: userId, day }, { fields: 'id,day' });
    return { id: record.id, day: record.day };
  }

  static async unmark(markId: string): Promise<void> {
    await pb.collection(Collections.CraftingDayMarks).delete(markId);
  }
}
