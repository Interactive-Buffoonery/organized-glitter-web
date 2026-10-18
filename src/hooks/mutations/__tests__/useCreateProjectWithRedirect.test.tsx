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
  mockBuildFormData,
  mockAddTagToProject,
  mockNavigateToProject,
  mockToast,
  mockCapture,
  mockIsValidationError,
  mockNormalizeError,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockBuildFormData: vi.fn(),
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

  it('does not navigate or invalidate navigation caches after the session changes during the toast delay', async () => {
    vi.useFakeTimers();
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHookWithProviders(() => useCreateProject({ redirect: true }), {
      queryClient,
    });
    const pending = result.current.mutateAsync({ userId: 'user-123', title: 'Galaxy Garden' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    sessionGeneration += 1;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
      await pending;
    });
    expect(mockNavigateToProject).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ['projects', 'detail', 'project-123'],
    });
  });

  it('does not dispatch or clear the draft when the account signs back in before mutation execution', async () => {
    const queryClient = createTestQueryClient();
    queryClient.getMutationCache().config.onMutate = () => {
      sessionGeneration += 1;
    };
    const onConfirmedSave = vi.fn();
    const { result } = renderHookWithProviders(() => useCreateProject({ onConfirmedSave }), {
      queryClient,
    });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ userId: 'user-123', title: 'Galaxy Garden' })
      ).rejects.toMatchObject({ reason: 'session_changed' });
    });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(onConfirmedSave).not.toHaveBeenCalled();
  });

  it('keeps concurrent calls with the same input separate and preserves public callbacks', async () => {
    const queryClient = createTestQueryClient();
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });
    let calls = 0;
    queryClient.getMutationCache().config.onMutate = () => {
      calls += 1;
      if (calls === 1) return firstGate;
    };
    const onConfirmedSave = vi.fn();
    const onSuccess = vi.fn();
    const onSettled = vi.fn();
    const { result } = renderHookWithProviders(() => useCreateProject({ onConfirmedSave }), {
      queryClient,
    });
    const input = { userId: 'user-123', title: 'Galaxy Garden' };
    const first = result.current.mutateAsync(input);
    const firstRejected = expect(first).rejects.toMatchObject({ reason: 'session_changed' });
    await waitFor(() => expect(calls).toBe(1));
    sessionGeneration += 1;
    await act(async () => {
      await result.current.mutateAsync(input, { onSuccess, onSettled });
    });
    expect(result.current.variables).toBe(input);
    expect(onSuccess).toHaveBeenCalledWith(
      expect.any(Object),
      input,
      expect.any(Object),
      expect.any(Object)
    );
    expect(onSettled).toHaveBeenCalledWith(
      expect.any(Object),
      null,
      input,
      expect.any(Object),
      expect.any(Object)
    );
    await act(async () => {
      releaseFirst();
      await firstRejected;
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(onConfirmedSave).toHaveBeenCalledTimes(1);
  });

  it('does not dispatch a create after the session changes while preparing the form', async () => {
    let finishPreparation!: (value: FormData) => void;
    mockBuildFormData.mockImplementation(
      () =>
        new Promise<FormData>(resolve => {
          finishPreparation = resolve;
        })
    );
    const { result } = renderHookWithProviders(() => useCreateProject({ redirect: true }));
    const pending = result.current.mutateAsync({ userId: 'user-123', title: 'Galaxy Garden' });
    const rejected = expect(pending).rejects.toMatchObject({ reason: 'session_changed' });
    await waitFor(() => expect(mockBuildFormData).toHaveBeenCalled());
    sessionGeneration += 1;
    await act(async () => {
      finishPreparation(new FormData());
      await rejected;
    });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('does not publish create errors after the session changes', async () => {
    let rejectCreate!: (reason: Error) => void;
    mockCreate.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectCreate = reject;
        })
    );
    const { result } = renderHookWithProviders(() => useCreateProject({ redirect: true }));
    const pending = result.current.mutateAsync({ userId: 'user-123', title: 'Galaxy Garden' });
    const rejected = expect(pending).rejects.toThrow('old failure');
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    sessionGeneration += 1;
    await act(async () => {
      rejectCreate(new Error('old failure'));
      await rejected;
    });
    expect(mockToast).not.toHaveBeenCalled();
  });

  it.each([null, 'another-account'])(
    'rejects stale form ownership in session %s',
    async accountId => {
      sessionAccountId = accountId;
      const { result } = renderHookWithProviders(() => useCreateProject({ redirect: true }));
      await act(async () => {
        await expect(
          result.current.mutateAsync({ userId: 'user-123', title: 'Galaxy Garden' })
        ).rejects.toMatchObject({ reason: 'session_changed' });
      });
      expect(mockBuildFormData).not.toHaveBeenCalled();
      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockToast).not.toHaveBeenCalled();
    }
  );

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

  it.each([false, true])(
    'only runs the hard redirect fallback in its originating session (retired=%s)',
    async retired => {
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
        if (retired) sessionGeneration += 1;

        await act(async () => {
          await vi.advanceTimersByTimeAsync(1100);
        });

        if (retired) expect(hrefSetter).not.toHaveBeenCalled();
        else expect(hrefSetter).toHaveBeenCalledWith('/projects/project-123');
      } finally {
        Object.defineProperty(window, 'location', {
          configurable: true,
          value: originalLocation,
        });
      }
    }
  );
});
