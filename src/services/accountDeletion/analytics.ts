import posthog from 'posthog-js';

// PostHog 1.438.9 has no public queue-discard API. Keep this adapter covered by
// tests using the installed SDK queues, so SDK upgrades expose contract changes.
type BatchQueue = {
  _queue: unknown[];
  _isPaused: boolean;
  _flushTimeout?: ReturnType<typeof setTimeout>;
};
type RetryQueue = {
  _queue: unknown[];
  _poller?: ReturnType<typeof setTimeout>;
  _isPolling: boolean;
  _onlineListener?: EventListener;
  _offlineListener?: EventListener;
  _enqueue: (...args: unknown[]) => void;
  retriableRequest: (...args: unknown[]) => void;
};
type QueueInternals = {
  _requestQueue?: BatchQueue;
  _retryQueue?: RetryQueue;
  __request_queue?: unknown[];
};
let suspended = false;
let restoreTransport: (() => void) | undefined;
let retiredRetry: RetryQueue | undefined;

export function isDeletionAnalyticsSuspended(): boolean {
  return suspended;
}

export function suspendDeletionAnalytics(): void {
  if (suspended) return;
  suspended = true;
  if (!posthog.config?.token) return;
  posthog.opt_out_capturing();
  posthog.stopSessionRecording();
  const sdk = posthog as unknown as QueueInternals;
  const batch = sdk._requestQueue;
  if (batch) {
    batch._isPaused = true;
    clearTimeout(batch._flushTimeout);
    batch._flushTimeout = undefined;
    batch._queue.length = 0;
  }
  const retry = sdk._retryQueue;
  if (retry) {
    clearTimeout(retry._poller);
    retry._poller = undefined;
    retry._queue.length = 0;
    retry._isPolling = false;
    if (retry._onlineListener) window.removeEventListener('online', retry._onlineListener);
    if (retry._offlineListener) window.removeEventListener('offline', retry._offlineListener);
    // A response already in flight retains this queue in its callback. Retire it
    // permanently so it cannot enqueue deleted-account payloads after resume.
    retry._enqueue = retry.retriableRequest = () => {};
    retiredRetry = retry;
  }
  if (sdk.__request_queue) sdk.__request_queue.length = 0;
  const send = posthog._send_request;
  const sendRetry = posthog._send_retriable_request;
  posthog._send_request = () => {};
  posthog._send_retriable_request = () => {};
  restoreTransport = () => {
    posthog._send_request = send;
    posthog._send_retriable_request = sendRetry;
  };
}

export function resumeDeletionAnalytics(): void {
  if (!suspended) return;
  const sdk = posthog as unknown as QueueInternals;
  if (retiredRetry) {
    sdk._retryQueue = Reflect.construct(retiredRetry.constructor, [posthog]) as RetryQueue;
    retiredRetry = undefined;
  }
  restoreTransport?.();
  restoreTransport = undefined;
  suspended = false;
}
