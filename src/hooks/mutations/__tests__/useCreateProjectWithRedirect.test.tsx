import {
  act,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  renderHookWithProviders,
  waitFor,
} from '../../../test-utils/index';
import { createTestQueryClient } from '../../../test-utils/index';
import { vi } from 'vitest';

const {
  mockCreate,
  mockRecordCompletedCreate,
  mockBuildFormData,
  mockAddTagToProject,
  mockNavigateToProject,
  mockToast,
  mockCapture,
  mockIsValidationError,
  mockNormalizeError,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockRecordCompletedCreate: vi.fn(),
  mockBuildFormData: vi.fn(),
  mockAddTagToProject: vi.fn(),
  mockNavigateToProject: vi.fn(),
  mockToast: vi.fn(),
  mockCapture: vi.fn(),
  mockIsValidationError: vi.fn(() => false),
  mockNormalizeError: vi.fn(),
}));

vi.doMock('@/services/auth', () => ({ getAuthToken: () => 'original-token' }));
vi.doMock('@/services/auth/sessionRecovery', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/auth/sessionRecovery')>()),
  recordCompletedSessionCreate: mockRecordCompletedCreate,
}));

vi.doMock('@/services/pocketbase/projects.service', () => ({
  projectsService: {
    create: mockCreate,
    update: vi.fn(),
  },
}));

vi.doMock('@/services/pocketbase/tags.service', () => ({
  TagService: {
    addTagToProject: mockAddTagToProject,
  },
}));

vi.doMock('../projectMutationAdapters', () => ({
  buildCreateProjectFormData: mockBuildFormData,
}));

vi.doMock('@/hooks/useNavigateToProject', () => ({
  useNavigateToProject: () => mockNavigateToProject,
}));

vi.doMock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-123' } }),
}));

vi.doMock('@/lib/notifications', () => ({
  notify: mockToast,
  notifySuccess: mockToast,
  notifyWarning: mockToast,
  notifyError: mockToast,
  notifyInfo: mockToast,
}));

vi.doMock('@/services/analytics-escape-hatch', () => ({
  capture: mockCapture,
}));

vi.doMock('@/services/errors', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../services/errors')>();
  return {
    ...actual,
    isValidationError: mockIsValidationError,
    isNonRetryableError: vi.fn(() => true),
    normalizeError: mockNormalizeError,
  };
});

let sessionGeneration = 0;
let sessionAccountId: string | null = 'user-123';
vi.doMock('@/services/auth/sessionIdentity', () => ({
  captureSessionIdentity: () => ({ accountId: sessionAccountId, generation: sessionGeneration }),
  isCurrentSessionIdentity: (identity: { generation: number }) =>
    identity.generation === sessionGeneration,
}));

const { useCreateProject } = await import('../useCreateProject');

describe('useCreateProject redirect flow', () => {
  beforeEach(() => {
    sessionGeneration = 0;
    sessionAccountId = 'user-123';
    vi.clearAllMocks();
    mockCapture.mockReset();
    mockBuildFormData.mockImplementation(async () => new FormData());
    mockNavigateToProject.mockReturnValue({ success: true, projectId: 'project-123' });
    mockCreate.mockResolvedValue({
      id: 'project-123',
      userId: 'user-123',
      title: 'Galaxy Garden',
      image: 'cover.jpg',
    });
    mockAddTagToProject.mockResolvedValue({ status: 'success' });
    mockIsValidationError.mockReturnValue(false);
    mockNormalizeError.mockReturnValue({
      type: 'unknown',
      message: 'normalized error',
      retryable: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('navigates after the redirect-enabled create mutation succeeds', async () => {
    const { result } = renderHookWithProviders(() => useCreateProject({ redirect: true }));

    await act(async () => {
      await result.current.mutateAsync({
        userId: 'user-123',
        title: 'Galaxy Garden',
      });
    });

    await waitFor(() => {
      expect(mockNavigateToProject).toHaveBeenCalledWith(
        'project-123',
        expect.objectContaining({
          replace: true,
        })
      );
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'success',
        title: 'Project created',
      })
    );
    expect(mockCapture).toHaveBeenCalled();
  });

  it('refreshes Stats immediately and defers navigation caches', async () => {
    vi.useFakeTimers();

    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHookWithProviders(() => useCreateProject({ redirect: true }), {
      queryClient,
    });

    const mutatePromise = result.current.mutateAsync({
      userId: 'user-123',
      title: 'Galaxy Garden',
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
      await mutatePromise;
    });

    expect(mockNavigateToProject).toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['stats'],
      predicate: expect.any(Function),
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['projects', 'list'] });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects', 'list'] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['projects', 'detail', 'project-123'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tags', 'stats'] });
  });
});
