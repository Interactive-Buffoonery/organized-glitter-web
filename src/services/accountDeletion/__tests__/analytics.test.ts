import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  armDeletionTransportFence,
  installDeletionAnalyticsFence,
  isDeletionAnalyticsSuspended,
  releaseDeletionTransportFence,
  resumeDeletionAnalytics,
  retainedDeletionAnalyticsCount,
  suspendDeletionAnalytics,
} from '../analytics';

const require = createRequire(import.meta.url);
// Exercise the queues from the lockfile's SDK, rather than a lookalike mock.
const { RequestQueue } = require('posthog-js/lib/src/request-queue.js');
const { RetryQueue } = require('posthog-js/lib/src/retry-queue.js');
const requestModule = require('posthog-js/lib/src/request.js');
const mocked = vi.hoisted(() => ({
  sdk: {} as Record<string, unknown>,
  wire: vi.fn(),
  retryWire: vi.fn(),
}));
vi.mock('posthog-js', () => ({ default: mocked.sdk }));

describe('deletion analytics transport fence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    const sdk = mocked.sdk;
    mocked.wire.mockClear();
    mocked.retryWire.mockClear();
    Object.assign(sdk, {
      config: { token: 'test-token' },
      opt_out_capturing: vi.fn(),
      stopSessionRecording: vi.fn(),
      reset: vi.fn(),
      _send_request: mocked.wire,
      _send_retriable_request: mocked.retryWire,
      __request_queue: [],
    });
    sdk._requestQueue = new RequestQueue(vi.fn());
    sdk._retryQueue = new RetryQueue(sdk);
    installDeletionAnalyticsFence();
  });
  afterEach(() => {
    resumeDeletionAnalytics();
    vi.restoreAllMocks();
    localStorage.clear();
    vi.useRealTimers();
  });

  function allowSdkDispatch() {
    Object.assign(mocked.sdk, {
      __loaded: true,
      config: { token: 'test-token', request_headers: {}, api_transport: 'XHR' },
      rateLimiter: { isServerRateLimited: () => false, checkForLimiting: vi.fn() },
    });
    return vi.spyOn(requestModule, 'request').mockImplementation(() => {});
  }

  function completeInAnotherTab() {
    localStorage.setItem(
      `og:account-deletion:analytics-complete:v1:other-tab-${crypto.randomUUID()}`,
      'completed'
    );
  }

  it('drops every due installed-SDK retry extracted before cross-tab completion', () => {
    const wire = allowSdkDispatch();
    const retry = mocked.sdk._retryQueue as InstanceType<typeof RetryQueue>;
    for (const fixture of [1, 2]) {
      retry._queue.push({
        retryAt: Date.now() - 1,
        requestOptions: { url: '/e/', data: { distinct_id: 'deleted-account', fixture } },
      });
    }
    const guarded = retry.retriableRequest;
    let first = true;
    retry.retriableRequest = (options, transport) => {
      if (first) {
        first = false;
        completeInAnotherTab();
      }
      guarded.call(retry, options, transport);
    };
    retry._flush();
    expect(wire).not.toHaveBeenCalled();
    expect(retry._queue).toHaveLength(0);
    retry.retriableRequest({ url: '/e/', data: { distinct_id: 'fresh-account' } });
    expect(wire).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ data: { distinct_id: 'fresh-account' } }),
      expect.any(Function)
    );
  });

  it('preserves both queued SDK retries across a proven safe cancellation', async () => {
    const wire = allowSdkDispatch();
    const retry = mocked.sdk._retryQueue as InstanceType<typeof RetryQueue>;
    for (const fixture of [1, 2]) {
      retry._queue.push({
        retryAt: Date.now() - 1,
        requestOptions: { url: '/e/', data: { fixture } },
      });
    }
    const fenceId = armDeletionTransportFence('http://localhost:8090', 'account-a');
    suspendDeletionAnalytics();
    expect(retry._queue).toHaveLength(2);
    releaseDeletionTransportFence('http://localhost:8090', 'account-a', fenceId);
    resumeDeletionAnalytics();
    await vi.advanceTimersByTimeAsync(3_100);
    expect(wire).toHaveBeenCalledTimes(2);
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
    suspendDeletionAnalytics();
    releaseDeletionTransportFence('http://localhost:8090', 'account-a', fenceId);
    resumeDeletionAnalytics();
    expect(wire).toHaveBeenCalledOnce();
    expect(wire).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ distinct_id: 'account-a' })] })
    );
    secondTab._send_retriable_request({ url: '/e/', data: { distinct_id: 'new-anonymous-id' } });
    expect(wire).toHaveBeenCalledTimes(2);
    expect(retainedDeletionAnalyticsCount(secondTab)).toBe(0);
  });

  it('keeps a newer tab fenced when an older attempt is cancelled', () => {
    suspendDeletionAnalytics();
    const first = armDeletionTransportFence('http://localhost:8090', 'account-a');
    const second = armDeletionTransportFence('http://localhost:8090', 'account-a');
    releaseDeletionTransportFence('http://localhost:8090', 'account-a', first);
    const wire = mocked.sdk._send_request as (...args: unknown[]) => void;
    wire({ url: '/e/', data: { distinct_id: 'account-a' } });
    expect(retainedDeletionAnalyticsCount()).toBe(1);
    releaseDeletionTransportFence('http://localhost:8090', 'account-a', second);
    resumeDeletionAnalytics();
    expect(retainedDeletionAnalyticsCount()).toBe(0);
  });
});
