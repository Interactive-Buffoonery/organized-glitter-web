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

vi.doMock('@/services/auth/sessionIdentity', () => ({
  captureSessionIdentity: () => ({ accountId: 'user-123', generation: 0 }),
  isCurrentSessionIdentity: () => true,
}));

const { useCreateProject } = await import('../useCreateProject');

describe('useCreateProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage?.clear?.();
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
});
