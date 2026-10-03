import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientResponseError } from 'pocketbase';
import { fetchLatestNotes } from '../base/latestNotes';
import { pb } from '@/lib/pocketbase';

vi.mock('@/lib/pocketbase', () => ({ pb: { send: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

describe('batched latest notes', () => {
  it('uses two requests for 150 targets and preserves every returned note', async () => {
    vi.mocked(pb.send).mockImplementation(async (_path, options) => ({
      items: options?.body.targetIds.map((id: string) => ({
        id: `note-${id}`,
        targetId: id,
        date: '2026-09-06',
        created: '2026-09-06',
      })),
    }));
    const ids = Array.from({ length: 150 }, (_, i) => `target${i}`);
    const notes = await fetchLatestNotes('diamond', 'user1', [...ids, ids[0]]);
    expect(pb.send).toHaveBeenCalledTimes(2);
    expect(notes?.map(note => note.targetId)).toEqual(ids);
  });

  it('falls back only when the route is missing', async () => {
    vi.mocked(pb.send).mockRejectedValue(new ClientResponseError({ status: 404 }));
    await expect(fetchLatestNotes('coloring', 'user1', ['page1'])).resolves.toBeNull();
    const failure = new ClientResponseError({ status: 403 });
    vi.mocked(pb.send).mockRejectedValue(failure);
    await expect(fetchLatestNotes('coloring', 'user1', ['page1'])).rejects.toBe(failure);
  });

  it('does not request empty target lists', async () => {
    await expect(fetchLatestNotes('diamond', 'user1', [])).resolves.toEqual([]);
    expect(pb.send).not.toHaveBeenCalled();
  });
});
