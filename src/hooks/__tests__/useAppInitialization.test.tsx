import { StrictMode } from 'react';
import { setupGlobalAuthClear } from '@/services/auth';
import { setupErrorHandler } from '@/utils/error/rateLimitNotifier';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppInitialization } from '../useAppInitialization';

vi.mock('@/services/auth', () => ({ setupGlobalAuthClear: vi.fn(() => vi.fn()) }));
vi.mock('@/utils/error/rateLimitNotifier', () => ({
  setupErrorHandler: vi.fn(() => vi.fn()),
}));
vi.mock('@/lib/notifications', () => ({
  notifyError: vi.fn(),
  notifyInfo: vi.fn(),
  notifySuccess: vi.fn(),
  notifyWarning: vi.fn(),
}));
vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    warn: vi.fn(),
    error: vi.fn(),
    criticalError: vi.fn(),
    log: vi.fn(),
  }),
}));

describe('useAppInitialization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cancels a pending chunk-error reload when the app unmounts', () => {
    const { unmount } = renderHook(() => useAppInitialization());
    const rejection = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.defineProperty(rejection, 'reason', {
      value: new Error('Expected JavaScript but received text/html'),
    });

    window.dispatchEvent(rejection);
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
  it('cleans each setup and removes its listener during StrictMode replay and unmount', () => {
    const authCleanups = [vi.fn(), vi.fn()];
    const errorCleanups = [vi.fn(), vi.fn()];
    vi.mocked(setupGlobalAuthClear)
      .mockReturnValueOnce(authCleanups[0])
      .mockReturnValueOnce(authCleanups[1]);
    vi.mocked(setupErrorHandler)
      .mockReturnValueOnce(errorCleanups[0])
      .mockReturnValueOnce(errorCleanups[1]);
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useAppInitialization(), { wrapper: StrictMode });
    expect(authCleanups[0]).toHaveBeenCalledTimes(1);
    expect(errorCleanups[0]).toHaveBeenCalledTimes(1);
    expect(authCleanups[1]).not.toHaveBeenCalled();
    unmount();
    expect(authCleanups[1]).toHaveBeenCalledTimes(1);
    expect(errorCleanups[1]).toHaveBeenCalledTimes(1);
    const listeners = add.mock.calls.filter(([type]) => type === 'unhandledrejection');
    expect(listeners).toHaveLength(2);
    for (const [, listener] of listeners) {
      expect(remove).toHaveBeenCalledWith('unhandledrejection', listener);
    }
    const rejection = new Event('unhandledrejection');
    Object.defineProperty(rejection, 'reason', { value: new Error('MIME type') });
    window.dispatchEvent(rejection);
    expect(vi.getTimerCount()).toBe(0);
    add.mockRestore();
    remove.mockRestore();
  });
});
