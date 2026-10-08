import { AnalyticsEvent } from '@/services/analytics-events';
import { capture, captureException } from '@/services/analytics-escape-hatch';
import { classifyExternalError } from '@/utils/error/exceptionContext';

const IMPORT_EXPORT_SURFACE = 'settings_data' as const;
const SUPPORTED_ARCHIVE_SCHEMA_VERSIONS: readonly number[] = [1, 2, 3];

type ImportExportSource = 'archive' | 'dac_csv' | 'organized_csv' | 'bulk_photos';
export type ImportExportStatus = 'success' | 'partial' | 'failed';
export type ImportExportExceptionSource =
  | 'archive_import'
  | 'archive_export'
  | 'bulk_photo_import'
  | 'dac_import'
  | 'organized_csv_import'
  | 'csv_export';
type ImportExportExceptionOperation =
  | 'analyze_files'
  | 'analyze_zip'
  | 'append_coloring_page_photos'
  | 'export_archive'
  | 'export_csv'
  | 'get_private_file_token'
  | 'import_archive'
  | 'import_coloring_book'
  | 'import_confirmed_photos'
  | 'import_dac_csv'
  | 'import_dac_project'
  | 'import_diamond_project'
  | 'import_organized_csv'
  | 'import_photo'
  | 'invalidate_queries'
  | 'load_export_source'
  | 'map_coloring_medium'
  | 'preview_dac_csv'
  | 'read_archive_manifest'
  | 'restore_coloring_color_reference'
  | 'restore_coloring_page_metadata';

type AnalyticsEventName = (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];

export interface ImportExportEventProperties {
  source: ImportExportSource;
  status?: ImportExportStatus;
  records?: number;
  existing_records?: number;
  created_library_items?: number;
  prepared_records?: number;
  warnings?: number;
  errors?: number;
  skipped?: number;
  imported_photos?: number;
  duration_ms?: number;
  file_size_bucket?: string;
  archive_schema_version?: number;
}

export interface ImportExportExceptionProperties {
  source: ImportExportExceptionSource;
  operation: ImportExportExceptionOperation;
  archive_schema_version?: number;
  status?: ImportExportStatus;
  failed_count?: number;
  warning_count?: number;
  impact?: 'cache_refresh';
}

function compactProperties(properties: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== undefined));
}

export function bucketFileSize(bytes: number | undefined): string | undefined {
  if (bytes === undefined) return undefined;
  if (bytes <= 0) return '0';
  if (bytes <= 100 * 1024) return '1-100kb';
  if (bytes <= 1024 * 1024) return '100kb-1mb';
  if (bytes <= 10 * 1024 * 1024) return '1-10mb';
  if (bytes <= 50 * 1024 * 1024) return '10-50mb';
  return '50mb+';
}

function bucketCount(count: number | undefined): string | undefined {
  if (count === undefined) return undefined;
  if (count <= 0) return '0';
  if (count === 1) return '1';
  if (count <= 5) return '2-5';
  if (count <= 20) return '6-20';
  if (count <= 100) return '21-100';
  return '101+';
}

export function getImportExportStatus({
  success,
  records = 0,
  errors = 0,
  warnings = 0,
}: {
  success: boolean;
  records?: number;
  errors?: number;
  warnings?: number;
}): ImportExportStatus {
  if (errors > 0 && records > 0) return 'partial';
  if (!success || errors > 0) return 'failed';
  if (warnings > 0) return 'partial';
  return 'success';
}

export function getDurationMs(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

export function captureImportExportEvent(
  event: AnalyticsEventName,
  properties: ImportExportEventProperties
): void {
  capture(
    event,
    compactProperties({
      surface: IMPORT_EXPORT_SURFACE,
      ...properties,
    })
  );
}

export function captureImportExportException(
  error: unknown,
  properties: ImportExportExceptionProperties
): void {
  const safeError = new Error('Import/export operation failed');
  safeError.name = 'ImportExportError';

  captureException(
    safeError,
    compactProperties({
      $exception_source: properties.source,
      operation: properties.operation,
      archive_schema_version: SUPPORTED_ARCHIVE_SCHEMA_VERSIONS.includes(
        properties.archive_schema_version ?? 0
      )
        ? properties.archive_schema_version
        : undefined,
      status: properties.status,
      failed_count_bucket: bucketCount(properties.failed_count),
      warning_count_bucket: bucketCount(properties.warning_count),
      impact: properties.impact,
      surface: IMPORT_EXPORT_SURFACE,
      ...classifyExternalError(error),
    })
  );
}
