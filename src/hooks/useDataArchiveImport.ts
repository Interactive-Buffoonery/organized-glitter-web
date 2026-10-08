import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { notify } from '@/lib/notifications';
import { AnalyticsEvent } from '@/services/analytics-events';
import { getCurrentUserId, onAuthChange } from '@/services/auth';
import {
  bucketFileSize,
  captureImportExportEvent,
  captureImportExportException,
  getDurationMs,
  getImportExportStatus,
} from '@/features/import-export/importExportTelemetry';
import {
  importOrganizedGlitterArchives,
  type DispatchedArchiveImportResult,
} from '@/features/import-export/archive/importArchiveDispatcher';
import type {
  ArchiveV3ImportProgress,
  ArchiveV3ImportResult,
} from '@/features/import-export/archive/v3/import';
import type { ArchiveImportResult } from '@/features/import-export/archive/types';
import {
  invalidateImportExportQueries,
  refreshImportExportQueriesBestEffort,
} from '@/features/import-export/archive/importInvalidation';
import { createLogger } from '@/utils/logger';

const logger = createLogger('useDataArchiveImport');

function legacyProperties(result: ArchiveImportResult) {
  const successful =
    result.createdProjectCount + result.createdColoringBookCount + result.createdProgressNoteCount;
  return {
    source: 'archive' as const,
    status: getImportExportStatus({
      success: result.success,
      records: successful + result.matchedExistingRecordCount,
      errors: result.errors.length,
      warnings: result.warnings.length,
    }),
    records: successful,
    existing_records: result.matchedExistingRecordCount,
    created_library_items: result.createdProjectCount + result.createdColoringBookCount,
    errors: result.errors.length,
    skipped: result.skippedRecordCount,
    warnings: result.warnings.length,
    imported_photos: result.importedPhotoCount,
    archive_schema_version: result.archiveSchemaVersion,
  };
}

function legacyDescription(result: ArchiveImportResult): string {
  const base = `${result.createdProjectCount} diamond project${result.createdProjectCount === 1 ? '' : 's'} and ${result.createdColoringBookCount} coloring book${result.createdColoringBookCount === 1 ? '' : 's'} imported.`;
  if (result.skippedPagePhotoCount === 0) return base;
  return `${base} ${result.skippedPagePhotoCount} archived page photo${result.skippedPagePhotoCount === 1 ? '' : 's'} skipped; see warning details for pages.`;
}

function legacyProjectIds(result: ArchiveImportResult): string[] {
  return Array.from(
    new Set(
      Object.entries(result.refMap)
        .filter(([archiveRef]) => archiveRef.startsWith('project:'))
        .map(([, projectId]) => projectId)
        .filter((projectId): projectId is string => Boolean(projectId))
    )
  );
}

function v3Description(result: ArchiveV3ImportResult): string {
  const selection =
    result.missingPartNumbers.length === 0
      ? `All ${result.totalPartCount} backup parts selected.`
      : `Selected parts ${result.selectedPartNumbers.join(', ')} of ${result.totalPartCount}; the full backup was not selected.`;
  return `${selection} ${result.createdItemCount} new items, ${result.scaffoldedItemCount} prepared parent items, ${result.alreadyAppliedItemCount} already applied, ${result.conflicts.length} conflicts, ${result.errors.length} errors.`;
}

export function useDataArchiveImport() {
  const queryClient = useQueryClient();
  const mounted = useRef(true);
  const active = useRef<{
    controller: AbortController;
    accountId: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<ArchiveImportResult | null>(null);
  const [v3Result, setV3Result] = useState<ArchiveV3ImportResult | null>(null);
  const [progress, setProgress] = useState<ArchiveV3ImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = onAuthChange((_token, user) => {
      if (active.current && user?.id !== active.current.accountId) {
        active.current.controller.abort();
      }
    });
    return () => {
      mounted.current = false;
      active.current?.controller.abort();
      unsubscribe();
    };
  }, []);

  const cancelImport = useCallback(() => active.current?.controller.abort(), []);

  const clearResult = useCallback(() => {
    setLastResult(null);
    setV3Result(null);
    setError(null);
    setProgress(null);
  }, []);

  const importArchive = useCallback(
    async (selection: File | readonly File[]): Promise<DispatchedArchiveImportResult | null> => {
      if (active.current) return null;
      const files = Array.isArray(selection) ? selection : [selection];
      const accountId = getCurrentUserId();
      if (!accountId || files.length === 0) {
        const message = accountId
          ? 'Select at least one archive ZIP'
          : 'You must be logged in to import an archive';
        setError(message);
        notify({
          kind: 'error',
          title: 'Archive import failed',
          description: message,
        });
        return null;
      }
      const controller = new AbortController();
      active.current = { controller, accountId };
      setLoading(true);
      setError(null);
      setProgress(null);
      setLastResult(null);
      setV3Result(null);
      const startedAt = Date.now();
      captureImportExportEvent(AnalyticsEvent.ARCHIVE_IMPORT_STARTED, {
        source: 'archive',
        file_size_bucket: bucketFileSize(files.reduce((size, file) => size + file.size, 0)),
      });
      try {
        const dispatched = await importOrganizedGlitterArchives(files, {
          signal: controller.signal,
          onV3Progress: next => {
            if (mounted.current && active.current?.controller === controller) setProgress(next);
          },
        });
        const sameAccount = getCurrentUserId() === accountId;
        const v3 = dispatched.schemaVersion === 3 ? dispatched.result : null;
        const legacy = dispatched.schemaVersion !== 3 ? dispatched.result : null;
        // The importer may return partial writes after an abort. Preserve its actual counts.
        if (mounted.current && sameAccount) {
          setLastResult(legacy);
          setV3Result(v3);
        }
        if (legacy || v3) {
          captureImportExportEvent(AnalyticsEvent.ARCHIVE_IMPORT_COMPLETED, {
            ...(legacy
              ? legacyProperties(legacy)
              : {
                  source: 'archive' as const,
                  status: getImportExportStatus({
                    success: v3!.success,
                    records:
                      v3!.createdItemCount + v3!.scaffoldedItemCount + v3!.alreadyAppliedItemCount,
                    errors: v3!.errors.length + v3!.conflicts.length,
                    warnings: v3!.missingPartNumbers.length,
                  }),
                  records: v3!.createdItemCount,
                  created_library_items: v3!.createdLibraryItemCount,
                  existing_records: v3!.alreadyAppliedItemCount,
                  prepared_records: v3!.scaffoldedItemCount,
                  errors: v3!.errors.length + v3!.conflicts.length,
                  skipped: 0,
                  warnings: v3!.missingPartNumbers.length,
                  imported_photos: v3!.restoredAssetCount,
                  archive_schema_version: 3,
                }),
            duration_ms: getDurationMs(startedAt),
          });
          // Never refresh old-account data into a newly signed-in account's cache.
          if (sameAccount && (legacy || v3!.itemResults.length > 0)) {
            await refreshImportExportQueriesBestEffort(
              () =>
                invalidateImportExportQueries(queryClient, legacy ? legacyProjectIds(legacy) : [], {
                  exceptionSource: 'archive_import',
                  archiveSchemaVersion: dispatched.schemaVersion,
                }),
              'archive_import'
            );
          }
        }
        if (mounted.current && sameAccount) {
          const success = legacy?.success ?? v3!.success;
          notify({
            kind: success ? 'success' : 'warning',
            title: success ? 'Archive import complete' : 'Archive import completed with issues',
            description: legacy ? legacyDescription(legacy) : v3Description(v3!),
          });
        }
        return dispatched;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'Archive import failed';
        logger.error('Archive import failed', caught);
        captureImportExportException(caught, {
          source: 'archive_import',
          operation: 'import_archive',
          status: 'failed',
          failed_count: 1,
        });
        captureImportExportEvent(AnalyticsEvent.ARCHIVE_IMPORT_COMPLETED, {
          source: 'archive',
          status: 'failed',
          records: 0,
          errors: 1,
          duration_ms: getDurationMs(startedAt),
        });
        if (mounted.current && getCurrentUserId() === accountId) {
          setError(message);
          notify({
            kind: 'error',
            title: 'Archive import failed',
            description: message,
          });
        }
        return null;
      } finally {
        if (active.current?.controller === controller) active.current = null;
        if (mounted.current) setLoading(false);
      }
    },
    [queryClient]
  );

  return {
    importArchive,
    cancelImport,
    clearResult,
    loading,
    lastResult,
    v3Result,
    progress,
    error,
  };
}
