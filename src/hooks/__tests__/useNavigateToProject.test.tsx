import { act, renderHookWithProviders } from '@/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { navigate, capture } = vi.hoisted(() => ({ navigate: vi.fn(), capture: vi.fn() }));
vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));
vi.mock('@posthog/react', () => ({ usePostHog: () => ({ capture }) }));
let generation = 0;
vi.mock('@/services/auth/sessionIdentity', () => ({
  captureSessionIdentity: () => ({ generation }),
  isCurrentSessionIdentity: (identity: { generation: number }) =>
    identity.generation === generation,
}));

import { useNavigateToProject } from '../useNavigateToProject';

describe('project navigation fallback', () => {
  const originalLocation = window.location;
  const setHref = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    generation = 0;
    navigate.mockReset();
    setHref.mockReset();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        pathname: '/dashboard',
        set href(value: string) {
          setHref(value);
        },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it.each([false, true])(
    'only retries navigation in the originating session (retired=%s)',
    async retired => {
      const { result } = renderHookWithProviders(() => useNavigateToProject());
      act(() => {
        result.current('project-a');
      });
      expect(navigate).toHaveBeenCalled();
      if (retired) generation += 1;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(150);
      });
      if (retired) expect(setHref).not.toHaveBeenCalled();
      else expect(setHref).toHaveBeenCalledWith('/projects/project-a');
    }
  );
});
