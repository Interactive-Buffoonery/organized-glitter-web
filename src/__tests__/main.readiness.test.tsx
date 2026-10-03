import { beforeEach, describe, expect, it, vi } from 'vitest';

const { markFatalMounted, markExceptionMounted } = vi.hoisted(() => ({
  markFatalMounted: vi.fn(),
  markExceptionMounted: vi.fn(),
}));

vi.mock('react-dom/client', () => ({
  createRoot: () => ({ render: vi.fn() }),
}));
vi.mock('@/App', () => ({ default: () => null }));
vi.mock('@/lib/queryClient', () => ({ queryClient: {} }));
vi.mock('@/utils/auth/userInitialization', () => ({ initializeUser: vi.fn() }));
vi.mock('@/utils/error/fatalErrorHandler', () => ({
  handleFatalError: vi.fn(),
  markAppMounted: markFatalMounted,
  setupGlobalErrorHandlers: vi.fn(),
}));
vi.mock('@/utils/error/exceptionContext', () => ({ markAppMounted: markExceptionMounted }));
vi.mock('@/utils/perf/performanceMonitoring', () => ({
  initializePerformanceMonitoring: vi.fn(),
}));
vi.mock('@/utils/perf/chunkLoadingRetry', () => ({ initializeChunkLoadingRetry: vi.fn() }));
vi.mock('@/utils/error/resourceErrorTracking', () => ({
  initializeResourceErrorTracking: vi.fn(),
}));
vi.mock('@/utils/logger', () => ({ logger: { info: vi.fn() } }));

describe('main startup readiness', () => {
  beforeEach(() => {
    vi.resetModules();
    markFatalMounted.mockClear();
    markExceptionMounted.mockClear();
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('marks mounted only after an app-loaded event with a ready root', async () => {
    await import('@/main');

    window.dispatchEvent(new CustomEvent('app-loaded'));
    expect(markFatalMounted).not.toHaveBeenCalled();
    expect(markExceptionMounted).not.toHaveBeenCalled();

    document.getElementById('root')?.setAttribute('data-app-ready', 'true');
    window.dispatchEvent(new CustomEvent('app-loaded'));

    expect(markFatalMounted).toHaveBeenCalledOnce();
    expect(markExceptionMounted).toHaveBeenCalledOnce();

    window.dispatchEvent(new CustomEvent('app-loaded'));
    expect(markFatalMounted).toHaveBeenCalledOnce();
    expect(markExceptionMounted).toHaveBeenCalledOnce();
  });
});
