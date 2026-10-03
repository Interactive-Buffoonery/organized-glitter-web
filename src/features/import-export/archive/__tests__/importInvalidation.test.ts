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

  it('invalidates coloring mediums after archive imports can create them', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);

    await invalidateImportExportQueries({ invalidateQueries } as unknown as QueryClient);

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.coloring.mediums.all,
    });
  });

  it('invalidates project detail caches for each imported project id', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);

    await invalidateImportExportQueries({ invalidateQueries } as unknown as QueryClient, [
      'proj_a',
      'proj_b',
    ]);

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.projects.detail('proj_a'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.projects.detail('proj_b'),
    });
  });
});
