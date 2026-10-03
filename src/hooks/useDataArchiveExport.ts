import { useCallback, useState } from 'react';

import { notify } from '@/lib/notifications';
import { AnalyticsEvent } from '@/services/analytics-events';
import {
  captureImportExportEvent,
  captureImportExportException,
  getDurationMs,
  getImportExportStatus,
} from '@/features/import-export/importExportTelemetry';
import { downloadBlob } from '@/features/import-export/archive/download';
import {
  exportArchiveZip,
  type CreateArchiveZipOptions,
} from '@/features/import-export/archive/exportArchive';
import type { ArchiveExportResult } from '@/features/import-export/archive/types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('useDataArchiveExport');

export function useDataArchiveExport() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastResult, setLastResult] = useState<ArchiveExportResult | null>(null);

  const exportArchive = useCallback(async (): Promise<ArchiveExportResult> => {
    setLoading(true);
    setProgress(0);
    const startedAt = Date.now();
    captureImportExportEvent(AnalyticsEvent.ARCHIVE_EXPORT_STARTED, { source: 'archive' });
    try {
      const options: CreateArchiveZipOptions = {
        onProgress: setProgress,
      };
      const { blob, filename, warnings, archiveSchemaVersion } = await exportArchiveZip(options);
      downloadBlob(blob, filename);

      const result: ArchiveExportResult = {
        success: true,
        filename,
        warningCount: warnings.length,
        warnings,
        archiveSchemaVersion,
      };
      setLastResult(result);
      captureImportExportEvent(AnalyticsEvent.ARCHIVE_EXPORT_COMPLETED, {
        source: 'archive',
        status: getImportExportStatus({
          success: true,
          warnings: warnings.length,
        }),
        warnings: warnings.length,
        errors: 0,
        duration_ms: getDurationMs(startedAt),
        archive_schema_version: archiveSchemaVersion,
      });

      notify({
        kind: warnings.length > 0 ? 'warning' : 'success',
        title: warnings.length > 0 ? 'Archive exported with warnings' : 'Archive export complete',
        description:
          warnings.length > 0
            ? `${warnings.length} warning${warnings.length === 1 ? '' : 's'} occurred. Review the archive details.`
            : `${filename} is ready.`,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Archive export failed';
      logger.error('Archive export failed', error);
      captureImportExportException(error, {
        source: 'archive_export',
        operation: 'export_archive',
        status: 'failed',
        failed_count: 1,
      });
      const result: ArchiveExportResult = {
        success: false,
        warningCount: 0,
        warnings: [],
        error: message,
      };
      setLastResult(result);
      captureImportExportEvent(AnalyticsEvent.ARCHIVE_EXPORT_COMPLETED, {
        source: 'archive',
        status: 'failed',
        warnings: 0,
        errors: 1,
        duration_ms: getDurationMs(startedAt),
      });
      notify({ kind: 'error', title: 'Archive export failed', description: message });
      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    exportArchive,
    loading,
    progress,
    lastResult,
  };
}
