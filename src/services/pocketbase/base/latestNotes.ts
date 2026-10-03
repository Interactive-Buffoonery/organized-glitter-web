import { ClientResponseError } from 'pocketbase';
import { pb } from '@/lib/pocketbase';
import { mapWithConcurrency } from './mapWithConcurrency';

export interface LatestNoteRow {
  id: string;
  targetId: string;
  date: string;
  created: string;
}

export async function fetchLatestNotes(
  craft: 'diamond' | 'coloring',
  userId: string,
  targetIds: string[]
): Promise<LatestNoteRow[] | null> {
  const ids = [...new Set(targetIds)];
  const batches: string[][] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    batches.push(ids.slice(offset, offset + 100));
  }
  try {
    const results = await mapWithConcurrency(batches, 2, ids =>
      pb.send<{ items: LatestNoteRow[] }>('/api/notes/latest', {
        method: 'POST',
        body: { craft, userId, targetIds: ids },
        requestKey: null,
      })
    );
    return results.flatMap(result => result.items);
  } catch (error) {
    // Older backends retain bounded per-target lookups during hook rollout.
    if (error instanceof ClientResponseError && error.status === 404) return null;
    throw error;
  }
}
