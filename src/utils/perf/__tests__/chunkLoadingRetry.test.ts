import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('dynamic chunk recovery adapter', () => {
  const listeners: Array<Parameters<typeof window.addEventListener>> = [];
  let recoverChunk: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    recoverChunk = vi.fn().mockResolvedValue(false);
    Object.assign(window, { __OG_RESOURCE_RECOVERY__: { recoverChunk } });
    const addListener = window.addEventListener;
    vi.spyOn(window, 'addEventListener').mockImplementation((...args) => {
      listeners.push(args);
      addListener.apply(window, args);
    });
  });

  afterEach(() => {
    for (const args of listeners.splice(0)) window.removeEventListener(...args);
    Reflect.deleteProperty(window, '__OG_RESOURCE_RECOVERY__');
    vi.restoreAllMocks();
  });

  it('delegates preload errors without suppressing the route error boundary', async () => {
    const { initializeChunkLoadingRetry } = await import('../chunkLoadingRetry');
    initializeChunkLoadingRetry();
    const error = new Error('Failed to fetch dynamically imported module: /assets/page.js');
    const event = new Event('vite:preloadError', { cancelable: true });
    Object.defineProperty(event, 'payload', { value: error });
    window.dispatchEvent(event);
    expect(recoverChunk).toHaveBeenCalledWith(error);
    expect(event.defaultPrevented).toBe(false);
  });

  it('installs handlers once', async () => {
    const { initializeChunkLoadingRetry } = await import('../chunkLoadingRetry');
    initializeChunkLoadingRetry();
    initializeChunkLoadingRetry();
    expect(listeners.filter(([type]) => type === 'vite:preloadError')).toHaveLength(1);
  });

  it('passes unhandled module failures to the bounded shared recovery', async () => {
    const { initializeChunkLoadingRetry } = await import('../chunkLoadingRetry');
    initializeChunkLoadingRetry();
    const error = new Error('Failed to fetch dynamically imported module: /assets/page.js');
    const event = new Event('unhandledrejection', { cancelable: true });
    Object.defineProperty(event, 'reason', { value: error });
    window.dispatchEvent(event);
    expect(recoverChunk).toHaveBeenCalledWith(error);
    expect(event.defaultPrevented).toBe(false);
  });

  it('keeps manual recovery available when the early loader is missing', async () => {
    Reflect.deleteProperty(window, '__OG_RESOURCE_RECOVERY__');
    const { initializeChunkLoadingRetry } = await import('../chunkLoadingRetry');
    initializeChunkLoadingRetry();
    expect(() => window.dispatchEvent(new Event('vite:preloadError'))).not.toThrow();
    expect(recoverChunk).not.toHaveBeenCalled();
  });
});
