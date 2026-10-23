import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectCreateDTO } from '@/types/project';

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
});
