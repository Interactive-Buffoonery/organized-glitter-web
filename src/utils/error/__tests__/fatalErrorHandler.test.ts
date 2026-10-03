import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock the escape hatch so we can assert capture without touching posthog.
const mockCaptureException = vi.fn();
vi.mock('@/services/analytics-escape-hatch', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

/**
 * The handler module keeps a module-level `appHasMounted` flag, so each test
 * imports a FRESH copy via vi.resetModules() to control the pre/post-mount
 * state in isolation.
 *
 * `window.addEventListener` is spied so the handlers are captured (not attached
 * to the real window). This avoids listener accumulation across tests, where
 * stale listeners from prior module instances would fire with their own
 * `appHasMounted` state and corrupt the DOM assertions.
 */
let errorHandler: EventListener | undefined;
let rejectionHandler: EventListener | undefined;

async function freshHandler() {
  vi.resetModules();
  errorHandler = undefined;
  rejectionHandler = undefined;
  vi.spyOn(window, 'addEventListener').mockImplementation((type, handler) => {
    if (type === 'error') errorHandler = handler as EventListener;
    if (type === 'unhandledrejection') rejectionHandler = handler as EventListener;
  });
  return import('@/utils/error/fatalErrorHandler');
}

const fireError = (error: unknown, message = 'boom') => {
  const event = new Event('error') as ErrorEvent;
  Object.defineProperty(event, 'error', { value: error, configurable: true });
  Object.defineProperty(event, 'message', { value: message, configurable: true });
  errorHandler!(event);
};

const fireRejection = (reason: unknown) => {
  const event = new Event('unhandledrejection') as PromiseRejectionEvent;
  Object.defineProperty(event, 'reason', { value: reason, configurable: true });
  rejectionHandler!(event);
};

const fatalUiShown = () => {
  const root = document.getElementById('root');
  return !!root && (root.textContent?.includes('Unable to Load Application') ?? false);
};

describe('fatalErrorHandler global handlers', () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
    document.body.innerHTML = '<div id="root"></div>';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('captures an uncaught error exactly once', async () => {
    const { setupGlobalErrorHandlers } = await freshHandler();
    setupGlobalErrorHandlers();

    fireError(new Error('kaboom'));

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [errorArg, propsArg] = mockCaptureException.mock.calls[0];
    expect(errorArg).toBeInstanceOf(Error);
    expect(propsArg).toMatchObject({ $exception_source: 'fatal_global_handler' });
  });

  it('shows the fatal UI for a genuine pre-mount error', async () => {
    const { setupGlobalErrorHandlers } = await freshHandler();
    setupGlobalErrorHandlers();

    fireError(new Error('startup failure'));

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(fatalUiShown()).toBe(true);
  });

  it('does NOT show the fatal UI for a post-mount error (still captures)', async () => {
    const { setupGlobalErrorHandlers, markAppMounted } = await freshHandler();
    setupGlobalErrorHandlers();
    markAppMounted();

    fireError(new Error('late uncaught error'));

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(fatalUiShown()).toBe(false);
  });

  it('does NOT show the fatal UI for classified external noise, even pre-mount', async () => {
    const { setupGlobalErrorHandlers } = await freshHandler();
    setupGlobalErrorHandlers();

    fireError(new Error('runtime.sendMessage(). Tab not found'));

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(fatalUiShown()).toBe(false);
  });

  it('does NOT show the fatal UI for a masked cross-origin error (no event.error)', async () => {
    const { setupGlobalErrorHandlers } = await freshHandler();
    setupGlobalErrorHandlers();

    // Simulate window.onerror with a masked cross-origin error: no event.error.
    fireError(null, 'Script error.');

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(fatalUiShown()).toBe(false);
  });

  it('normalizes a non-Error rejection into a real Error with a sanitized summary', async () => {
    const { setupGlobalErrorHandlers } = await freshHandler();
    setupGlobalErrorHandlers();

    fireRejection({ status: 500, message: 'gateway down' });

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [errorArg, propsArg] = mockCaptureException.mock.calls[0];
    expect(errorArg).toBeInstanceOf(Error);
    expect(propsArg).toMatchObject({
      $exception_source: 'fatal_global_handler',
      rejection_reason_type: 'object',
    });
    expect(propsArg.rejection_keys).toEqual(expect.arrayContaining(['status', 'message']));
  });

  it('uses an Error rejection directly', async () => {
    const { setupGlobalErrorHandlers } = await freshHandler();
    setupGlobalErrorHandlers();

    const err = new Error('promise blew up');
    fireRejection(err);

    const [errorArg] = mockCaptureException.mock.calls[0];
    expect(errorArg).toBe(err);
  });
});

describe('handleFatalError ready marker', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('sets data-app-ready before dispatching app-loaded', async () => {
    const { handleFatalError } = await freshHandler();
    let markerAtDispatch: string | null | undefined;
    const originalDispatch = window.dispatchEvent.bind(window);
    vi.spyOn(window, 'dispatchEvent').mockImplementation(event => {
      if (event instanceof CustomEvent && event.type === 'app-loaded') {
        markerAtDispatch = document.getElementById('root')?.getAttribute('data-app-ready');
      }
      return originalDispatch(event);
    });

    handleFatalError(new Error('boot failed'), 'React Render');

    expect(markerAtDispatch).toBe('true');
    expect(document.getElementById('root')?.getAttribute('data-app-ready')).toBe('true');
    expect(fatalUiShown()).toBe(true);
  });
});
