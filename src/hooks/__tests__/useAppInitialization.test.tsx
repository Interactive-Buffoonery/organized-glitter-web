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
});
