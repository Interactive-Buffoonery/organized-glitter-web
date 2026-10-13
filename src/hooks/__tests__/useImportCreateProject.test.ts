import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectCreateDTO } from '@/types/project';
import { SessionChangedError } from '@/services/auth/sessionRecovery';

const mocks = vi.hoisted(() => ({
  company: { findByName: vi.fn(), create: vi.fn() },
  artist: { findByName: vi.fn(), create: vi.fn() },
  saveProject: vi.fn(),
  isAuthenticated: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock('@/services/auth', () => ({
  isAuthenticated: mocks.isAuthenticated,
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock('@/services/pocketbase/companies.service', () => ({ CompaniesService: mocks.company }));
vi.mock('@/services/pocketbase/artists.service', () => ({ ArtistsService: mocks.artist }));
vi.mock('@/services/pocketbase/projects.service', () => ({
  projectsService: { create: mocks.saveProject, getAllForUser: vi.fn(async () => []) },
}));
vi.mock('@/services/pocketbase/tags.service', () => ({ TagService: {} }));
vi.mock('@/utils/error/rateLimit', () => ({
  queuedPbRequest: <T>(operation: () => Promise<T>) => operation(),
}));
vi.mock('@/services/pocketbase/importTags.service', () => ({
  ImportTagsService: { listUserTags: vi.fn(async () => []) },
}));
vi.mock('@/lib/notifications', () => ({ notify: vi.fn() }));
vi.mock('@/features/import-export/importExportTelemetry', () => ({
  captureImportExportEvent: vi.fn(),
  captureImportExportException: vi.fn(),
  getDurationMs: vi.fn(() => 0),
  getImportExportStatus: vi.fn(() => 'partial'),
}));
vi.mock('@/features/import-export/archive/importInvalidation', () => ({
  invalidateImportExportQueries: vi.fn(async () => undefined),
  refreshImportExportQueriesBestEffort: vi.fn(async (refresh: () => Promise<void>) => refresh()),
}));

import { useImportCreateProject } from '@/hooks/useImportCreateProject';
import { useProjectImport } from '@/hooks/useProjectImport';
import { renderHookWithProviders } from '@/test-utils';

const project: ProjectCreateDTO = { title: 'Galaxy Cat', userId: 'user-1' };

// These isolated failures cover rejected lookup/create requests, which successful
// backend import fixtures cannot reproduce deterministically.
describe('CSV project relation resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.company.findByName.mockReset();
    mocks.artist.findByName.mockReset();
    mocks.isAuthenticated.mockReturnValue(true);
    mocks.getCurrentUser.mockReturnValue({ id: 'user-1' });
    mocks.company.findByName.mockResolvedValue({ id: 'company-existing' });
    mocks.artist.findByName.mockResolvedValue({ id: 'artist-existing' });
    mocks.company.create.mockResolvedValue({ id: 'company-new' });
    mocks.artist.create.mockResolvedValue({ id: 'artist-new' });
    mocks.saveProject.mockResolvedValue({ id: 'project-created' });
  });

  it.each(['company', 'artist'] as const)(
    'fails before saving when %s lookup rejects',
    async field => {
      const failure = new Error('Service unavailable');
      mocks[field].findByName.mockRejectedValue(failure);
      const { result } = renderHook(() => useImportCreateProject());

      await act(async () => {
        await expect(
          result.current.createProject({ ...project, [field]: 'Requested name' })
        ).rejects.toMatchObject({
          message: expect.stringContaining(
            `Project "Galaxy Cat": could not resolve ${field} "Requested name"`
          ),
          cause: failure,
        });
      });
      expect(mocks.saveProject).not.toHaveBeenCalled();
      expect(mocks[field].create).not.toHaveBeenCalled();
      expect(result.current.loading).toBe(false);
    }
  );

  it.each(['company', 'artist'] as const)(
    'fails before saving when %s creation rejects',
    async field => {
      const failure = { type: 'validation', message: 'Name already exists', retryable: false };
      mocks[field].findByName.mockResolvedValue(null);
      mocks[field].create.mockRejectedValue(failure);
      const { result } = renderHook(() => useImportCreateProject());

      await act(async () => {
        await expect(
          result.current.createProject({ ...project, [field]: 'Requested name' })
        ).rejects.toMatchObject({
          message: expect.stringContaining('Name already exists'),
          cause: failure,
        });
      });
      expect(mocks.saveProject).not.toHaveBeenCalled();
      expect(result.current.loading).toBe(false);
    }
  );

  it.each(['company', 'artist'] as const)(
    'preserves the %s session failure and login guidance',
    async field => {
      const failure = {
        type: 'auth',
        status: 401,
        message: 'Authentication required. Please log in and try again.',
        retryable: false,
      };
      mocks[field].findByName.mockRejectedValue(failure);
      const { result } = renderHook(() => useImportCreateProject());

      await act(async () => {
        await expect(
          result.current.createProject({ ...project, [field]: 'Requested name' })
        ).rejects.toMatchObject({
          message: expect.stringContaining(failure.message),
          cause: failure,
        });
      });
      expect(mocks.saveProject).not.toHaveBeenCalled();
    }
  );

  it.each(['company', 'artist'] as const)(
    'preserves %s session-change error identity',
    async field => {
      const failure = new SessionChangedError();
      mocks[field].create.mockRejectedValue(failure);
      mocks[field].findByName.mockResolvedValue(null);
      const { result } = renderHook(() => useImportCreateProject());
      await act(async () => {
        await expect(
          result.current.createProject({ ...project, [field]: 'Requested name' })
        ).rejects.toBe(failure);
      });
      expect(mocks.saveProject).not.toHaveBeenCalled();
    }
  );

  it.each([false, true])('saves both resolved relations (create new: %s)', async createNew => {
    if (createNew) {
      mocks.company.findByName.mockResolvedValue(null);
      mocks.artist.findByName.mockResolvedValue(null);
    }
    const { result } = renderHook(() => useImportCreateProject());
    await act(async () => {
      await result.current.createProject({
        ...project,
        company: 'Company name',
        artist: 'Artist name',
      });
    });
    expect(mocks.saveProject).toHaveBeenCalledWith(
      expect.objectContaining({
        company: createNew ? 'company-new' : 'company-existing',
        artist: createNew ? 'artist-new' : 'artist-existing',
      })
    );
    expect(mocks.company.create).toHaveBeenCalledTimes(createNew ? 1 : 0);
    expect(mocks.artist.create).toHaveBeenCalledTimes(createNew ? 1 : 0);
  });

  it.each([undefined, 'other', 'unknown'])(
    'preserves absent and sentinel artist %s',
    async artist => {
      const { result } = renderHook(() => useImportCreateProject());
      await act(async () => {
        await result.current.createProject({ ...project, company: 'other', artist });
      });
      expect(mocks.company.findByName).not.toHaveBeenCalled();
      expect(mocks.artist.findByName).not.toHaveBeenCalled();
      expect(mocks.saveProject).toHaveBeenCalledWith(
        expect.objectContaining({ company: null, artist: null })
      );
    }
  );

  it('rejects an unauthenticated import before relation lookup or project save', async () => {
    mocks.isAuthenticated.mockReturnValue(false);
    const { result } = renderHook(() => useImportCreateProject());
    await act(async () => {
      await expect(result.current.createProject(project)).rejects.toThrow('User not authenticated');
    });
    expect(mocks.company.findByName).not.toHaveBeenCalled();
    expect(mocks.saveProject).not.toHaveBeenCalled();
  });

  it.each(['company', 'artist'] as const)(
    'reports the failed %s row and imports the next row',
    async field => {
      mocks[field].findByName.mockRejectedValueOnce(new Error('Service unavailable'));
      const csv = `Title,Company,Artist\nFailed row,Company name,Artist name\nSuccessful row,Company name,Artist name\n`;
      const { result } = renderHookWithProviders(() => useProjectImport());
      await act(async () => {
        await result.current.importProjectsFromCSV(
          new File([csv], 'import.csv', { type: 'text/csv' })
        );
      });
      expect(result.current.importStats).toMatchObject({ successful: 1, failed: 1, total: 2 });
      expect(result.current.importStats.errors).toEqual([
        expect.stringContaining(`Project "Failed row": could not resolve ${field}`),
      ]);
      expect(mocks.saveProject).toHaveBeenCalledOnce();
      expect(mocks.saveProject).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Successful row',
          company: 'company-existing',
          artist: 'artist-existing',
        })
      );
    }
  );
});
