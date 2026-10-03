import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/hooks/queries/queryKeys';
import {
  captureImportExportException,
  type ImportExportExceptionSource,
} from '@/features/import-export/importExportTelemetry';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ImportExportInvalidation');

interface ImportExportInvalidationOptions {
  exceptionSource?: ImportExportExceptionSource;
  archiveSchemaVersion?: number;
}

export async function refreshImportExportQueriesBestEffort(
  refresh: () => Promise<void>,
  source: ImportExportExceptionSource
): Promise<void> {
  try {
    await refresh();
  } catch (error) {
    logger.warn('Import/export cache refresh failed', { source, error });
  }
}

export async function invalidateImportExportQueries(
  queryClient: QueryClient,
  createdProjectIds: string[] = [],
  options: ImportExportInvalidationOptions = {}
): Promise<void> {
  const results = await Promise.allSettled([
    queryClient.invalidateQueries({ queryKey: queryKeys.coloring.colorReferences.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() }),
    ...createdProjectIds.map(projectId =>
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) })
    ),
    queryClient.invalidateQueries({ queryKey: queryKeys.progressNotes.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.tags.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.tags.stats() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.coloring.books.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.coloring.pages.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.coloring.pageProgressNotes.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.coloring.mediums.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.coloring.tags.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.stats.all }),
  ]);

  const rejected = results.filter(result => result.status === 'rejected');
  if (rejected.length > 0) {
    logger.warn('Some import/export cache invalidations failed', { failedCount: rejected.length });
    if (options.exceptionSource) {
      captureImportExportException(new Error('Import/export cache refresh failed'), {
        source: options.exceptionSource,
        operation: 'invalidate_queries',
        archive_schema_version: options.archiveSchemaVersion,
        status: 'success',
        failed_count: rejected.length,
        impact: 'cache_refresh',
      });
    }
  }
}
