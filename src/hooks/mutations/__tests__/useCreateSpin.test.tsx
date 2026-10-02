/**
 * Tests for useCreateSpin hook
 * Tests actual hook behavior with real implementation
 * @author @serabi
 * @created 2025-07-29
 */

import {
  describe,
  it,
  expect,
  waitFor,
  act,
  renderHookWithProviders,
  createTestQueryClient,
} from '@/test-utils';
import { vi } from 'vitest';

// Mock the dependencies
const { mockCreateSpinEnhanced, mockToast, mockCapture } = vi.hoisted(() => ({
  mockCreateSpinEnhanced: vi.fn(),
  mockToast: vi.fn(),
  mockCapture: vi.fn(),
}));

vi.doMock('@/services/pocketbase/randomizerService', () => ({
  createSpinEnhanced: mockCreateSpinEnhanced,
}));

vi.doMock('@/lib/notifications', () => ({
  notify: mockToast,
  notifySuccess: mockToast,
  notifyWarning: mockToast,
  notifyError: mockToast,
  notifyInfo: mockToast,
}));

vi.doMock('@/hooks/queries/useSpinHistory', () => ({
  randomizerQueryKeys: {
    all: ['randomizer'],
    history: vi.fn((userId: string, limit?: number) => ['randomizer', 'history', userId, limit]),
    count: vi.fn((userId: string) => ['randomizer', 'count', userId]),
  },
}));

vi.doMock('@/services/analytics-escape-hatch', () => ({
  capture: mockCapture,
}));

// Import after mocking
const { useCreateSpin } = await import('../useCreateSpin');

describe('useCreateSpin hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage?.clear?.();
  });

  it('should start in idle state', () => {
    const { result } = renderHookWithProviders(() => useCreateSpin());

    expect(result.current.isPending).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(typeof result.current.mutate).toBe('function');
  });

  it('should handle successful spin creation', async () => {
    const mockResponse = {
      id: 'spin-123',
      user: 'test-user-id',
      project: 'test-project-id',
      project_title: 'Test Project',
      selected_projects: ['project-1', 'project-2'],
      selected_count: 2,
      spun_at: new Date().toISOString(),
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      collectionId: 'randomizer_spins',
      collectionName: 'randomizer_spins',
    };

    mockCreateSpinEnhanced.mockResolvedValue(mockResponse);

    const { result } = renderHookWithProviders(() => useCreateSpin());

    const spinParams = {
      user: 'test-user-id',
      project: 'test-project-id',
      project_title: 'Test Project',
      selected_projects: ['project-1', 'project-2'],
    };

    act(() => {
      result.current.mutate(spinParams);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockCreateSpinEnhanced).toHaveBeenCalledWith(
      expect.objectContaining({
        user: spinParams.user,
        project: spinParams.project,
        project_title: spinParams.project_title,
        selected_projects: spinParams.selected_projects,
      })
    );
    expect(result.current.data).toEqual(mockResponse);
    expect(mockCapture).toHaveBeenCalledWith('randomizer_spin', {
      selected_count: 2,
    });
    expect(mockCapture).toHaveBeenCalledWith('randomizer_first_spin', {
      source_surface: 'randomizer',
      selected_count: 2,
      mode: 'diamond',
    });
  });

  it('writes coloring spin metadata without a project relation', async () => {
    const metadata = {
      version: 1 as const,
      mode: 'coloring-book' as const,
      target: {
        id: 'book-12345678901',
        targetType: 'coloring_book' as const,
        title: 'Garden Pages',
        subtitle: 'Indie Press',
        href: '/coloring/book-12345678901',
      },
      eligibility: {
        diamondStatuses: ['progress'],
        bookStatuses: ['in_progress'],
        pageStatuses: ['palette_chosen', 'in_progress'],
        ownership: 'owned' as const,
      },
      selectedTargetIds: ['book-12345678901', 'book-22222222222'],
      selectedTargets: [
        {
          id: 'book-12345678901',
          targetType: 'coloring_book' as const,
          title: 'Garden Pages',
          subtitle: 'Indie Press',
        },
      ],
    };

    mockCreateSpinEnhanced.mockResolvedValue({
      id: 'spin-123',
      user: 'test-user-id',
      project: '',
      project_title: 'Garden Pages',
      selected_projects: metadata.selectedTargetIds,
      selected_count: 2,
      metadata,
      spun_at: new Date().toISOString(),
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      collectionId: 'randomizer_spins',
      collectionName: 'randomizer_spins',
    });

    const { result } = renderHookWithProviders(() => useCreateSpin());

    act(() => {
      result.current.mutate({
        user: 'test-user-id',
        project_title: 'Garden Pages',
        selected_projects: metadata.selectedTargetIds,
        metadata,
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const [createParams] = mockCreateSpinEnhanced.mock.calls[0];
    expect(createParams).not.toHaveProperty('project');
    expect(createParams).toMatchObject({ metadata });
  });

  it('should handle mutation errors', async () => {
    const mockError = new Error('Permission denied');
    mockCreateSpinEnhanced.mockRejectedValue(mockError);

    const { result } = renderHookWithProviders(() => useCreateSpin());

    act(() => {
      result.current.mutate({
        user: 'test-user-id',
        project: 'test-project-id',
        project_title: 'Test Project',
        selected_projects: ['project-1'],
      });
    });

    await waitFor(
      () => {
        expect(result.current.isError).toBe(true);
      },
      { timeout: 3000 }
    );

    expect(result.current.error).toBe(mockError);
    expect(result.current.isSuccess).toBe(false);
  });

  it('does not replay spin creation after an ambiguous network error', async () => {
    vi.useFakeTimers();
    try {
      mockCreateSpinEnhanced.mockRejectedValue(new Error('Network connection failed'));
      const queryClient = createTestQueryClient();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
      const { result } = renderHookWithProviders(() => useCreateSpin(), { queryClient });

      let mutationPromise!: Promise<unknown>;
      act(() => {
        mutationPromise = result.current.mutateAsync({
          user: 'test-user-id',
          project: 'test-project-id',
          project_title: 'Test Project',
          selected_projects: ['project-1'],
        });
      });
      const rejection = expect(mutationPromise).rejects.toThrow('Network connection failed');

      await act(async () => {
        await vi.runAllTimersAsync();
      });
      await rejection;

      expect(mockCreateSpinEnhanced).toHaveBeenCalledOnce();
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['randomizer'] });
      expect(mockToast).toHaveBeenCalledWith({
        kind: 'warning',
        title: 'Spin history status unknown',
        description: 'Check your spin history before recording this result again.',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('should show loading state during mutation', async () => {
    let resolvePromise: (value: unknown) => void;
    const slowPromise = new Promise(resolve => {
      resolvePromise = resolve;
    });

    mockCreateSpinEnhanced.mockImplementation(() => slowPromise);

    const { result } = renderHookWithProviders(() => useCreateSpin());

    act(() => {
      result.current.mutate({
        user: 'test-user-id',
        project: 'test-project-id',
        project_title: 'Test Project',
        selected_projects: ['project-1'],
      });
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });
    expect(result.current.isSuccess).toBe(false);

    act(() => {
      resolvePromise!({ success: true });
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });

    expect(result.current.isSuccess).toBe(true);
  });

  it('should call toast on success', async () => {
    const mockResponse = {
      id: 'spin-123',
      user: 'test-user-id',
      project: 'test-project-id',
      project_title: 'Test Project',
      selected_projects: ['project-1'],
      selected_count: 1,
      spun_at: new Date().toISOString(),
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      collectionId: 'randomizer_spins',
      collectionName: 'randomizer_spins',
    };

    mockCreateSpinEnhanced.mockResolvedValue(mockResponse);

    const { result } = renderHookWithProviders(() => useCreateSpin());

    const spinParams = {
      user: 'test-user-id',
      project: 'test-project-id',
      project_title: 'Test Project',
      selected_projects: ['project-1'],
    };

    act(() => {
      result.current.mutate(spinParams);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockToast).toHaveBeenCalledWith({
      kind: 'info',
      title: 'Spin recorded!',
      description: 'Selected: Test Project',
    });
  });

  it('should call toast on error', async () => {
    const mockError = new Error('Permission denied');
    mockCreateSpinEnhanced.mockRejectedValue(mockError);

    const { result } = renderHookWithProviders(() => useCreateSpin());

    const spinParams = {
      user: 'test-user-id',
      project: 'test-project-id',
      project_title: 'Test Project',
      selected_projects: ['project-1'],
    };

    act(() => {
      result.current.mutate(spinParams);
    });

    await waitFor(
      () => {
        expect(result.current.isError).toBe(true);
      },
      { timeout: 3000 }
    );

    expect(mockToast).toHaveBeenCalledWith({
      kind: 'error',
      title: 'Action Required',
      description: 'Please log in again',
    });
  });
});
