import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
// Exercise the queues from the lockfile's SDK, rather than a lookalike mock.
const { RequestQueue } = require('posthog-js/lib/src/request-queue.js');
const { RetryQueue } = require('posthog-js/lib/src/retry-queue.js');
const mocked = vi.hoisted(() => ({ sdk: {} as Record<string, unknown> }));
vi.mock('posthog-js', () => ({ default: mocked.sdk }));
import {
  suspendDeletionAnalytics,
  resumeDeletionAnalytics,
  isDeletionAnalyticsSuspended,
} from '../analytics';

describe('deletion analytics transport fence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const sdk = mocked.sdk;
    Object.assign(sdk, {
      config: { token: 'test-token' },
      opt_out_capturing: vi.fn(),
      stopSessionRecording: vi.fn(),
      reset: vi.fn(),
      _send_request: vi.fn(),
      _send_retriable_request: vi.fn(),
      __request_queue: [],
    });
    sdk._requestQueue = new RequestQueue(vi.fn());
    sdk._retryQueue = new RetryQueue(sdk);
  });
  afterEach(() => {
    resumeDeletionAnalytics();
    vi.useRealTimers();
  });

  it('discards actual pending batch/retry queues and prevents unload from flushing them', () => {
    const queue = mocked.sdk._requestQueue as InstanceType<typeof RequestQueue>;
    const retry = mocked.sdk._retryQueue as InstanceType<typeof RetryQueue>;
    queue.enqueue({ url: '/e/', data: { distinct_id: 'deleted-account' } });
    retry._enqueue({ url: '/e/', data: { distinct_id: 'deleted-account' } });
    suspendDeletionAnalytics();
    expect(queue._queue).toEqual([]);
    expect(retry._queue).toEqual([]);
    expect(queue._isPaused).toBe(true);
    expect(retry._isPolling).toBe(false);
    expect(mocked.sdk.opt_out_capturing).toHaveBeenCalled();
    expect(isDeletionAnalyticsSuspended()).toBe(true);
    queue.unload();
    expect(queue._sendRequest).not.toHaveBeenCalled();
  });

  it('drops late retry enqueue from an already-dispatched request even after anonymous resume', () => {
    const retry = mocked.sdk._retryQueue as InstanceType<typeof RetryQueue>;
    suspendDeletionAnalytics();
    resumeDeletionAnalytics();
    retry._enqueue({ url: '/e/', data: { distinct_id: 'deleted-account' } });
    expect(retry._queue).toEqual([]);
  });

  it('permits a fresh SDK request after resume while rejecting request objects from before deletion', () => {
    const retry = mocked.sdk._retryQueue as InstanceType<typeof RetryQueue>;
    const transport = mocked.sdk._send_request;
    const stale = { url: '/e/', data: { distinct_id: 'deleted-account' } };
    retry._enqueue(stale);
    suspendDeletionAnalytics();
    expect(mocked.sdk._send_request).not.toBe(transport);
    resumeDeletionAnalytics();
    expect(mocked.sdk._send_request).toBe(transport);
    const freshRetry = mocked.sdk._retryQueue as InstanceType<typeof RetryQueue>;
    expect(freshRetry).not.toBe(retry);
    freshRetry._enqueue({ url: '/e/', data: { distinct_id: 'new-anonymous-id' } });
    expect(freshRetry._queue).toHaveLength(1);
    retry._enqueue(stale);
    expect(retry._queue).toEqual([]);
  });
});
