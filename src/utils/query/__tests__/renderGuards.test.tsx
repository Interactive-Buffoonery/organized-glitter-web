import { Suspense, StrictMode, startTransition, useState } from 'react';
import { act, render, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRenderGuard } from '../renderGuards';

const readStats = (guard: ReturnType<typeof useRenderGuard>) => guard.getRenderStats();

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('@/utils/logger', () => ({ createLogger: () => ({ warn }) }));

describe('useRenderGuard', () => {
  afterEach(() => {
    vi.useRealTimers();
    warn.mockClear();
  });

  it('counts each commit once in StrictMode without scheduling extra renders', () => {
    const { result, rerender } = renderHook(() => useRenderGuard('Test', 2), {
      wrapper: StrictMode,
    });
    expect(readStats(result.current)).toEqual({ renderCount: 1, isExcessive: false });
    rerender();
    expect(readStats(result.current)).toEqual({ renderCount: 2, isExcessive: false });
    rerender();
    expect(readStats(result.current)).toEqual({ renderCount: 3, isExcessive: true });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does not count or warn for suspended renders and preserves the warning budget', async () => {
    const pending = new Promise<void>(() => {});
    let update!: (value: { suspended: boolean }) => void;
    let getStats!: () => ReturnType<typeof readStats>;
    let attempted = false;
    const Harness = () => {
      const [state, setState] = useState({ suspended: false });
      update = setState;
      const guard = useRenderGuard('Test', 1);
      getStats = () => readStats(guard);
      if (state.suspended) {
        attempted = true;
        throw pending;
      }
      return null;
    };
    render(
      <Suspense fallback="Loading">
        <Harness />
      </Suspense>
    );
    await act(async () => {
      startTransition(() => update({ suspended: true }));
    });
    expect(attempted).toBe(true);
    expect(getStats()).toEqual({ renderCount: 1, isExcessive: false });
    expect(warn).not.toHaveBeenCalled();
    act(() => update({ suspended: false }));
    expect(getStats()).toEqual({ renderCount: 2, isExcessive: true });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('resets after three seconds and throttles warnings for five seconds', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10000);
    const { result, rerender } = renderHook(() => useRenderGuard('Test', 1));
    rerender();
    expect(warn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3001);
    rerender();
    expect(readStats(result.current).renderCount).toBe(1);
    rerender();
    expect(warn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    rerender();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
