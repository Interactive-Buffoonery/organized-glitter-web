import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectCreateDTO } from '@/types/project';
import { AnalyticsEvent } from '@/services/analytics-events';

const {
  mockCaptureEvent,
  mockCreateProject,
  mockGetCurrentUser,
  mockInvalidate,
  mockIsAuthenticated,
  mockListUserTags,
  mockNotify,
} = vi.hoisted(() => ({
  mockCaptureEvent: vi.fn(),
  mockCreateProject: vi.fn(),
  mockGetCurrentUser: vi.fn(),
  mockInvalidate: vi.fn(),
  mockIsAuthenticated: vi.fn(() => true),
  mockListUserTags: vi.fn(async () => []),
  mockNotify: vi.fn(),
}));

vi.mock('@/hooks/useImportCreateProject', () => ({
  useImportCreateProject: () => ({
    createProject: mockCreateProject,
    loading: false,
  }),
}));

vi.mock('@/services/auth', () => ({
  isAuthenticated: mockIsAuthenticated,
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock('@/services/pocketbase/importTags.service', () => ({
  ImportTagsService: {
    listUserTags: mockListUserTags,
    slugExists: vi.fn(async () => false),
    createTag: vi.fn(),
  },
}));

vi.mock('@/lib/notifications', () => ({
  notify: mockNotify,
}));

vi.mock('@/features/import-export/importExportTelemetry', () => ({
  captureImportExportEvent: mockCaptureEvent,
  captureImportExportException: vi.fn(),
  getDurationMs: vi.fn(() => 0),
  getImportExportStatus: vi.fn(() => 'success'),
}));

vi.mock('@/features/import-export/archive/importInvalidation', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/import-export/archive/importInvalidation')>()),
  invalidateImportExportQueries: mockInvalidate,
}));

vi.mock('@/services/pocketbase/projects.service', () => ({
  projectsService: {
    getAllForUser: vi.fn(async () => []),
  },
}));

import { renderHookWithProviders } from '@/test-utils';
import { useProjectImport } from '@/hooks/useProjectImport';

const createCsvFile = (contents: string): File =>
  new File([contents], 'import.csv', { type: 'text/csv' });

describe('useProjectImport color count persistence', () => {
  beforeEach(() => {
    mockInvalidate.mockReset().mockResolvedValue(undefined);
    mockCreateProject.mockResolvedValue({
      project: { id: 'created-id' },
      tagImportResult: undefined,
    });
    mockGetCurrentUser.mockReturnValue({ id: 'user-1' });
    mockIsAuthenticated.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('forwards the parsed color count into the created project DTO', async () => {
    const csv = 'Title,# of Colors\nGalaxy Cat,42\n';

    const { result } = renderHookWithProviders(() => useProjectImport());

    await act(async () => {
      await result.current.importProjectsFromCSV(createCsvFile(csv));
    });

    await waitFor(() => expect(mockCreateProject).toHaveBeenCalledTimes(1));

    const dto = mockCreateProject.mock.calls[0][0] as ProjectCreateDTO;
    expect(dto.title).toBe('Galaxy Cat');
    expect(dto.colorCount).toBe(42);
  });

  it.each([
    {
      source: 'organized' as const,
      csv: 'Title,# of Colors\nGalaxy Cat,42\n',
      kind: 'info',
    },
    {
      source: 'dac' as const,
      csv: 'Date,Products\n2024-05-10,Galaxy Cat\n',
      kind: 'success',
    },
  ])(
    'preserves the $source import outcome when cache refresh rejects',
    async ({ source, csv, kind }) => {
      mockInvalidate.mockRejectedValue(new Error('cache refresh failed'));
      const { result } = renderHookWithProviders(() => useProjectImport());
      let succeeded = false;

      await act(async () => {
        succeeded = await (source === 'organized'
          ? result.current.importProjectsFromCSV(createCsvFile(csv))
          : result.current.importDacProjectsFromCSV(createCsvFile(csv)));
      });

      expect(mockCreateProject).toHaveBeenCalledOnce();
      expect(succeeded).toBe(true);
      expect(result.current.importStats.successful).toBe(1);
      expect(
        mockNotify.mock.calls.filter(([notification]) => notification.kind === kind).length
      ).toBeGreaterThan(0);
      expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ kind }));
      expect(mockNotify).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }));
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        source === 'organized'
          ? AnalyticsEvent.IMPORT_COMPLETED
          : AnalyticsEvent.DAC_IMPORT_COMPLETED,
        expect.objectContaining({ status: 'success', records: 1 })
      );
    }
  );
});
