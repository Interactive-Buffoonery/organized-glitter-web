import {
  act,
  beforeEach,
  describe,
  expect,
  it,
  renderHookWithProviders,
  waitFor,
} from '@/test-utils';
import { createTestQueryClient } from '@/test-utils';
import { vi } from 'vitest';

const { mockUpdate, mockUseAuth } = vi.hoisted(() => ({
  mockUpdate: vi.fn(),
  mockUseAuth: vi.fn(),
}));

vi.doMock('@/services/pocketbase/projects.service', () => ({
  projectsService: {
    update: mockUpdate,
  },
}));

vi.doMock('@/hooks/useAuth', () => ({
  useAuth: mockUseAuth,
}));

const { useUpdateProjectStatus } = await import('../useUpdateProjectStatus');

describe('useUpdateProjectStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: { id: 'user-123' },
    });
  });

  it('rolls back without retrying when the status response is lost', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(['projects', 'detail', 'project-123'], {
      id: 'project-123',
      status: 'wishlist',
    });

    const ambiguousFailure = {
      type: 'network',
      message: 'response lost after server commit',
      retryable: true,
    };
    mockUpdate.mockRejectedValue(ambiguousFailure);

    const { result } = renderHookWithProviders(() => useUpdateProjectStatus(), { queryClient });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          projectId: 'project-123',
          nextStatus: 'archived',
        })
      ).rejects.toMatchObject(ambiguousFailure);
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(['projects', 'detail', 'project-123'])).toEqual({
        id: 'project-123',
        status: 'wishlist',
      });
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
});
