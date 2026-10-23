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
import { vi } from 'vitest';
import { queryKeys } from '@/hooks/queries/queryKeys';

const {
  mockUpdate,
  mockUseAuth,
  mockUseUserTimezone,
  mockBuildUpdateProjectFormData,
  mockValidateFormDataForUpdate,
  mockLogFormData,
  mockCapture,
} = vi.hoisted(() => ({
  mockUpdate: vi.fn(),
  mockUseAuth: vi.fn(),
  mockUseUserTimezone: vi.fn(),
  mockBuildUpdateProjectFormData: vi.fn(),
  mockValidateFormDataForUpdate: vi.fn(),
  mockLogFormData: vi.fn(),
  mockCapture: vi.fn(),
}));

vi.doMock('@/services/pocketbase/projects.service', () => ({
  projectsService: {
    update: mockUpdate,
  },
}));

vi.doMock('@/hooks/useAuth', () => ({
  useAuth: mockUseAuth,
}));

vi.doMock('@/hooks/useUserTimezone', () => ({
  useUserTimezone: mockUseUserTimezone,
}));

vi.doMock('../projectMutationAdapters', () => ({
  buildUpdateProjectFormData: mockBuildUpdateProjectFormData,
}));

vi.doMock('@/utils/project/formdata-builder', () => ({
  validateFormDataForUpdate: mockValidateFormDataForUpdate,
  logFormData: mockLogFormData,
}));

vi.doMock('@/services/analytics-escape-hatch', () => ({
  capture: mockCapture,
}));

const { useProjectUpdateUnified } = await import('../useProjectUpdateUnified');

describe('useProjectUpdateUnified', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: { id: 'user-123' },
    });
    mockUseUserTimezone.mockReturnValue('America/New_York');
    mockBuildUpdateProjectFormData.mockResolvedValue(new FormData());
    mockValidateFormDataForUpdate.mockReturnValue({ isValid: true, errors: [] });
  });

  it('rolls back without retrying when the update response is lost', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Infinity } });
    queryClient.setQueryData(['projects', 'detail', 'project-123'], {
      id: 'project-123',
      title: 'Before',
      status: 'wishlist',
    });

    const ambiguousFailure = {
      type: 'network',
      message: 'response lost after server commit',
      retryable: true,
    };
    mockUpdate.mockRejectedValue(ambiguousFailure);

    const { result } = renderHookWithProviders(() => useProjectUpdateUnified(), { queryClient });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          projectId: 'project-123',
          title: 'After',
          status: 'progress',
        })
      ).rejects.toMatchObject(ambiguousFailure);
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(['projects', 'detail', 'project-123'])).toEqual({
        id: 'project-123',
        title: 'Before',
        status: 'wishlist',
      });
    });

    expect(mockLogFormData).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('refreshes every cached diamond Stats projection after a project write', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Infinity } });
    const diamondKeys = [
      queryKeys.stats.overview('user-123'),
      queryKeys.stats.availableYears('user-123'),
      queryKeys.stats.summary('user-123', 2025),
      queryKeys.stats.completionsByMonth('user-123', 2025),
      queryKeys.stats.completionsYearly('user-123'),
      queryKeys.stats.completionTimes('user-123'),
      queryKeys.stats.collection('user-123'),
    ];
    const coloringKey = queryKeys.stats.coloringSummary('user-123', 2025);
    const reads = [...diamondKeys, coloringKey].map(() =>
      vi.fn().mockResolvedValue({ fresh: true })
    );

    const initialResults = await Promise.allSettled(
      [...diamondKeys, coloringKey].map((queryKey, index) =>
        queryClient.fetchQuery({ queryKey, queryFn: reads[index], staleTime: Infinity })
      )
    );
    expect(initialResults.every(result => result.status === 'fulfilled')).toBe(true);
    mockUpdate.mockResolvedValue({ id: 'project-abc', status: 'completed' });

    const { result } = renderHookWithProviders(() => useProjectUpdateUnified(), { queryClient });
    await act(async () => {
      await result.current.mutateAsync({ projectId: 'project-abc', title: 'Updated' });
    });

    const refreshedResults = await Promise.allSettled(
      [...diamondKeys, coloringKey].map((queryKey, index) =>
        queryClient.fetchQuery({ queryKey, queryFn: reads[index], staleTime: Infinity })
      )
    );
    expect(refreshedResults.every(result => result.status === 'fulfilled')).toBe(true);

    diamondKeys.forEach((_, index) => expect(reads[index]).toHaveBeenCalledTimes(2));
    expect(reads[diamondKeys.length]).toHaveBeenCalledTimes(1);
  });
});
