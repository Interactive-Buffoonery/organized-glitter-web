import { createTestQueryClient } from '@/test-utils';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { describe, expect, it, vi } from 'vitest';

import { invalidateProjectDetailAndProgressNotes, removeProjectFromLists } from '../projectCache';

describe('projectCache helpers', () => {
  it('removes a project from paginated list caches and decrements totals', () => {
    const cache = {
      projects: [
        { id: 'a', title: 'Alpha' },
        { id: 'b', title: 'Bravo' },
      ],
      totalItems: 2,
    };

    const next = removeProjectFromLists(cache, 'a') as typeof cache;

    expect(next.projects).toEqual([{ id: 'b', title: 'Bravo' }]);
    expect(next.totalItems).toBe(1);
  });

  it('invalidates project detail and all progress note list queries', () => {
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    invalidateProjectDetailAndProgressNotes(queryClient, 'project-123');

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.projects.detail('project-123'),
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.progressNotes.lists(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.notesFeed.all,
    });
  });

  it('settles failed refreshes after attempting every progress note cache', async () => {
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockRejectedValueOnce(new Error('Detail refresh failed'))
      .mockResolvedValue(undefined);

    const results = await invalidateProjectDetailAndProgressNotes(queryClient, 'project-123');

    expect(invalidateSpy).toHaveBeenCalledTimes(3);
    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ status: 'rejected' });
    expect(results.slice(1)).toEqual([
      { status: 'fulfilled', value: undefined },
      { status: 'fulfilled', value: undefined },
    ]);
  });
});
