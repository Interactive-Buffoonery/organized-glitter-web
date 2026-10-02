import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePWAInstall } from '@/hooks/usePWAInstall';

const shouldShowMacOSInstallPrompt = vi.hoisted(() => vi.fn());

vi.mock('@/utils/ui/deviceDetection', () => ({
  shouldShowMacOSInstallPrompt,
}));

describe('usePWAInstall', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    shouldShowMacOSInstallPrompt.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('cancels the delayed install prompt after unmount', () => {
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const { unmount } = renderHook(() => usePWAInstall());

    window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));
    const timerId = vi.getTimerCount();

    expect(timerId).toBe(1);

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('replaces the delayed prompt timer when the install event repeats', () => {
    const { unmount } = renderHook(() => usePWAInstall());

    act(() => {
      window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));
      window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));
    });

    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels the delayed macOS install guidance after unmount', () => {
    shouldShowMacOSInstallPrompt.mockReturnValue(true);
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const { unmount } = renderHook(() => usePWAInstall());

    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
