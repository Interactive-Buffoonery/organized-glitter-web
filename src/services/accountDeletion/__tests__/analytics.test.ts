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
  armDeletionTransportFence,
  releaseDeletionTransportFence,
  installDeletionAnalyticsFence,
  discardDeletionAnalyticsQueues,
  retainedDeletionAnalyticsCount,
} from '../analytics';

describe('deletion analytics transport fence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
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
    installDeletionAnalyticsFence();
  });
  afterEach(() => {
    resumeDeletionAnalytics();
    localStorage.clear();
    vi.useRealTimers();
  });

  it('retains actual pending batch/retry queues while uncertain and prevents unload from flushing', () => {
    const queue = mocked.sdk._requestQueue as InstanceType<typeof RequestQueue>;
    const retry = mocked.sdk._retryQueue as InstanceType<typeof RetryQueue>;
    queue._sendRequest = (req, transport) =>
      (mocked.sdk._send_retriable_request as (...args: unknown[]) => void)(req, transport);
    queue.enqueue({ url: '/e/', data: { distinct_id: 'deleted-account' } });
    retry._enqueue({ url: '/e/', data: { distinct_id: 'deleted-account' } });
    suspendDeletionAnalytics();
    expect(queue._queue).toHaveLength(1);
    expect(retry._queue).toHaveLength(1);
    expect(queue._isPaused).toBe(true);
    expect(retry._isPolling).toBe(false);
    expect(mocked.sdk.opt_out_capturing).toHaveBeenCalled();
    expect(isDeletionAnalyticsSuspended()).toBe(true);
    queue.unload();
    expect(retainedDeletionAnalyticsCount()).toBe(1);
  });

  it('retains a late retry from an already-dispatched request until confirmed cleanup', () => {
    const retry = mocked.sdk._retryQueue as InstanceType<typeof RetryQueue>;
    suspendDeletionAnalytics();
    retry._enqueue({ url: '/e/', data: { distinct_id: 'deleted-account' } });
    expect(retry._queue).toHaveLength(1);
    discardDeletionAnalyticsQueues();
    expect(retry._queue).toEqual([]);
  });

  it('fences a second tab at the transport when intent admission begins', async () => {
    const secondTab = {
      _send_request: vi.fn(),
      _send_retriable_request: vi.fn(),
    };
    const wire = secondTab._send_retriable_request;
    installDeletionAnalyticsFence(secondTab as never);
    const secondQueue = new RequestQueue(req => secondTab._send_retriable_request(req));
    secondQueue.enable();
    secondQueue.enqueue({ url: '/e/', data: { distinct_id: 'account-a' } });
    const fenceId = armDeletionTransportFence('http://localhost:8090', 'account-a');
    await vi.advanceTimersByTimeAsync(3500);
    expect(wire).not.toHaveBeenCalled();
    expect(retainedDeletionAnalyticsCount(secondTab)).toBe(1);
    secondQueue.unload();
    expect(wire).not.toHaveBeenCalled();
    expect(retainedDeletionAnalyticsCount(secondTab)).toBe(1);
    releaseDeletionTransportFence('http://localhost:8090', 'account-a', fenceId);
    secondTab._send_retriable_request({ url: '/e/', data: { distinct_id: 'new-anonymous-id' } });
    expect(wire).toHaveBeenCalledOnce();
    expect(retainedDeletionAnalyticsCount(secondTab)).toBe(0);
  });

  it('discards old queues only after confirmation and permits fresh SDK requests on resume', () => {
    const retry = mocked.sdk._retryQueue as InstanceType<typeof RetryQueue>;
    const transport = mocked.sdk._send_request;
    const stale = { url: '/e/', data: { distinct_id: 'deleted-account' } };
    retry._enqueue(stale);
    suspendDeletionAnalytics();
    expect(mocked.sdk._send_request).toBe(transport);
    discardDeletionAnalyticsQueues();
    expect(retry._queue).toEqual([]);
    resumeDeletionAnalytics();
    expect(mocked.sdk._send_request).toBe(transport);
    const fenceId = armDeletionTransportFence('http://localhost:8090', 'account-a');
    releaseDeletionTransportFence('http://localhost:8090', 'account-a', fenceId);
    retry._enqueue({ url: '/e/', data: { distinct_id: 'new-anonymous-id' } });
    expect(retry._queue).toHaveLength(1);
  });

  it('keeps a newer tab fenced when an older attempt is cancelled', () => {
    const first = armDeletionTransportFence('http://localhost:8090', 'account-a');
    const second = armDeletionTransportFence('http://localhost:8090', 'account-a');
    releaseDeletionTransportFence('http://localhost:8090', 'account-a', first);
    const wire = mocked.sdk._send_request as (...args: unknown[]) => void;
    wire({ url: '/e/', data: { distinct_id: 'account-a' } });
    expect(retainedDeletionAnalyticsCount()).toBe(1);
    releaseDeletionTransportFence('http://localhost:8090', 'account-a', second);
    wire({ url: '/e/', data: { distinct_id: 'account-a' } });
    expect(retainedDeletionAnalyticsCount()).toBe(0);
  });
});
