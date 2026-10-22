import posthog from 'posthog-js';
import type { DeletionIntent } from './types';

type BatchQueue = {
  _queue?: RetryOptions[];
  _isPaused?: boolean;
  _flushTimeout?: ReturnType<typeof setTimeout>;
  enqueue: (options: RetryOptions) => void;
  enable: () => void;
  _flush?: () => void;
  unload: () => void;
};
type RetryQueue = {
  _queue?: Array<{ requestOptions: RetryOptions }>;
  _poller?: ReturnType<typeof setTimeout>;
  _isPolling: boolean;
  _poll?: () => void;
  resume: () => void;
  _onlineListener?: EventListener;
  _offlineListener?: EventListener;
  retriableRequest: (options: RetryOptions, transport?: string) => void;
  _enqueue?: (options: RetryOptions, retryAfterMs?: number) => void;
  _flush?: () => void;
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
let transportCapabilityDisabled = false;
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

function queueArray<T>(queue: object): T[] | undefined {
  try {
    const arrays = Object.values(queue).filter(Array.isArray);
    return arrays.length === 1 ? (arrays[0] as T[]) : undefined;
  } catch {
    return undefined;
  }
}

function hasMethod(value: object, name: string): boolean {
  try {
    return typeof (value as Record<string, unknown>)[name] === 'function';
  } catch {
    return false;
  }
}

function sdkQueues(sdk: AnalyticsSDK): {
  batch?: BatchQueue;
  retry?: RetryQueue;
  batchItems?: RetryOptions[];
  retryItems?: Array<{ requestOptions: RetryOptions }>;
} {
  let objects: object[];
  try {
    objects = Object.values(sdk).filter(value => value !== null && typeof value === 'object');
  } catch {
    return {};
  }
  const batches = objects.filter(
    value => hasMethod(value, 'enqueue') && hasMethod(value, 'enable') && hasMethod(value, 'unload')
  );
  const retries = objects.filter(
    value =>
      hasMethod(value, 'retriableRequest') &&
      hasMethod(value, 'resume') &&
      hasMethod(value, 'unload')
  );
  const batch = batches.length === 1 ? (batches[0] as BatchQueue) : undefined;
  const retry = retries.length === 1 ? (retries[0] as RetryQueue) : undefined;
  return {
    batch,
    retry,
    batchItems: batch && queueArray<RetryOptions>(batch),
    retryItems: retry && queueArray<{ requestOptions: RetryOptions }>(retry),
  };
}

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

function installBatchFence(sdk: AnalyticsSDK, batch: BatchQueue, items: RetryOptions[]): void {
  if (installedBatch.has(batch)) return;
  installedBatch.add(batch);
  items.forEach(stampRequest);
  const enqueue = batch.enqueue;
  const flush = batch._flush;
  const unload = batch.unload;
  batch.enqueue = options => {
    stampRequest(options);
    enqueue.call(batch, options);
  };
  if (flush)
    batch._flush = () => {
      observeCompletedFences(sdk);
      items.forEach(stampRequest);
      flush.call(batch);
    };
  batch.unload = () => {
    observeCompletedFences(sdk);
    items.forEach(stampRequest);
    unload.call(batch);
  };
}

function installRetryFence(
  sdk: AnalyticsSDK,
  retry: RetryQueue,
  items: Array<{ requestOptions: RetryOptions }>
): void {
  if (installedRetry.has(retry)) return;
  installedRetry.add(retry);
  const send = retry.retriableRequest;
  const enqueue = retry._enqueue;
  const flush = retry._flush;
  const unload = retry.unload;
  items.forEach(item => stampRequest(item.requestOptions));
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
  if (enqueue)
    retry._enqueue = (options, retryAfterMs) => {
      if (isStaleRequest(options)) return;
      stampRequest(options);
      enqueue.call(retry, options, retryAfterMs);
    };
  if (flush)
    retry._flush = () => {
      observeCompletedFences(sdk);
      items.forEach(item => stampRequest(item.requestOptions));
      flush.call(retry);
    };
  retry.unload = () => {
    observeCompletedFences(sdk);
    items.forEach(item => stampRequest(item.requestOptions));
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

export function installDeletionAnalyticsFence(
  sdk: AnalyticsSDK = posthog as AnalyticsSDK
): boolean {
  const { batch, retry, batchItems, retryItems } = sdkQueues(sdk);
  if (
    sdk.config?.token &&
    (!batch || !retry || !batchItems || !retryItems || typeof sdk._send_request !== 'function')
  )
    return false;
  if (batch && batchItems) installBatchFence(sdk, batch, batchItems);
  if (retry && retryItems) installRetryFence(sdk, retry, retryItems);
  const previous = installed.get(sdk);
  if (
    previous &&
    sdk._send_request === previous.send &&
    sdk._send_retriable_request === previous.retry
  )
    return true;
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
  if (sendRetry)
    sdk._send_retriable_request = (...args) => {
      if (observeCompletedFences(sdk)) return;
      if (isStaleRequest(args[0])) return;
      if (!suspended && !hasTransportFence()) flush();
      if (guard(args[0], () => sendRetry.apply(sdk, args))) return sendRetry.apply(sdk, args);
    };
  installed.set(sdk, { send: sdk._send_request, retry: sdk._send_retriable_request, flush });
  return true;
}

export function disableDeletionAnalyticsForPage(): void {
  transportCapabilityDisabled = true;
  posthog.opt_out_capturing();
}

export function isDeletionAnalyticsCapabilityDisabled(): boolean {
  return transportCapabilityDisabled;
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
  const { batch, retry } = sdkQueues(posthog as AnalyticsSDK);
  if (batch) {
    if (typeof batch._isPaused === 'boolean') {
      batch._isPaused = true;
      clearTimeout(batch._flushTimeout);
      batch._flushTimeout = undefined;
    }
  }
  if (retry?._poll) {
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
  const { batchItems, retryItems } = sdkQueues(sdk);
  if (batchItems) batchItems.length = 0;
  if (retryItems) retryItems.length = 0;
  if (sdk.__request_queue) sdk.__request_queue.length = 0;
  heldRequests.get(sdk)?.splice(0);
}

export function resumeDeletionAnalytics(): void {
  if (!suspended) return;
  restoreRetryPoll?.();
  restoreRetryPoll = undefined;
  const { retry, retryItems } = sdkQueues(posthog as AnalyticsSDK);
  suspended = false;
  retry?.resume();
  if (retry?._poll && retryItems?.length && !retry._isPolling) {
    retry._isPolling = true;
    retry._poll();
  }
  flushers.forEach(flush => flush());
}
