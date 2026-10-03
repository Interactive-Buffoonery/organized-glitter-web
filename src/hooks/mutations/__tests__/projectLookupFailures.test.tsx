import { vi } from 'vitest';
import {
  act,
  beforeEach,
  createTestQueryClient,
  describe,
  expect,
  it,
  renderHookWithProviders,
  waitFor,
} from '@/test-utils';
import { queryKeys } from '@/hooks/queries/queryKeys';

const mocks = vi.hoisted(() => ({
  companyLookup: vi.fn(),
  artistLookup: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  addTag: vi.fn(),
  navigate: vi.fn(),
  notify: vi.fn(),
  capture: vi.fn(),
  authUser: { value: { id: 'user-123' } as { id: string } | null },
}));

vi.mock('@/services/pocketbase/companies.service', () => ({
  CompaniesService: { findByName: mocks.companyLookup },
}));

vi.mock('@/services/pocketbase/artists.service', () => ({
  ArtistsService: { findByName: mocks.artistLookup },
}));

vi.mock('@/services/pocketbase/projects.service', () => ({
  projectsService: { create: mocks.create, update: mocks.update },
}));

vi.mock('@/services/pocketbase/tags.service', () => ({
  TagService: { addTagToProject: mocks.addTag },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mocks.authUser.value }),
}));

vi.mock('@/hooks/useUserTimezone', () => ({
  useUserTimezone: () => 'America/Chicago',
}));

vi.mock('@/hooks/useNavigateToProject', () => ({
  useNavigateToProject: () => mocks.navigate,
}));

vi.mock('@/lib/notifications', () => ({
  notify: mocks.notify,
}));

vi.mock('@/services/analytics-escape-hatch', () => ({
  capture: mocks.capture,
}));

const { useCreateProject } = await import('../useCreateProject');
const { useProjectUpdateUnified } = await import('../useProjectUpdateUnified');

describe('project relation lookup failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser.value = { id: 'user-123' };
    mocks.companyLookup.mockResolvedValue(null);
    mocks.artistLookup.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: 'created-project', title: 'Galaxy Garden', image: '' });
    mocks.update.mockResolvedValue({ id: 'project-123', title: 'After', status: 'wishlist' });
  });

  it.each([
    ['company', 'companyName', mocks.companyLookup],
    ['artist', 'artistName', mocks.artistLookup],
  ] as const)('stops create when the %s lookup fails', async (_relation, field, lookup) => {
    const lookupFailure = {
      type: 'server' as const,
      status: 503,
      retryable: true,
      message: 'Service unavailable',
    };
    mocks.companyLookup.mockResolvedValue({ id: 'company-123', name: 'Acme Kits' });
    lookup.mockRejectedValue(lookupFailure);
    const { result } = renderHookWithProviders(() => useCreateProject({ redirect: true }));

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          userId: 'user-123',
          title: 'Galaxy Garden',
          tagIds: ['tag-1'],
          ...(field === 'artistName' ? { companyName: 'Acme Kits' } : {}),
          [field]: field === 'companyName' ? 'Acme Kits' : 'Ada Artist',
        })
      ).rejects.toMatchObject({ relation: field === 'companyName' ? 'company' : 'artist' });
    });

    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.addTag).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }));
    expect(mocks.notify).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' }));
  });

  it.each([
    ['company', 'companyName', mocks.companyLookup],
    ['artist', 'artistName', mocks.artistLookup],
  ] as const)('rolls back update when the %s lookup fails', async (_relation, field, lookup) => {
    mocks.companyLookup.mockResolvedValue({ id: 'company-123', name: 'Acme Kits' });
    lookup.mockRejectedValue({
      type: 'network',
      status: 0,
      retryable: true,
      message: 'Failed to fetch',
    });
    const queryClient = createTestQueryClient();
    queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Infinity } });
    const previous = {
      id: 'project-123',
      title: 'Before',
      company: 'Old Company',
      artist: 'Old Artist',
    };
    queryClient.setQueryData(queryKeys.projects.detail('project-123'), previous);
    const { result } = renderHookWithProviders(() => useProjectUpdateUnified(), { queryClient });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          projectId: 'project-123',
          title: 'After',
          ...(field === 'artistName' ? { companyName: 'Acme Kits' } : {}),
          [field]: field === 'companyName' ? 'Acme Kits' : 'Ada Artist',
        })
      ).rejects.toMatchObject({ relation: field === 'companyName' ? 'company' : 'artist' });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(queryKeys.projects.detail('project-123'))).toEqual(previous);
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated update with an Error and auth details', async () => {
    mocks.authUser.value = null;
    const { result } = renderHookWithProviders(() => useProjectUpdateUnified());
    await act(async () => {
      await expect(
        result.current.mutateAsync({ projectId: 'project-123', title: 'After' })
      ).rejects.toMatchObject({
        message: 'User not authenticated',
        type: 'auth',
        retryable: false,
      });
    });
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
