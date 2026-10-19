import posthog from 'posthog-js';
import type { DeletionIntent } from './types';

type BatchQueue = {
  _queue: RetryOptions[];
  _isPaused: boolean;
  _flushTimeout?: ReturnType<typeof setTimeout>;
  enqueue: (options: RetryOptions) => void;
  _flush: () => void;
  unload: () => void;
};
type RetryQueue = {
  _queue: Array<{ requestOptions: RetryOptions }>;
  _poller?: ReturnType<typeof setTimeout>;
  _isPolling: boolean;
  _poll: () => void;
  resume: () => void;
  _onlineListener?: EventListener;
  _offlineListener?: EventListener;
  retriableRequest: (options: RetryOptions, transport?: string) => void;
  _enqueue: (options: RetryOptions, retryAfterMs?: number) => void;
  _flush: () => void;
  unload: () => void;
};
type RetryOptions = Record<PropertyKey, unknown>;
type AnalyticsSDK = Omit<typeof posthog, '_requestQueue' | '_retryQueue'> & {
  _requestQueue?: BatchQueue;
  _retryQueue?: RetryQueue;
  __request_queue?: unknown[];
};

const FENCE_PREFIX = 'og:account-deletion:analytics-fence:v1:';
const COMPLETED_PREFIX = 'og:account-deletion:analytics-complete:v1:';
const RETRY_GENERATION = Symbol('deletion-retry-generation');
let suspended = false;
let retryGeneration = 0;
const seenCompleted = new WeakMap<object, Set<string>>();
const installedBatch = new WeakSet<object>();
const installedRetry = new WeakSet<object>();
const installed = new WeakMap<
  object,
  {
    send: AnalyticsSDK['_send_request'];
    retry: AnalyticsSDK['_send_retriable_request'];
    flush: () => void;
  }
>();
const heldRequests = new WeakMap<object, Array<() => void>>();
const flushers = new Set<() => void>();
let restoreRetryPoll: (() => void) | undefined;

function completedSeenBy(sdk: object): Set<string> {
  let seen = seenCompleted.get(sdk);
  if (!seen) {
    seen = new Set();
    seenCompleted.set(sdk, seen);
  }
  return seen;
}

function observeCompletedFences(sdk: AnalyticsSDK): boolean {
  let observed = false;
  const seen = completedSeenBy(sdk);
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(COMPLETED_PREFIX) || seen.has(key)) continue;
      seen.add(key);
      discardDeletionAnalyticsQueues(sdk);
      observed = true;
    }
  } catch {
    // The transport remains fenced when storage cannot be read.
  }
  return observed;
}

function stampRequest(options: unknown): void {
  if (!options || typeof options !== 'object') return;
  const request = options as RetryOptions;
  if (typeof request[RETRY_GENERATION] !== 'number') request[RETRY_GENERATION] = retryGeneration;
}

function isStaleRequest(options: unknown): boolean {
  if (!options || typeof options !== 'object') return false;
  const generation = (options as RetryOptions)[RETRY_GENERATION];
  return typeof generation === 'number' && generation !== retryGeneration;
}

function installBatchFence(sdk: AnalyticsSDK): void {
  const batch = sdk._requestQueue;
  if (!batch || installedBatch.has(batch)) return;
  installedBatch.add(batch);
  batch._queue.forEach(stampRequest);
  const enqueue = batch.enqueue;
  const flush = batch._flush;
  const unload = batch.unload;
  batch.enqueue = options => {
    stampRequest(options);
    enqueue.call(batch, options);
  };
  batch._flush = () => {
    observeCompletedFences(sdk);
    batch._queue.forEach(stampRequest);
    flush.call(batch);
  };
  batch.unload = () => {
    observeCompletedFences(sdk);
    batch._queue.forEach(stampRequest);
    unload.call(batch);
  };
}

function installRetryFence(sdk: AnalyticsSDK): void {
  const retry = sdk._retryQueue;
  if (!retry || installedRetry.has(retry)) return;
  installedRetry.add(retry);
  const send = retry.retriableRequest;
  const enqueue = retry._enqueue;
  const flush = retry._flush;
  const unload = retry.unload;
  retry._queue.forEach(item => stampRequest(item.requestOptions));
  retry.retriableRequest = (options, transport) => {
    if (observeCompletedFences(sdk)) return;
    if (isStaleRequest(options)) return;
    stampRequest(options);
    if (!suspended && !hasTransportFence()) flushers.forEach(flush => flush());
    if (isStaleRequest(options)) return;
    if (suspended || hasTransportFence()) {
      const held = heldRequests.get(sdk);
      const deliver = () => {
        if (observeCompletedFences(sdk) || isStaleRequest(options)) return;
        if (suspended || hasTransportFence()) {
          held?.unshift(deliver);
          return;
        }
        send.call(retry, options, transport);
      };
      held?.push(deliver);
      return;
    }
    send.call(retry, options, transport);
  };
  retry._enqueue = (options, retryAfterMs) => {
    if (isStaleRequest(options)) return;
    stampRequest(options);
    enqueue.call(retry, options, retryAfterMs);
  };
  retry._flush = () => {
    observeCompletedFences(sdk);
    retry._queue.forEach(item => stampRequest(item.requestOptions));
    flush.call(retry);
  };
  retry.unload = () => {
    observeCompletedFences(sdk);
    retry._queue.forEach(item => stampRequest(item.requestOptions));
    unload.call(retry);
  };
}

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
    String(Date.now())
  );
  return id;
}

export function inspectUnownedDeletionTransportFence(
  backendUrl: string,
  intents: DeletionIntent[]
): { checking: boolean; orphan: boolean; waitMs: number } {
  const prefix = `${FENCE_PREFIX}${encodeURIComponent(backendUrl)}:`;
  let waitMs = 0;
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const suffix = key.slice(prefix.length);
      const separator = suffix.lastIndexOf(':');
      if (separator < 1) return { checking: false, orphan: true, waitMs: 0 };
      const accountId = suffix.slice(0, separator);
      const fenceId = suffix.slice(separator + 1);
      if (
        intents.some(
          intent => intent.accountId === accountId && intent.transportFenceId === fenceId
        )
      )
        continue;
      const createdAt = Number(localStorage.getItem(key));
      const age = Date.now() - createdAt;
      if (!Number.isFinite(age) || age < 0 || age >= 5000)
        return { checking: false, orphan: true, waitMs: 0 };
      waitMs = Math.max(waitMs, 5000 - age);
    }
  } catch {
    return { checking: false, orphan: true, waitMs: 0 };
  }
  return { checking: waitMs > 0, orphan: false, waitMs };
}

export function releaseDeletionTransportFence(
  backendUrl: string,
  accountId: string,
  expectedId?: string
): void {
  const key = `${FENCE_PREFIX}${encodeURIComponent(backendUrl)}:${accountId}`;
  localStorage.removeItem(expectedId ? `${key}:${expectedId}` : key);
}

export function recordCompletedDeletionTransportFence(
  _backendUrl: string,
  _accountId: string,
  fenceId?: string
): boolean {
  if (!fenceId) return false;
  const key = `${COMPLETED_PREFIX}${fenceId}`;
  localStorage.setItem(key, 'completed');
  const seen = completedSeenBy(posthog);
  const fresh = !seen.has(key);
  seen.add(key);
  return fresh;
}

export function installDeletionAnalyticsFence(sdk: AnalyticsSDK = posthog as AnalyticsSDK): void {
  installBatchFence(sdk);
  installRetryFence(sdk);
  const previous = installed.get(sdk);
  if (
    previous &&
    sdk._send_request === previous.send &&
    sdk._send_retriable_request === previous.retry
  )
    return;
  const send = sdk._send_request;
  const sendRetry = sdk._send_retriable_request;
  if (previous) flushers.delete(previous.flush);
  const held: Array<() => void> = [];
  heldRequests.set(sdk, held);
  const flush = () => {
    while (held.length && !suspended && !hasTransportFence()) {
      if (observeCompletedFences(sdk)) return;
      held.shift()?.();
    }
  };
  flushers.add(flush);
  const guard = (options: unknown, transmit: () => void) => {
    if (isStaleRequest(options)) return false;
    stampRequest(options);
    if (suspended || hasTransportFence()) {
      const deliver = () => {
        if (observeCompletedFences(sdk) || isStaleRequest(options)) return;
        if (suspended || hasTransportFence()) {
          held.unshift(deliver);
          return;
        }
        transmit();
      };
      held.push(deliver);
      return false;
    }
    return true;
  };
  sdk._send_request = (...args) => {
    if (observeCompletedFences(sdk)) return;
    if (isStaleRequest(args[0])) return;
    if (!suspended && !hasTransportFence()) flush();
    if (guard(args[0], () => send.apply(sdk, args))) return send.apply(sdk, args);
  };
  sdk._send_retriable_request = (...args) => {
    if (observeCompletedFences(sdk)) return;
    if (isStaleRequest(args[0])) return;
    if (!suspended && !hasTransportFence()) flush();
    if (guard(args[0], () => sendRetry.apply(sdk, args))) return sendRetry.apply(sdk, args);
  };
  installed.set(sdk, { send: sdk._send_request, retry: sdk._send_retriable_request, flush });
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
    retry._onlineListener = undefined;
    retry._offlineListener = undefined;
    const poll = retry._poll;
    retry._poll = () => {};
    restoreRetryPoll = () => {
      retry._poll = poll;
    };
  }
}

export function discardDeletionAnalyticsQueues(sdk: AnalyticsSDK = posthog as AnalyticsSDK): void {
  retryGeneration += 1;
  if (sdk._requestQueue) sdk._requestQueue._queue.length = 0;
  if (sdk._retryQueue) sdk._retryQueue._queue.length = 0;
  if (sdk.__request_queue) sdk.__request_queue.length = 0;
  heldRequests.get(sdk)?.splice(0);
}

export function resumeDeletionAnalytics(): void {
  if (!suspended) return;
  restoreRetryPoll?.();
  restoreRetryPoll = undefined;
  const retry = (posthog as AnalyticsSDK)._retryQueue;
  retry?.resume();
  suspended = false;
  if (retry?._queue.length && !retry._isPolling) {
    retry._isPolling = true;
    retry._poll();
  }
  flushers.forEach(flush => flush());
}
