import { vi } from 'vitest';
import JSZip from 'jszip';
import { act, beforeEach, describe, expect, it, renderHookWithProviders } from '@/test-utils';

const {
  mockCapture,
  mockCaptureException,
  mockImportBulkPhotos,
  mockInvalidate,
  mockNotify,
  serviceMocks,
} = vi.hoisted(() => ({
  mockCapture: vi.fn(),
  mockCaptureException: vi.fn(),
  mockImportBulkPhotos: vi.fn(),
  mockInvalidate: vi.fn(),
  mockNotify: vi.fn(),
  serviceMocks: {
    auth: {
      isAuthenticated: vi.fn(),
      getCurrentUser: vi.fn(),
    },
    projectsService: {
      getAllForUser: vi.fn(),
    },
    coloringService: {
      listAllBooks: vi.fn(),
      listAllPages: vi.fn(),
      listAllPagesByBook: vi.fn(),
    },
  },
}));

vi.mock('@/services/analytics-escape-hatch', () => ({
  capture: mockCapture,
  captureException: mockCaptureException,
}));

vi.mock('@/lib/notifications', () => ({
  notify: mockNotify,
}));

vi.mock('@/services/auth', () => serviceMocks.auth);

vi.mock('@/services/pocketbase/projects.service', () => ({
  projectsService: serviceMocks.projectsService,
}));

vi.mock('@/services/pocketbase/coloring.service', () => ({
  ColoringService: serviceMocks.coloringService,
}));

vi.mock('@/features/import-export/bulk-photos/bulkPhotoImport', () => ({
  importBulkPhotos: mockImportBulkPhotos,
}));

vi.mock('@/features/import-export/archive/importInvalidation', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/import-export/archive/importInvalidation')>()),
  invalidateImportExportQueries: mockInvalidate,
}));

const { useBulkPhotoImport } = await import('@/hooks/useBulkPhotoImport');
const { AnalyticsEvent } = await import('@/services/analytics-events');
const { IMPORT_EXPORT_ARCHIVE_MAX_SIZE_BYTES } =
  await import('@/features/import-export/importExportFileLimits');

function fileWithPath(name: string, path: string): File {
  const file = new File(['image'], name, { type: 'image/jpeg' });
  Object.defineProperty(file, 'webkitRelativePath', {
    value: path,
    configurable: true,
  });
  return file;
}

function manifestFile(content: string): File {
  const file = fileWithPath('photo-import.json', 'photo-import.json');
  Object.defineProperty(file, 'text', { value: async () => content });
  return file;
}

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

describe('bulk photo import analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvalidate.mockResolvedValue(undefined);
    serviceMocks.auth.isAuthenticated.mockReturnValue(true);
    serviceMocks.auth.getCurrentUser.mockReturnValue({ id: 'user-1' });
    serviceMocks.projectsService.getAllForUser.mockResolvedValue([
      {
        id: 'project-1',
        userId: 'user-1',
        title: 'Starry Fox',
        status: 'purchased',
        imageUrl: undefined,
        createdAt: '',
        updatedAt: '',
      },
    ]);
    serviceMocks.coloringService.listAllBooks.mockResolvedValue([]);
    serviceMocks.coloringService.listAllPages.mockResolvedValue([]);
    serviceMocks.coloringService.listAllPagesByBook.mockResolvedValue({});
  });

  it('keeps a completed import successful when cache refresh rejects', async () => {
    const completed = {
      importedCount: 1,
      skippedCount: 0,
      failedCount: 0,
      createdProgressNoteCount: 0,
      overwriteCount: 0,
      errors: [],
    };
    mockImportBulkPhotos.mockResolvedValue(completed);
    mockInvalidate.mockRejectedValue(new Error('cache refresh failed'));
    const { result } = renderHookWithProviders(() => useBulkPhotoImport());

    await act(async () => {
      await result.current.analyzeFileList([fileWithPath('cover.jpg', 'Starry Fox/cover.jpg')]);
    });
    let returned: unknown;
    await act(async () => {
      returned = await result.current.importConfirmed();
    });

    expect(returned).toEqual(completed);
    expect(result.current.lastResult).toEqual(completed);
    expect(
      mockNotify.mock.calls.filter(([notification]) => notification.kind === 'success')
    ).toHaveLength(1);
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' }));
    expect(mockNotify).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }));
    expect(mockCapture).toHaveBeenCalledWith(
      AnalyticsEvent.BULK_PHOTO_IMPORT_COMPLETED,
      expect.objectContaining({ status: 'success', imported_photos: 1 })
    );
  });

  it('captures bulk photo import start and partial completion without filenames or record IDs', async () => {
    mockImportBulkPhotos.mockResolvedValue({
      importedCount: 1,
      skippedCount: 0,
      failedCount: 1,
      createdProgressNoteCount: 0,
      overwriteCount: 0,
      errors: [{ path: 'Starry Fox/secret-cover.jpg', message: 'upload failed for project-1' }],
    });
    const { result } = renderHookWithProviders(() => useBulkPhotoImport());

    await act(async () => {
      await result.current.analyzeFileList([
        fileWithPath('secret-cover.jpg', 'Starry Fox/secret-cover.jpg'),
        fileWithPath('second-photo.jpg', 'Starry Fox/second-photo.jpg'),
      ]);
    });
    await act(async () => {
      await result.current.importConfirmed();
    });

    expect(mockCapture).toHaveBeenCalledWith(AnalyticsEvent.BULK_PHOTO_IMPORT_STARTED, {
      surface: 'settings_data',
      source: 'bulk_photos',
      records: 2,
    });
    expect(mockCapture).toHaveBeenCalledWith(AnalyticsEvent.BULK_PHOTO_IMPORT_COMPLETED, {
      surface: 'settings_data',
      source: 'bulk_photos',
      status: 'partial',
      records: 1,
      skipped: 0,
      errors: 1,
      imported_photos: 1,
      duration_ms: expect.any(Number),
    });
    expectCapturedPropertiesToExclude(['secret-cover.jpg', 'project-1', 'Starry Fox']);
  });

  it('captures bulk photo import failures with redacted exception properties', async () => {
    mockImportBulkPhotos.mockRejectedValue(
      new Error('secret-cover.jpg project-1 Starry Fox https://example.test/photo')
    );
    const { result } = renderHookWithProviders(() => useBulkPhotoImport());

    await act(async () => {
      await result.current.analyzeFileList([
        fileWithPath('secret-cover.jpg', 'Starry Fox/secret-cover.jpg'),
      ]);
    });
    await act(async () => {
      await result.current.importConfirmed();
    });

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        $exception_source: 'bulk_photo_import',
        operation: 'import_confirmed_photos',
        status: 'failed',
        failed_count_bucket: '1',
        surface: 'settings_data',
      })
    );
    expect(mockCapture).toHaveBeenCalledWith(
      AnalyticsEvent.BULK_PHOTO_IMPORT_COMPLETED,
      expect.objectContaining({
        source: 'bulk_photos',
        status: 'failed',
        records: 1,
        errors: 1,
      })
    );
    expectCapturedPropertiesToExclude([
      'secret-cover.jpg',
      'project-1',
      'Starry Fox',
      'https://example.test',
    ]);
  });

  it('rejects oversized ZIP files before loading the photo library', async () => {
    const file = new File(['not a zip'], 'photos.zip', { type: 'application/zip' });
    Object.defineProperty(file, 'size', {
      value: IMPORT_EXPORT_ARCHIVE_MAX_SIZE_BYTES + 1,
      configurable: true,
    });
    const { result } = renderHookWithProviders(() => useBulkPhotoImport());

    await act(async () => {
      await result.current.analyzeZipFile(file);
    });

    expect(serviceMocks.projectsService.getAllForUser).not.toHaveBeenCalled();
    expect(serviceMocks.coloringService.listAllBooks).not.toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'error',
        title: 'ZIP import failed',
        description: expect.stringMatching(/zip file exceeds/i),
      })
    );
  });

  it('rejects a highly compressed photo before JSZip loads it', async () => {
    const archive = new JSZip();
    archive.file('Starry Fox/cover.jpg', 'x'.repeat(2 * 1024 * 1024));
    const file = new File(
      [await archive.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })],
      'photos.zip'
    );
    const loadAsync = vi.spyOn(JSZip, 'loadAsync');
    const { result } = renderHookWithProviders(() => useBulkPhotoImport());

    try {
      await act(async () => {
        await result.current.analyzeZipFile(file);
      });

      expect(loadAsync).not.toHaveBeenCalled();
      expect(serviceMocks.projectsService.getAllForUser).not.toHaveBeenCalled();
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'error',
          title: 'ZIP import failed',
          description: expect.stringMatching(/compression ratio/i),
        })
      );
    } finally {
      loadAsync.mockRestore();
    }
  });

  it('rejects ZIP entries whose declared total expansion exceeds the budget', async () => {
    const archive = new JSZip();
    for (let index = 0; index < 35; index++) archive.file(`photo-${index}.jpg`, 'a');
    const bytes = await archive.generateAsync({ type: 'uint8array' });
    const view = new DataView(bytes.buffer);
    let changed = 0;
    for (let offset = 0; offset < bytes.length - 46; offset++) {
      if (view.getUint32(offset, true) !== 0x02014b50) continue;
      view.setUint32(offset + 20, 3 * 1024 * 1024, true);
      view.setUint32(offset + 24, 60 * 1024 * 1024, true);
      changed += 1;
    }
    expect(changed).toBe(35);
    const file = new File([bytes], 'photos.zip');
    const loadAsync = vi.spyOn(JSZip, 'loadAsync');
    const { result } = renderHookWithProviders(() => useBulkPhotoImport());

    try {
      await act(async () => {
        await result.current.analyzeZipFile(file);
      });

      expect(loadAsync).not.toHaveBeenCalled();
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'error',
          title: 'ZIP import failed',
          description: expect.stringMatching(/expanded data/i),
        })
      );
    } finally {
      loadAsync.mockRestore();
    }
  });

  it('analyzes a valid ZIP photo and its embedded manifest', async () => {
    const archive = new JSZip();
    archive.file(
      'photo-import.json',
      JSON.stringify({
        files: [
          {
            path: 'Starry Fox/cover.jpg',
            targetRef: 'project:project-1',
            targetType: 'project-cover',
          },
        ],
      })
    );
    archive.file('Starry Fox/cover.jpg', 'image');
    const file = new File([await archive.generateAsync({ type: 'uint8array' })], 'photos.zip');
    const { result } = renderHookWithProviders(() => useBulkPhotoImport());

    await act(async () => {
      await result.current.analyzeZipFile(file);
    });

    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0]).toMatchObject({
      path: 'Starry Fox/cover.jpg',
      targetId: 'project-1',
      targetType: 'project-cover',
      confirmed: true,
    });
    expect(result.current.rows[0].file.size).toBe(5);
  });

  it('accepts a highly compressible nested photo manifest within its byte cap', async () => {
    const archive = new JSZip();
    archive.file(
      'nested/photo-import.json',
      JSON.stringify({
        files: [{ path: 'Starry Fox/cover.jpg', note: 'a'.repeat(8 * 1024 * 1024) }],
      })
    );
    archive.file('Starry Fox/cover.jpg', 'image');
    const file = new File(
      [await archive.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })],
      'photos.zip'
    );
    const { result } = renderHookWithProviders(() => useBulkPhotoImport());

    await act(async () => {
      await result.current.analyzeZipFile(file);
    });

    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].path).toBe('Starry Fox/cover.jpg');
  });

  it('clears previous confirmed rows when a new folder has an invalid manifest', async () => {
    mockImportBulkPhotos.mockResolvedValue({
      importedCount: 1,
      skippedCount: 0,
      failedCount: 0,
      createdProgressNoteCount: 0,
      overwriteCount: 0,
      errors: [],
    });
    const { result } = renderHookWithProviders(() => useBulkPhotoImport());

    await act(async () => {
      await result.current.analyzeFileList([fileWithPath('old.jpg', 'Starry Fox/old.jpg')]);
    });
    expect(result.current.rows[0].confirmed).toBe(true);
    await act(async () => {
      await result.current.importConfirmed();
    });
    expect(result.current.lastResult).not.toBeNull();
    mockImportBulkPhotos.mockClear();

    await act(async () => {
      await result.current.analyzeFileList([
        fileWithPath('new.jpg', 'Starry Fox/new.jpg'),
        manifestFile('{"files":[{"path":"new.jpg","title":42}]}'),
      ]);
    });

    expect(result.current.rows).toEqual([]);
    expect(result.current.library).toBeNull();
    expect(result.current.lastResult).toBeNull();
    await act(async () => {
      expect(await result.current.importConfirmed()).toBeNull();
    });
    expect(mockImportBulkPhotos).not.toHaveBeenCalled();
  });

  it('clears previous confirmed rows when a ZIP manifest cannot be parsed', async () => {
    const { result } = renderHookWithProviders(() => useBulkPhotoImport());
    await act(async () => {
      await result.current.analyzeFileList([fileWithPath('old.jpg', 'Starry Fox/old.jpg')]);
    });
    expect(result.current.rows[0].confirmed).toBe(true);

    const archive = new JSZip();
    archive.file('photo-import.json', '{"files":[{"path":"new.jpg","title":42}]}');
    archive.file('new.jpg', 'image');
    const zipFile = new File([await archive.generateAsync({ type: 'blob' })], 'photos.zip', {
      type: 'application/zip',
    });
    await act(async () => {
      await result.current.analyzeZipFile(zipFile);
    });

    expect(result.current.rows).toEqual([]);
    expect(result.current.library).toBeNull();
    await act(async () => {
      expect(await result.current.importConfirmed()).toBeNull();
    });
    expect(mockImportBulkPhotos).not.toHaveBeenCalled();
  });

  it('ignores an older analysis that finishes after a newer selection', async () => {
    let releaseFirst = () => {};
    serviceMocks.projectsService.getAllForUser.mockImplementationOnce(async () => {
      await new Promise<void>(resolve => {
        releaseFirst = resolve;
      });
      return [
        {
          id: 'project-1',
          userId: 'user-1',
          title: 'Starry Fox',
          status: 'purchased',
          imageUrl: undefined,
          createdAt: '',
          updatedAt: '',
        },
      ];
    });
    const { result } = renderHookWithProviders(() => useBulkPhotoImport());

    let olderAnalysis!: Promise<unknown>;
    act(() => {
      olderAnalysis = result.current.analyzeFileList([
        fileWithPath('old.jpg', 'Starry Fox/old.jpg'),
      ]);
    });
    await act(async () => {
      await result.current.analyzeFileList([fileWithPath('new.jpg', 'Starry Fox/new.jpg')]);
    });
    act(() => releaseFirst());
    await act(async () => {
      await olderAnalysis;
    });

    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].path).toBe('Starry Fox/new.jpg');
    expect(result.current.loading).toBe(false);
  });
});
