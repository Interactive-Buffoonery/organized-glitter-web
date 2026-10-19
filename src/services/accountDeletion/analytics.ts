import posthog from 'posthog-js';

type BatchQueue = {
  _queue: unknown[];
  _isPaused: boolean;
  _flushTimeout?: ReturnType<typeof setTimeout>;
};
type RetryQueue = {
  _queue: unknown[];
  _poller?: ReturnType<typeof setTimeout>;
  _isPolling: boolean;
  _poll: () => void;
  resume: () => void;
  _onlineListener?: EventListener;
  _offlineListener?: EventListener;
};
type AnalyticsSDK = Omit<typeof posthog, '_requestQueue' | '_retryQueue'> & {
  _requestQueue?: BatchQueue;
  _retryQueue?: RetryQueue;
  __request_queue?: unknown[];
};

const FENCE_PREFIX = 'og:account-deletion:analytics-fence:v1:';
let suspended = false;
const installed = new WeakMap<
  object,
  { send: AnalyticsSDK['_send_request']; retry: AnalyticsSDK['_send_retriable_request'] }
>();
const heldRequests = new WeakMap<object, unknown[][]>();
let restoreRetryPoll: (() => void) | undefined;

function hasTransportFence(): boolean {
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      if (localStorage.key(index)?.startsWith(FENCE_PREFIX)) return true;
    }
    return false;
  } catch {
    return true;
  }
}

export function armDeletionTransportFence(backendUrl: string, accountId: string): string {
  const id = crypto.randomUUID();
  localStorage.setItem(
    `${FENCE_PREFIX}${encodeURIComponent(backendUrl)}:${accountId}:${id}`,
    'pending'
  );
  return id;
}

export function releaseDeletionTransportFence(
  backendUrl: string,
  accountId: string,
  expectedId?: string
): void {
  const key = `${FENCE_PREFIX}${encodeURIComponent(backendUrl)}:${accountId}`;
  localStorage.removeItem(expectedId ? `${key}:${expectedId}` : key);
}

export function installDeletionAnalyticsFence(sdk: AnalyticsSDK = posthog as AnalyticsSDK): void {
  const previous = installed.get(sdk);
  if (
    previous &&
    sdk._send_request === previous.send &&
    sdk._send_retriable_request === previous.retry
  )
    return;
  const send = sdk._send_request;
  const sendRetry = sdk._send_retriable_request;
  const held: unknown[][] = [];
  heldRequests.set(sdk, held);
  const guard = (args: unknown[]) => {
    if (suspended || hasTransportFence()) {
      held.push(args);
      return false;
    }
    held.length = 0;
    return true;
  };
  sdk._send_request = (...args) => {
    if (guard(args)) return send.apply(sdk, args);
  };
  sdk._send_retriable_request = (...args) => {
    if (guard(args)) return sendRetry.apply(sdk, args);
  };
  installed.set(sdk, { send: sdk._send_request, retry: sdk._send_retriable_request });
  window.addEventListener('storage', event => {
    if (event.key?.startsWith(FENCE_PREFIX) && !hasTransportFence()) held.length = 0;
  });
}

export function retainedDeletionAnalyticsCount(sdk: object = posthog): number {
  return heldRequests.get(sdk)?.length ?? 0;
}

export function isDeletionAnalyticsSuspended(): boolean {
  return suspended;
}

export function suspendDeletionAnalytics(): void {
  if (suspended) return;
  suspended = true;
  installDeletionAnalyticsFence();
  if (!posthog.config?.token) return;
  posthog.opt_out_capturing();
  posthog.stopSessionRecording();
  const sdk = posthog as AnalyticsSDK;
  const batch = sdk._requestQueue;
  if (batch) {
    batch._isPaused = true;
    clearTimeout(batch._flushTimeout);
    batch._flushTimeout = undefined;
  }
  const retry = sdk._retryQueue;
  if (retry) {
    clearTimeout(retry._poller);
    retry._poller = undefined;
    retry._isPolling = false;
    if (retry._onlineListener) window.removeEventListener('online', retry._onlineListener);
    if (retry._offlineListener) window.removeEventListener('offline', retry._offlineListener);
    const poll = retry._poll;
    retry._poll = () => {};
    restoreRetryPoll = () => {
      retry._poll = poll;
    };
  }
}

export function discardDeletionAnalyticsQueues(): void {
  const sdk = posthog as AnalyticsSDK;
  if (sdk._requestQueue) sdk._requestQueue._queue.length = 0;
  if (sdk._retryQueue) sdk._retryQueue._queue.length = 0;
  if (sdk.__request_queue) sdk.__request_queue.length = 0;
  heldRequests.get(sdk)?.splice(0);
}

export function resumeDeletionAnalytics(): void {
  if (!suspended) return;
  restoreRetryPoll?.();
  restoreRetryPoll = undefined;
  (posthog as AnalyticsSDK)._retryQueue?.resume();
  suspended = false;
}
