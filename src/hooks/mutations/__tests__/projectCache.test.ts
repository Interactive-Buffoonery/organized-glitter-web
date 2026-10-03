import { createTestQueryClient } from '@/test-utils';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { describe, expect, it, vi } from 'vitest';
import { invalidateNotesFeedQueries } from '@/hooks/queries/notesFeedCache';

import {
  invalidateProjectDetailAndProgressNotes,
  patchProjectDetail,
  patchProjectInLists,
  removeProjectFromLists,
} from '../projectCache';

describe('projectCache helpers', () => {
  it('patches a project inside paginated list caches', () => {
    const cache = {
      projects: [
        { id: 'a', title: 'Alpha', status: 'wishlist' },
        { id: 'b', title: 'Bravo', status: 'progress' },
      ],
      totalItems: 2,
    };

    const next = patchProjectInLists(cache, 'b', { status: 'archived' }) as typeof cache;

    expect(next).not.toBe(cache);
    expect(next.projects[1]).toEqual({
      id: 'b',
      title: 'Bravo',
      status: 'archived',
    });
  });

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

  it('passes through unrelated cache shapes unchanged', () => {
    const unrelated = { foo: 'bar' };

    expect(patchProjectDetail(unrelated, { title: 'Updated' })).toBe(unrelated);
    expect(patchProjectInLists(unrelated, 'x', { status: 'archived' })).toBe(unrelated);
    expect(removeProjectFromLists(unrelated, 'x')).toBe(unrelated);
  });

  it('patches a project detail cache object', () => {
    const cache = { id: 'a', title: 'Alpha', status: 'wishlist' };

    expect(patchProjectDetail(cache, { status: 'progress' })).toEqual({
      id: 'a',
      title: 'Alpha',
      status: 'progress',
    });
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

  it('invalidates the dedicated notes feed query tree', () => {
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    invalidateNotesFeedQueries(queryClient);

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.notesFeed.all,
    });
  });

  it('can invalidate a scoped notes feed list when user context is available', () => {
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    invalidateNotesFeedQueries(queryClient, {
      userId: 'user-123',
      craft: 'diamond',
      projectId: 'project-123',
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.notesFeed.list('user-123', {
        craft: 'diamond',
        projectId: 'project-123',
      }),
    });
  });
});
