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
  mockAddTagToProject,
  mockNavigateToProject,
  mockToast,
  mockCapture,
  mockIsValidationError,
  mockNormalizeError,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockAddTagToProject: vi.fn(),
  mockNavigateToProject: vi.fn(),
  mockToast: vi.fn(),
  mockCapture: vi.fn(),
  mockIsValidationError: vi.fn(() => false),
  mockNormalizeError: vi.fn(),
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
  buildCreateProjectFormData: vi.fn(async () => {
    const formData = new FormData();
    formData.append('title', 'Galaxy Garden');
    return formData;
  }),
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

const { useCreateProject } = await import('../useCreateProject');

describe('useCreateProject redirect flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCapture.mockReset();
    mockNavigateToProject.mockReturnValue({ success: true, projectId: 'project-123' });
    mockCreate.mockResolvedValue({
      id: 'project-123',
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

  it('keeps a successful create successful when cache invalidation fails', async () => {
    vi.useFakeTimers();

    const queryClient = createTestQueryClient();
    vi.spyOn(queryClient, 'invalidateQueries').mockRejectedValue(new Error('cache unavailable'));

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
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(result.current.isSuccess).toBe(true);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'success', title: 'Project created' })
    );
    expect(mockToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Error Creating Project' })
    );
  });

  it('keeps a confirmed create successful when analytics throws', async () => {
    mockCapture.mockImplementation(() => {
      throw new Error('analytics unavailable');
    });

    const { result } = renderHookWithProviders(() => useCreateProject({ redirect: true }));

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          userId: 'user-123',
          title: 'Galaxy Garden',
        })
      ).resolves.toEqual(
        expect.objectContaining({ project: expect.objectContaining({ id: 'project-123' }) })
      );
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockNavigateToProject).toHaveBeenCalledWith(
      'project-123',
      expect.objectContaining({ replace: true })
    );
    expect(mockToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Error Creating Project' })
    );
  });

  it('shows a Validation Error toast when the error is a validation error', async () => {
    mockCreate.mockRejectedValue(new Error('invalid input'));
    mockIsValidationError.mockReturnValue(true);
    mockNormalizeError.mockReturnValue({
      type: 'validation',
      message: 'Title is required',
      retryable: false,
    });

    const { result } = renderHookWithProviders(() => useCreateProject({ redirect: true }));

    await act(async () => {
      try {
        await result.current.mutateAsync({
          userId: 'user-123',
          title: '',
        });
      } catch {
        /* expected */
      }
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'error',
          title: 'Validation Error',
          description: 'Title is required',
        })
      );
    });

    expect(mockNavigateToProject).not.toHaveBeenCalled();
  });

  it('shows a Too Many Requests toast when the error mentions 429', async () => {
    mockCreate.mockRejectedValue(new Error('429 Too Many Requests'));

    const { result } = renderHookWithProviders(() => useCreateProject({ redirect: true }));

    await act(async () => {
      try {
        await result.current.mutateAsync({
          userId: 'user-123',
          title: 'Galaxy Garden',
        });
      } catch {
        /* expected */
      }
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'error',
          title: 'Too Many Requests',
        })
      );
    });
  });

  it('reports an uncertain outcome before the user manually retries a network failure', async () => {
    mockCreate.mockRejectedValue(new Error('Failed to fetch'));
    mockNormalizeError.mockReturnValue({
      type: 'network',
      message: 'Network connection failed. Please check your connection and try again.',
      retryable: true,
    });

    const { result } = renderHookWithProviders(() => useCreateProject({ redirect: true }));

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          userId: 'user-123',
          title: 'Galaxy Garden',
        })
      ).rejects.toThrow('Failed to fetch');
    });

    expect(mockToast).toHaveBeenCalledWith({
      kind: 'warning',
      title: 'Project creation status unknown',
      description:
        'We could not confirm whether "Galaxy Garden" was created. Check your project list before trying again.',
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('reports an uncertain outcome when the create response is aborted after dispatch', async () => {
    mockCreate.mockRejectedValue(new Error('The request was aborted'));
    mockNormalizeError.mockReturnValue({
      type: 'cancelled',
      message: 'Request was cancelled.',
      status: 0,
      retryable: false,
    });

    const { result } = renderHookWithProviders(() => useCreateProject({ redirect: true }));

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          userId: 'user-123',
          title: 'Galaxy Garden',
        })
      ).rejects.toThrow('The request was aborted');
    });

    expect(mockToast).toHaveBeenCalledWith({
      kind: 'warning',
      title: 'Project creation status unknown',
      description:
        'We could not confirm whether "Galaxy Garden" was created. Check your project list before trying again.',
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('reports an uncertain outcome for a status-zero create response', async () => {
    mockCreate.mockRejectedValue(new Error('Something went wrong while processing your request.'));
    mockNormalizeError.mockReturnValue({
      type: 'server',
      message: 'Something went wrong while processing your request.',
      status: 0,
      retryable: false,
    });

    const { result } = renderHookWithProviders(() => useCreateProject({ redirect: true }));

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          userId: 'user-123',
          title: 'Galaxy Garden',
        })
      ).rejects.toThrow('Something went wrong while processing your request.');
    });

    expect(mockToast).toHaveBeenCalledWith({
      kind: 'warning',
      title: 'Project creation status unknown',
      description:
        'We could not confirm whether "Galaxy Garden" was created. Check your project list before trying again.',
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('reports tag-link failures as a partial save instead of full success', async () => {
    mockAddTagToProject.mockResolvedValue({ status: 'error', error: 'link failed' });

    const { result } = renderHookWithProviders(() => useCreateProject({ redirect: true }));

    await act(async () => {
      await result.current.mutateAsync({
        userId: 'user-123',
        title: 'Galaxy Garden',
        tagIds: ['tag-1'],
      });
    });

    expect(mockToast).toHaveBeenCalledWith({
      kind: 'warning',
      title: "Project created, but some tags didn't save",
      description: 'Open "Galaxy Garden" to retry your tags.',
    });
    expect(mockNavigateToProject).toHaveBeenCalledWith(
      'project-123',
      expect.objectContaining({ replace: true })
    );
  });

  it('shows a Navigation Warning and falls back to window.location when navigation fails', async () => {
    vi.useFakeTimers();
    mockNavigateToProject.mockReturnValue({ success: false, error: 'boom' });

    const hrefSetter = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        set href(value: string) {
          hrefSetter(value);
        },
      },
    });

    try {
      const { result } = renderHookWithProviders(() => useCreateProject({ redirect: true }));

      const mutatePromise = result.current.mutateAsync({
        userId: 'user-123',
        title: 'Galaxy Garden',
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
        await mutatePromise;
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'info',
          title: 'Navigation Warning',
        })
      );

      expect(hrefSetter).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1100);
      });

      expect(hrefSetter).toHaveBeenCalledWith('/projects/project-123');
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });
});
