import { vi } from 'vitest';
import {
  act,
  beforeEach,
  createTestQueryClient,
  describe,
  expect,
  it,
  renderHookWithProviders,
} from '@/test-utils';

const {
  mockCapture,
  mockCaptureException,
  mockImportArchive,
  mockExportArchiveZip,
  mockDownloadBlob,
  mockNotify,
} = vi.hoisted(() => ({
  mockCapture: vi.fn(),
  mockCaptureException: vi.fn(),
  mockImportArchive: vi.fn(),
  mockExportArchiveZip: vi.fn(),
  mockDownloadBlob: vi.fn(),
  mockNotify: vi.fn(),
}));

vi.mock('@/services/analytics-escape-hatch', () => ({
  capture: mockCapture,
  captureException: mockCaptureException,
}));

vi.mock('@/features/import-export/archive/importArchiveDispatcher', () => ({
  importOrganizedGlitterArchives: mockImportArchive,
}));

vi.mock('@/services/auth', () => ({
  getCurrentUserId: () => 'user-one',
  onAuthChange: () => () => {},
}));

vi.mock('@/features/import-export/archive/exportArchive', () => ({
  exportArchiveZip: mockExportArchiveZip,
}));

vi.mock('@/features/import-export/archive/download', () => ({
  downloadBlob: mockDownloadBlob,
}));

vi.mock('@/lib/notifications', () => ({
  notify: mockNotify,
}));

const { useDataArchiveImport } = await import('@/hooks/useDataArchiveImport');
const { useDataArchiveExport } = await import('@/hooks/useDataArchiveExport');
const { AnalyticsEvent } = await import('@/services/analytics-events');

function expectCapturedPropertiesToExclude(values: string[]): void {
  const propertyPayloads = [
    ...mockCapture.mock.calls.map(([, properties]) => properties),
    ...mockCaptureException.mock.calls.map(([, properties]) => properties),
  ];

  for (const properties of propertyPayloads) {
    const serialized = JSON.stringify(properties ?? {});
    for (const value of values) {
      expect(serialized).not.toContain(value);
    }
  }
}

describe('archive import/export analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captures archive import start and completion counts', async () => {
    mockImportArchive.mockResolvedValue({
      schemaVersion: 1,
      result: {
        success: true,
        createdProjectCount: 2,
        createdColoringBookCount: 1,
        createdProgressNoteCount: 4,
        importedPhotoCount: 3,
        skippedRecordCount: 1,
        skippedPagePhotoCount: 1,
        matchedExistingRecordCount: 0,
        archiveSchemaVersion: 1,
        refMap: {
          'project:old-project': 'current-project',
          'project-note:old-note': 'current-note',
        },
        warnings: [{ code: 'missing-photo-file', message: 'Missing photo' }],
        errors: [],
      },
    });

    const archiveFile = new File(['zip'], 'organized-glitter-archive.zip', {
      type: 'application/zip',
    });
    const queryClient = createTestQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHookWithProviders(() => useDataArchiveImport(), { queryClient });

    await act(async () => {
      await result.current.importArchive(archiveFile);
    });

    expect(mockCapture).toHaveBeenCalledWith(AnalyticsEvent.ARCHIVE_IMPORT_STARTED, {
      surface: 'settings_data',
      source: 'archive',
      file_size_bucket: '1-100kb',
    });
    expect(mockCapture).toHaveBeenCalledWith(AnalyticsEvent.ARCHIVE_IMPORT_COMPLETED, {
      surface: 'settings_data',
      source: 'archive',
      status: 'partial',
      records: 7,
      errors: 0,
      skipped: 1,
      warnings: 1,
      imported_photos: 3,
      archive_schema_version: 1,
      duration_ms: expect.any(Number),
    });
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'success',
      })
    );
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: expect.arrayContaining(['projects', 'detail', 'current-project']),
    });
    expectCapturedPropertiesToExclude(['organized-glitter-archive.zip']);
  });

  it('captures archive export start and completion metadata', async () => {
    mockExportArchiveZip.mockResolvedValue({
      blob: new Blob(['zip'], { type: 'application/zip' }),
      filename: 'organized-glitter-archive-2026-05-20.zip',
      warnings: [{ code: 'missing-photo-file', message: 'Missing photo' }],
      archiveSchemaVersion: 1,
    });

    const { result } = renderHookWithProviders(() => useDataArchiveExport());

    await act(async () => {
      await result.current.exportArchive();
    });

    expect(mockCapture).toHaveBeenCalledWith(AnalyticsEvent.ARCHIVE_EXPORT_STARTED, {
      surface: 'settings_data',
      source: 'archive',
    });
    expect(mockCapture).toHaveBeenCalledWith(AnalyticsEvent.ARCHIVE_EXPORT_COMPLETED, {
      surface: 'settings_data',
      source: 'archive',
      status: 'partial',
      warnings: 1,
      errors: 0,
      duration_ms: expect.any(Number),
      archive_schema_version: 1,
    });
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'warning',
      })
    );
    expectCapturedPropertiesToExclude(['organized-glitter-archive-2026-05-20.zip']);
  });

  it('captures archive import failures without sensitive payload properties', async () => {
    mockImportArchive.mockRejectedValue(
      new Error('backup.zip project-123 manifest/path https://example.test/private Sarah')
    );

    const archiveFile = new File(['zip'], 'backup.zip', {
      type: 'application/zip',
    });
    const { result } = renderHookWithProviders(() => useDataArchiveImport());

    await act(async () => {
      await result.current.importArchive(archiveFile);
    });

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        $exception_source: 'archive_import',
        operation: 'import_archive',
        status: 'failed',
        failed_count_bucket: '1',
        surface: 'settings_data',
      })
    );
    expect(mockCapture).toHaveBeenCalledWith(
      AnalyticsEvent.ARCHIVE_IMPORT_COMPLETED,
      expect.objectContaining({
        source: 'archive',
        status: 'failed',
        records: 0,
        errors: 1,
      })
    );
    expectCapturedPropertiesToExclude([
      'backup.zip',
      'project-123',
      'manifest/path',
      'https://example.test',
      'Sarah',
    ]);
  });

  it('captures archive export failures without sensitive payload properties', async () => {
    mockExportArchiveZip.mockRejectedValue(
      new Error('export.zip project-123 photos/private/path https://example.test/export Sarah')
    );
    const { result } = renderHookWithProviders(() => useDataArchiveExport());

    await act(async () => {
      await result.current.exportArchive();
    });

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        $exception_source: 'archive_export',
        operation: 'export_archive',
        status: 'failed',
        failed_count_bucket: '1',
        surface: 'settings_data',
      })
    );
    expect(mockCapture).toHaveBeenCalledWith(
      AnalyticsEvent.ARCHIVE_EXPORT_COMPLETED,
      expect.objectContaining({
        source: 'archive',
        status: 'failed',
        warnings: 0,
        errors: 1,
      })
    );
    expect(mockDownloadBlob).not.toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }));
    expect(mockNotify).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' }));
    expectCapturedPropertiesToExclude([
      'export.zip',
      'project-123',
      'photos/private/path',
      'https://example.test',
      'Sarah',
    ]);
  });

  it('keeps successful archive writes successful when cache refresh fails', async () => {
    mockImportArchive.mockResolvedValue({
      schemaVersion: 1,
      result: {
        success: true,
        createdProjectCount: 1,
        createdColoringBookCount: 0,
        createdProgressNoteCount: 0,
        importedPhotoCount: 0,
        skippedRecordCount: 0,
        skippedPagePhotoCount: 0,
        matchedExistingRecordCount: 0,
        archiveSchemaVersion: 1,
        refMap: {},
        warnings: [],
        errors: [],
      },
    });
    const queryClient = createTestQueryClient();
    vi.spyOn(queryClient, 'invalidateQueries').mockRejectedValue(
      new Error('cache failed for project-123')
    );
    const archiveFile = new File(['zip'], 'archive.zip', {
      type: 'application/zip',
    });
    const { result } = renderHookWithProviders(() => useDataArchiveImport(), { queryClient });

    let importResult;
    await act(async () => {
      importResult = await result.current.importArchive(archiveFile);
    });

    expect(importResult).toEqual({
      schemaVersion: 1,
      result: expect.objectContaining({ success: true }),
    });
    expect(mockCapture).toHaveBeenCalledWith(
      AnalyticsEvent.ARCHIVE_IMPORT_COMPLETED,
      expect.objectContaining({
        source: 'archive',
        status: 'success',
        records: 1,
        errors: 0,
      })
    );
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        $exception_source: 'archive_import',
        operation: 'invalidate_queries',
        impact: 'cache_refresh',
        status: 'success',
        surface: 'settings_data',
      })
    );
    expectCapturedPropertiesToExclude(['project-123']);
  });
});
