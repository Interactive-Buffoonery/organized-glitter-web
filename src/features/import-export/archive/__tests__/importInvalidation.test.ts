import { describe, expect, it, vi } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';

import {
  invalidateImportExportQueries,
  refreshImportExportQueriesBestEffort,
} from '@/features/import-export/archive/importInvalidation';
import { queryKeys } from '@/hooks/queries/queryKeys';

describe('import/export query invalidation', () => {
  it('keeps a completed import successful when refresh rejects', async () => {
    const refresh = vi.fn().mockRejectedValue(new Error('cache refresh failed'));

    await expect(refreshImportExportQueriesBestEffort(refresh, 'bulk_photo_import')).resolves.toBe(
      undefined
    );
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('invalidates every imported cache family and created project detail', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);

    await invalidateImportExportQueries({ invalidateQueries } as unknown as QueryClient, [
      'proj_a',
      'proj_b',
    ]);

    const expectedInvalidations = [
      { queryKey: queryKeys.coloring.colorReferences.all },
      { queryKey: queryKeys.projects.lists() },
      { queryKey: queryKeys.projects.detail('proj_a') },
      { queryKey: queryKeys.projects.detail('proj_b') },
      { queryKey: queryKeys.progressNotes.all },
      { queryKey: queryKeys.tags.all },
      { queryKey: queryKeys.tags.stats() },
      { queryKey: queryKeys.coloring.books.all },
      { queryKey: queryKeys.coloring.pages.all },
      { queryKey: queryKeys.coloring.pageProgressNotes.all },
      { queryKey: queryKeys.coloring.mediums.all },
      { queryKey: queryKeys.coloring.tags.all },
      { queryKey: queryKeys.stats.all },
    ];
    const actualInvalidations = invalidateQueries.mock.calls.map(([filters]) => filters);

    expect(actualInvalidations).toHaveLength(expectedInvalidations.length);
    expect(actualInvalidations).toEqual(expect.arrayContaining(expectedInvalidations));
  });
});
