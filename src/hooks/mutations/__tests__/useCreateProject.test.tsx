import {
  act,
  beforeEach,
  createTestQueryClient,
  describe,
  expect,
  it,
  renderHookWithProviders,
  waitFor,
} from '../../../test-utils/index';
import { vi } from 'vitest';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { SessionChangedError } from '@/services/auth/sessionRecovery';

const { mockCreate, mockUpdate, mockAddTagToProject, mockCapture } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockAddTagToProject: vi.fn(),
  mockCapture: vi.fn(),
}));

vi.doMock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-123' } }),
}));

vi.doMock('@/hooks/useNavigateToProject', () => ({
  useNavigateToProject: () => vi.fn(),
}));

vi.doMock('@/services/pocketbase/projects.service', () => ({
  projectsService: {
    create: mockCreate,
    update: mockUpdate,
  },
}));

vi.doMock('@/services/pocketbase/tags.service', () => ({
  TagService: {
    addTagToProject: mockAddTagToProject,
  },
}));

vi.doMock('@/services/analytics-escape-hatch', () => ({
  capture: mockCapture,
}));

vi.doMock('../projectMutationAdapters', () => ({
  buildCreateProjectFormData: vi.fn(async (input: { imageFile?: File | null }) => {
    const formData = new FormData();
    formData.append('title', 'Galaxy Garden');
    if (input.imageFile) {
      formData.append('image', input.imageFile);
    }
    return formData;
  }),
}));

const { useCreateProject } = await import('../useCreateProject');

describe('useCreateProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage?.clear?.();
  });

  it('creates a project with its image and links tags', async () => {
    const queryClient = createTestQueryClient();

    mockCreate.mockResolvedValue({
      id: 'project-123',
      title: 'Galaxy Garden',
      image: 'cover.jpg',
    });
    mockAddTagToProject.mockResolvedValue({ status: 'success' });

    const { result } = renderHookWithProviders(() => useCreateProject(), { queryClient });

    await act(async () => {
      await result.current.mutateAsync({
        userId: 'user-123',
        title: 'Galaxy Garden',
        imageFile: new File(['img'], 'cover.jpg', { type: 'image/jpeg' }),
        tagIds: ['tag-1', 'tag-2'],
      });
    });

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    const createPayload = mockCreate.mock.calls[0][0] as FormData;
    expect(createPayload.get('image')).toEqual(
      expect.objectContaining({ name: 'cover.jpg', type: 'image/jpeg' })
    );
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockAddTagToProject).toHaveBeenCalledTimes(2);
    expect(mockCapture).toHaveBeenCalledWith(
      'project_created',
      expect.objectContaining({
        craft: 'diamond',
        entity_type: 'project',
        source_surface: 'project_create_mutation',
        has_cover_image: true,
      })
    );
  });

  it('rejects a late tag response instead of reporting the created project as a current success', async () => {
    mockCreate.mockResolvedValue({ id: 'project-123', title: 'Galaxy Garden' });
    mockAddTagToProject.mockRejectedValue(new SessionChangedError());
    const { result } = renderHookWithProviders(() => useCreateProject());

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          userId: 'user-123',
          title: 'Galaxy Garden',
          tagIds: ['tag-1'],
        })
      ).rejects.toMatchObject({ reason: 'session_changed' });
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('rejects a session change wrapped by the project tag service', async () => {
    mockCreate.mockResolvedValue({ id: 'project-123', title: 'Galaxy Garden' });
    mockAddTagToProject.mockResolvedValue({
      status: 'error',
      error: new SessionChangedError(),
    });
    const { result } = renderHookWithProviders(() => useCreateProject());

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          userId: 'user-123',
          title: 'Galaxy Garden',
          tagIds: ['tag-1'],
        })
      ).rejects.toMatchObject({ reason: 'session_changed' });
    });
  });

  it('does not replay project creation when the server response is ambiguous', async () => {
    const queryClient = createTestQueryClient();
    const networkError = {
      type: 'network' as const,
      message: 'Network connection failed.',
      retryable: true,
    };
    mockCreate.mockRejectedValue(networkError);

    const { result } = renderHookWithProviders(() => useCreateProject(), { queryClient });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          userId: 'user-123',
          title: 'Galaxy Garden',
        })
      ).rejects.toBe(networkError);
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('marks Stats and project lists stale after a core create', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Infinity } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const overviewKey = queryKeys.stats.overview('user-123');
    const summaryKey = queryKeys.stats.summary('user-123', 2026);
    const coloringSummaryKey = queryKeys.stats.coloringSummary('user-123', 2026);
    for (const key of [overviewKey, summaryKey, coloringSummaryKey]) {
      queryClient.setQueryData(key, { total: 1 });
    }

    mockCreate.mockResolvedValue({
      id: 'project-456',
      title: 'Galaxy Garden',
      image: '',
    });

    const { result } = renderHookWithProviders(() => useCreateProject(), { queryClient });

    await act(async () => {
      await result.current.mutateAsync({
        userId: 'user-123',
        title: 'Galaxy Garden',
      });
    });

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    expect(queryClient.getQueryState(overviewKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(summaryKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(coloringSummaryKey)?.isInvalidated).toBe(false);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['projects', 'list'],
      refetchType: 'none',
    });
  });

  it('fires all tag-link requests in parallel (not serially)', async () => {
    const queryClient = createTestQueryClient();

    mockCreate.mockResolvedValue({
      id: 'project-789',
      title: 'Galaxy Garden',
      image: '',
    });

    type Resolver = (value: { status: string }) => void;
    const resolvers: Resolver[] = [];
    mockAddTagToProject.mockImplementation(
      () =>
        new Promise<{ status: string }>(resolve => {
          resolvers.push(resolve);
        })
    );

    const { result } = renderHookWithProviders(() => useCreateProject(), { queryClient });

    const mutatePromise = result.current.mutateAsync({
      userId: 'user-123',
      title: 'Galaxy Garden',
      tagIds: ['tag-a', 'tag-b', 'tag-c'],
    });

    // All three tag-link requests should be in-flight before any resolve.
    // If they were serialized, only the first would have fired.
    await waitFor(() => {
      expect(mockAddTagToProject).toHaveBeenCalledTimes(3);
    });
    expect(resolvers).toHaveLength(3);

    await act(async () => {
      resolvers.forEach(resolve => resolve({ status: 'success' }));
      await mutatePromise;
    });
  });

  it('retires a create draft after the primary write while tag links are still pending', async () => {
    const queryClient = createTestQueryClient();
    mockCreate.mockResolvedValue({ id: 'project-early', title: 'Galaxy Garden', image: '' });
    let finishTag!: (value: { status: string }) => void;
    mockAddTagToProject.mockImplementation(
      () =>
        new Promise(resolve => {
          finishTag = resolve;
        })
    );
    const onConfirmedSave = vi.fn();
    const { result } = renderHookWithProviders(() => useCreateProject({ onConfirmedSave }), {
      queryClient,
    });

    const pending = result.current.mutateAsync({
      userId: 'user-123',
      title: 'Galaxy Garden',
      tagIds: ['tag-1'],
    });
    await waitFor(() => expect(mockAddTagToProject).toHaveBeenCalledOnce());
    expect(onConfirmedSave).toHaveBeenCalledOnce();
    await act(async () => {
      finishTag({ status: 'success' });
      await pending;
    });
  });

  it('collects rejected tag-link requests without aborting the create flow', async () => {
    const queryClient = createTestQueryClient();

    mockCreate.mockResolvedValue({
      id: 'project-mixed',
      title: 'Galaxy Garden',
      image: '',
    });

    mockAddTagToProject.mockImplementation(async (_projectId: string, tagId: string) => {
      if (tagId === 'tag-ok') return { status: 'success' };
      if (tagId === 'tag-bad') return { status: 'error', error: 'link failed' };
      throw new Error('network boom');
    });

    const { result } = renderHookWithProviders(() => useCreateProject(), { queryClient });

    let resolved = false;
    await act(async () => {
      await result.current.mutateAsync({
        userId: 'user-123',
        title: 'Galaxy Garden',
        tagIds: ['tag-ok', 'tag-bad', 'tag-throw'],
      });
      resolved = true;
    });

    expect(resolved).toBe(true);
    expect(mockAddTagToProject).toHaveBeenCalledTimes(3);
  });
});
