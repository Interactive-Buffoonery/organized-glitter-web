import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import JSZip from 'jszip';

import { notify } from '@/lib/notifications';
import { getCurrentUser, isAuthenticated } from '@/services/auth';
import { AnalyticsEvent } from '@/services/analytics-events';
import { projectsService } from '@/services/pocketbase/projects.service';
import { ColoringService } from '@/services/pocketbase/coloring.service';
import { analyzePhotoFiles } from '@/features/import-export/bulk-photos/analyzePhotoFiles';
import { importBulkPhotos } from '@/features/import-export/bulk-photos/bulkPhotoImport';
import {
  captureImportExportEvent,
  captureImportExportException,
  getDurationMs,
  getImportExportStatus,
} from '@/features/import-export/importExportTelemetry';
import {
  parsePhotoImportCsv,
  parsePhotoImportJson,
  toBulkPhotoFileInputs,
} from '@/features/import-export/bulk-photos/photoImportManifest';
import type {
  BulkPhotoFileInput,
  BulkPhotoImportResult,
  BulkPhotoLibrary,
  BulkPhotoManifestEntry,
  BulkPhotoReviewRow,
} from '@/features/import-export/bulk-photos/types';
import {
  invalidateImportExportQueries,
  refreshImportExportQueriesBestEffort,
} from '@/features/import-export/archive/importInvalidation';
import { assertImportExportZipWithinSizeLimit } from '@/features/import-export/importExportFileLimits';
import {
  assertArchiveCentralDirectoryLimits,
  assertArchiveZipMetadataLimits,
  MAX_ARCHIVE_EXPANDED_BYTES,
} from '@/features/import-export/archive/archiveImportLimits';
import {
  MAX_ARCHIVE_MANIFEST_BYTES,
  readBoundedBlob,
  readBoundedText,
} from '@/features/import-export/archive/archiveZipRead';
import { IMAGE_MAX_FILE_SIZE_BYTES } from '@/utils/image/imagePolicy';
import { createLogger } from '@/utils/logger';

const logger = createLogger('useBulkPhotoImport');

function isPhotoImportManifest(path: string): boolean {
  return /(^|\/)photo-import\.(json|csv)$/i.test(path);
}

function isImagePath(path: string): boolean {
  return /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(path);
}

function isImportableBulkRow(row: BulkPhotoReviewRow): boolean {
  return Boolean(row.confirmed && !row.excluded && row.targetId && row.targetType);
}

async function parseManifestFiles(files: BulkPhotoFileInput[]): Promise<BulkPhotoManifestEntry[]> {
  const entries: BulkPhotoManifestEntry[] = [];

  for (const input of files) {
    const path = input.path || input.file.name;
    if (!isPhotoImportManifest(path)) continue;
    const content = await input.file.text();
    if (path.toLowerCase().endsWith('.json')) {
      entries.push(...parsePhotoImportJson(content));
    } else {
      entries.push(...parsePhotoImportCsv(content));
    }
  }

  return entries;
}

async function unzipPhotoInputs(file: File): Promise<{
  files: BulkPhotoFileInput[];
  manifests: BulkPhotoManifestEntry[];
}> {
  assertImportExportZipWithinSizeLimit(file);
  await assertArchiveCentralDirectoryLimits(file, isPhotoImportManifest);
  const zip = await JSZip.loadAsync(file);
  assertArchiveZipMetadataLimits(zip, isPhotoImportManifest);
  const inputs: BulkPhotoFileInput[] = [];
  const manifests: BulkPhotoManifestEntry[] = [];
  const extractionBudget = { expandedBytes: 0 };

  for (const path of Object.keys(zip.files)) {
    const entry = zip.files[path];
    if (entry.dir) continue;

    if (isPhotoImportManifest(path)) {
      const content = await readBoundedText(
        entry,
        MAX_ARCHIVE_MANIFEST_BYTES,
        extractionBudget,
        MAX_ARCHIVE_EXPANDED_BYTES
      );
      if (path.toLowerCase().endsWith('.json')) {
        manifests.push(...parsePhotoImportJson(content));
      } else {
        manifests.push(...parsePhotoImportCsv(content));
      }
      continue;
    }

    if (!isImagePath(path)) continue;
    const blob = await readBoundedBlob(
      entry,
      IMAGE_MAX_FILE_SIZE_BYTES,
      extractionBudget,
      MAX_ARCHIVE_EXPANDED_BYTES
    );
    inputs.push({
      file: new File([blob], path.split('/').pop() || 'photo.jpg', { type: blob.type }),
      path,
    });
  }

  return { files: inputs, manifests };
}

async function loadBulkPhotoLibrary(): Promise<BulkPhotoLibrary> {
  if (!isAuthenticated()) {
    throw new Error('You must be logged in to import photos');
  }

  const user = getCurrentUser();
  if (!user?.id) {
    throw new Error('You must be logged in to import photos');
  }

  const [diamondProjects, booksResult] = await Promise.all([
    projectsService.getAllForUser(user.id),
    ColoringService.listAllBooks({ userId: user.id }),
  ]);

  const pagesByBookId = await ColoringService.listAllPagesByBook(
    user.id,
    booksResult.map(book => book.id)
  );
  const coloringPages = booksResult.flatMap(book =>
    pagesByBookId[book.id].map(page => ({ ...page, bookTitle: book.title }))
  );

  return {
    diamondProjects,
    coloringBooks: booksResult,
    coloringPages,
  };
}

export function useBulkPhotoImport() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<BulkPhotoReviewRow[]>([]);
  const [lastResult, setLastResult] = useState<BulkPhotoImportResult | null>(null);
  const [library, setLibrary] = useState<BulkPhotoLibrary | null>(null);
  const analysisIdRef = useRef(0);
  const readyAnalysisIdRef = useRef<number | null>(null);
  const [readyAnalysisId, setReadyAnalysisId] = useState<number | null>(null);

  const beginAnalysis = useCallback(() => {
    const analysisId = ++analysisIdRef.current;
    readyAnalysisIdRef.current = null;
    setReadyAnalysisId(null);
    setRows([]);
    setLibrary(null);
    setLastResult(null);
    setLoading(true);
    return analysisId;
  }, []);

  const analyzeInputs = useCallback(
    async (
      inputs: BulkPhotoFileInput[],
      analysisId: number,
      manifests: BulkPhotoManifestEntry[] = []
    ) => {
      try {
        const loadedLibrary = await loadBulkPhotoLibrary();
        const embeddedManifests = await parseManifestFiles(inputs);
        const reviewRows = analyzePhotoFiles(inputs, loadedLibrary, [
          ...embeddedManifests,
          ...manifests,
        ]);
        if (analysisIdRef.current !== analysisId) return [];
        setLibrary(loadedLibrary);
        setRows(reviewRows);
        setLastResult(null);
        readyAnalysisIdRef.current = analysisId;
        setReadyAnalysisId(analysisId);
        notify({
          kind: 'info',
          title: 'Photo matches ready',
          description: `${reviewRows.length} image file${reviewRows.length === 1 ? '' : 's'} ready to review.`,
        });
        return reviewRows;
      } catch (error) {
        if (analysisIdRef.current !== analysisId) return [];
        const message = error instanceof Error ? error.message : 'Could not analyze photos';
        logger.error('Bulk photo analysis failed', error);
        captureImportExportException(error, {
          source: 'bulk_photo_import',
          operation: 'analyze_files',
          status: 'failed',
          failed_count: 1,
        });
        notify({ kind: 'error', title: 'Photo analysis failed', description: message });
        return [];
      } finally {
        if (analysisIdRef.current === analysisId) setLoading(false);
      }
    },
    []
  );

  const analyzeFileList = useCallback(
    async (files: FileList | File[]) => {
      const analysisId = beginAnalysis();
      return analyzeInputs(toBulkPhotoFileInputs(files), analysisId);
    },
    [analyzeInputs, beginAnalysis]
  );

  const analyzeZipFile = useCallback(
    async (file: File) => {
      const analysisId = beginAnalysis();
      try {
        const { files, manifests } = await unzipPhotoInputs(file);
        if (analysisIdRef.current !== analysisId) return [];
        return await analyzeInputs(files, analysisId, manifests);
      } catch (error) {
        if (analysisIdRef.current !== analysisId) return [];
        const message = error instanceof Error ? error.message : 'Could not read ZIP file';
        logger.error('Bulk photo ZIP analysis failed', error);
        captureImportExportException(error, {
          source: 'bulk_photo_import',
          operation: 'analyze_zip',
          status: 'failed',
          failed_count: 1,
        });
        notify({ kind: 'error', title: 'ZIP import failed', description: message });
        return [];
      } finally {
        if (analysisIdRef.current === analysisId) setLoading(false);
      }
    },
    [analyzeInputs, beginAnalysis]
  );

  const updateRow = useCallback((rowId: string, patch: Partial<BulkPhotoReviewRow>) => {
    setRows(currentRows => currentRows.map(row => (row.id === rowId ? { ...row, ...patch } : row)));
  }, []);

  const importConfirmed = useCallback(async () => {
    if (!library || readyAnalysisId === null || readyAnalysisIdRef.current !== readyAnalysisId) {
      return null;
    }
    setLoading(true);
    const startedAt = Date.now();
    const selectedCount = rows.filter(isImportableBulkRow).length;
    captureImportExportEvent(AnalyticsEvent.BULK_PHOTO_IMPORT_STARTED, {
      source: 'bulk_photos',
      records: selectedCount,
    });
    try {
      const result = await importBulkPhotos(rows, library);
      if (analysisIdRef.current === readyAnalysisId) setLastResult(result);
      await refreshImportExportQueriesBestEffort(
        () =>
          invalidateImportExportQueries(queryClient, [], {
            exceptionSource: 'bulk_photo_import',
          }),
        'bulk_photo_import'
      );
      captureImportExportEvent(AnalyticsEvent.BULK_PHOTO_IMPORT_COMPLETED, {
        source: 'bulk_photos',
        status: getImportExportStatus({
          success: result.failedCount === 0,
          records: result.importedCount,
          errors: result.failedCount,
        }),
        records: selectedCount,
        skipped: result.skippedCount,
        errors: result.failedCount,
        imported_photos: result.importedCount,
        duration_ms: getDurationMs(startedAt),
      });
      notify({
        kind: result.failedCount > 0 ? 'warning' : 'success',
        title:
          result.failedCount > 0 ? 'Photo import completed with errors' : 'Photo import complete',
        description: `${result.importedCount} imported, ${result.skippedCount} skipped, ${result.failedCount} failed.`,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Photo import failed';
      logger.error('Bulk photo import failed', error);
      captureImportExportException(error, {
        source: 'bulk_photo_import',
        operation: 'import_confirmed_photos',
        status: 'failed',
        failed_count: 1,
      });
      captureImportExportEvent(AnalyticsEvent.BULK_PHOTO_IMPORT_COMPLETED, {
        source: 'bulk_photos',
        status: 'failed',
        records: selectedCount,
        errors: 1,
        duration_ms: getDurationMs(startedAt),
      });
      notify({ kind: 'error', title: 'Photo import failed', description: message });
      return null;
    } finally {
      if (analysisIdRef.current === readyAnalysisId) setLoading(false);
    }
  }, [library, queryClient, readyAnalysisId, rows]);

  return {
    analyzeFileList,
    analyzeZipFile,
    importConfirmed,
    updateRow,
    rows,
    setRows,
    library,
    loading,
    lastResult,
  };
}
