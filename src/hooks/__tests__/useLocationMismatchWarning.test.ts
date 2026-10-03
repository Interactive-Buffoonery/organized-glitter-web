/**
 * Regression tests for useLocationMismatchWarning.
 *
 * Transient pathname mismatches during normal navigation (React Router's
 * useLocation catches up a tick after window.location) must not log. Only
 * mismatches that persist past LOCATION_MISMATCH_SETTLE_MS should warn.
 *
 * Related: GitHub issue #142, the historical dashboard refresh-loop regression.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// Use vi.hoisted so the spy exists before vi.mock's factory runs (vi.mock is
// hoisted to the top of the module at transform time).
const { warnSpy } = vi.hoisted(() => ({ warnSpy: vi.fn() }));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: warnSpy,
    error: vi.fn(),
    criticalError: vi.fn(),
  }),
}));

// Import after mock so the hook picks up the mocked logger.
import {
  useLocationMismatchWarning,
  LOCATION_MISMATCH_SETTLE_MS,
} from '../useLocationMismatchWarning';

// Update the browser pathname through the History API so the hook reads the
// same Location object shape JSDOM exposes under modern React/Vitest/jsdom.
const setBrowserPath = (path: string) => {
  window.history.replaceState({}, '', path);
};

describe('useLocationMismatchWarning', () => {
  beforeEach(() => {
    warnSpy.mockClear();
    vi.useFakeTimers();
    setBrowserPath('/');
  });

  afterEach(() => {
    // Cancel any pending fake timers so their callbacks can't leak into the
    // next test when we switch back to real timers.
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('does not warn when router and browser paths match', () => {
    setBrowserPath('/dashboard');

    renderHook(() => useLocationMismatchWarning('/dashboard'));
    vi.advanceTimersByTime(LOCATION_MISMATCH_SETTLE_MS + 50);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not warn when a transient mismatch resolves before the settle window', () => {
    // Simulates the post-delete race: browser path advances first, router
    // catches up well within LOCATION_MISMATCH_SETTLE_MS.
    setBrowserPath('/dashboard');

    const { rerender } = renderHook(({ routerPath }) => useLocationMismatchWarning(routerPath), {
      initialProps: { routerPath: '/projects/abc123' },
    });

    // Router still stale, but well before settle.
    vi.advanceTimersByTime(50);
    rerender({ routerPath: '/dashboard' });

    // Advance past the original timer to prove cleanup cancelled it.
    vi.advanceTimersByTime(LOCATION_MISMATCH_SETTLE_MS + 50);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns exactly once when a mismatch persists past the settle window', () => {
    setBrowserPath('/dashboard');

    renderHook(() => useLocationMismatchWarning('/projects/abc123'));
    vi.advanceTimersByTime(LOCATION_MISMATCH_SETTLE_MS + 50);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message, payload] = warnSpy.mock.calls[0];
    expect(message).toMatch(/LOCATION MISMATCH DETECTED \(persistent\)/);
    expect(payload).toMatchObject({
      routerPath: '/projects/abc123',
      browserPath: '/dashboard',
      settleMs: LOCATION_MISMATCH_SETTLE_MS,
    });
  });

  it('cancels the pending timer when routerPath changes before it fires', () => {
    setBrowserPath('/dashboard');

    const { rerender } = renderHook(({ routerPath }) => useLocationMismatchWarning(routerPath), {
      initialProps: { routerPath: '/projects/abc123' },
    });

    // Start a timer, then swap routerPath to something *also* mismatched.
    vi.advanceTimersByTime(100);
    rerender({ routerPath: '/projects/xyz999' });

    // Only the second timer should still be pending; advance it and expect one warn.
    vi.advanceTimersByTime(LOCATION_MISMATCH_SETTLE_MS + 50);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][1]).toMatchObject({ routerPath: '/projects/xyz999' });
  });
});
