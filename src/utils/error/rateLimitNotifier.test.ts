import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupErrorHandler } from './rateLimitNotifier';

describe('setupErrorHandler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('removes both global listeners when its owner unmounts', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const removeEventListener = vi.spyOn(window, 'removeEventListener');

    const cleanup = setupErrorHandler(vi.fn());
    cleanup();

    const rejectionHandler = addEventListener.mock.calls.find(
      ([eventName]) => eventName === 'unhandledrejection'
    )?.[1];
    const errorHandler = addEventListener.mock.calls.find(
      ([eventName]) => eventName === 'error'
    )?.[1];

    expect(removeEventListener).toHaveBeenCalledWith('unhandledrejection', rejectionHandler);
    expect(removeEventListener).toHaveBeenCalledWith('error', errorHandler);
  });
});
