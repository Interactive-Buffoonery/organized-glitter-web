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
});
