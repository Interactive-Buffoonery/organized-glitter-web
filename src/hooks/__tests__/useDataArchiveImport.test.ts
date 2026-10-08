import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDataArchiveImport } from '../useDataArchiveImport';

const m = vi.hoisted(() => ({
  dispatch: vi.fn(),
  invalidate: vi.fn(),
  notify: vi.fn(),
  currentUserId: 'user-one' as string | null,
  authCallback: null as null | ((token: string, user: { id: string } | null) => void),
}));
vi.mock('@/features/import-export/archive/importArchiveDispatcher', () => ({
  importOrganizedGlitterArchives: m.dispatch,
}));
vi.mock('@/features/import-export/archive/importInvalidation', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/import-export/archive/importInvalidation')>()),
  invalidateImportExportQueries: m.invalidate,
}));
vi.mock('@/lib/notifications', () => ({ notify: m.notify }));
vi.mock('@/services/auth', () => ({
  getCurrentUserId: () => m.currentUserId,
  onAuthChange: (callback: typeof m.authCallback) => {
    m.authCallback = callback;
    return vi.fn();
  },
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
vi.mock('@/services/analytics-events', () => ({
  AnalyticsEvent: {
    ARCHIVE_IMPORT_STARTED: 'started',
    ARCHIVE_IMPORT_COMPLETED: 'completed',
  },
}));
vi.mock('@/features/import-export/importExportTelemetry', () => ({
  bucketFileSize: () => 'small',
  captureImportExportEvent: vi.fn(),
  captureImportExportException: vi.fn(),
  getDurationMs: () => 1,
  getImportExportStatus: ({ success }: { success: boolean }) => (success ? 'success' : 'partial'),
}));
vi.mock('@/utils/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn() }),
}));

const file = new File(['zip'], 'part.zip');
const v3 = {
  success: false,
  backupId: 'backup',
  selectedPartNumbers: [2],
  missingPartNumbers: [1],
  selectedPartCount: 1,
  totalPartCount: 2,
  selectedLogicalItemCount: 2,
  createdItemCount: 1,
  createdLibraryItemCount: 1,
  alreadyAppliedItemCount: 0,
  restoredAssetCount: 1,
  alreadyAppliedAssetCount: 0,
  conflicts: [],
  errors: [{ partNumber: 2, itemId: 'other', kind: 'cancelled', message: 'Cancelled' }],
  itemResults: [{ outcome: 'created', partNumber: 2 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  m.currentUserId = 'user-one';
  m.authCallback = null;
  m.invalidate.mockResolvedValue(undefined);
});

describe('useDataArchiveImport', () => {
  it('retains partial confirmed writes after cancellation and refreshes the cache', async () => {
    let resolve!: (value: unknown) => void;
    m.dispatch.mockImplementation((_files, options) => {
      options.onV3Progress({ phase: 'restore', completed: 1, total: 2 });
      return new Promise(done => {
        resolve = done;
      });
    });
    const { result } = renderHook(() => useDataArchiveImport());
    let importPromise!: Promise<unknown>;
    act(() => {
      importPromise = result.current.importArchive([file]);
    });
    expect(result.current.progress).toMatchObject({ phase: 'restore' });
    act(() => {
      result.current.cancelImport();
    });
    await act(async () => {
      resolve({ schemaVersion: 3, result: v3 });
      await importPromise;
    });
    expect(result.current.v3Result).toMatchObject({
      createdItemCount: 1,
      createdLibraryItemCount: 1,
      success: false,
    });
    expect(m.invalidate).toHaveBeenCalledTimes(1);
    expect(m.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'warning' }));
  });

  it('aborts on account change and never refreshes or notifies the new account', async () => {
    let resolve!: (value: unknown) => void;
    let signal!: AbortSignal;
    m.dispatch.mockImplementation((_files, options) => {
      signal = options.signal;
      return new Promise(done => {
        resolve = done;
      });
    });
    const { result } = renderHook(() => useDataArchiveImport());
    let importPromise!: Promise<unknown>;
    act(() => {
      importPromise = result.current.importArchive([file]);
    });
    act(() => {
      m.currentUserId = 'user-two';
      m.authCallback?.('', { id: 'user-two' });
    });
    expect(signal.aborted).toBe(true);
    await act(async () => {
      resolve({ schemaVersion: 3, result: v3 });
      await importPromise;
    });
    expect(result.current.v3Result).toBeNull();
    expect(m.invalidate).not.toHaveBeenCalled();
    expect(m.notify).not.toHaveBeenCalled();
  });

  it('preserves a successful restore when cache refresh fails', async () => {
    m.dispatch.mockResolvedValue({
      schemaVersion: 3,
      result: { ...v3, success: true, errors: [], missingPartNumbers: [] },
    });
    m.invalidate.mockRejectedValue(new Error('Cache refresh failed'));
    const { result } = renderHook(() => useDataArchiveImport());
    await act(async () => {
      await result.current.importArchive([file]);
    });
    await waitFor(() => expect(result.current.v3Result?.success).toBe(true));
    expect(m.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' }));
  });

  it('keeps the legacy single-ZIP result path working', async () => {
    const legacy = {
      success: true,
      createdProjectCount: 1,
      createdColoringBookCount: 0,
      createdProgressNoteCount: 0,
      importedPhotoCount: 0,
      skippedRecordCount: 0,
      skippedPagePhotoCount: 0,
      matchedExistingRecordCount: 0,
      archiveSchemaVersion: 2,
      refMap: { 'project:one': 'new-project' },
      warnings: [],
      errors: [],
    };
    m.dispatch.mockResolvedValue({ schemaVersion: 2, result: legacy });
    const { result } = renderHook(() => useDataArchiveImport());
    await act(async () => {
      await result.current.importArchive(file);
    });
    expect(m.dispatch).toHaveBeenCalledWith(
      [file],
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(result.current.lastResult).toEqual(legacy);
    expect(result.current.v3Result).toBeNull();
    expect(m.invalidate).toHaveBeenCalledWith(
      expect.anything(),
      ['new-project'],
      expect.anything()
    );
  });
});
