import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
import {
  suspendDeletionAnalytics,
  resumeDeletionAnalytics,
  isDeletionAnalyticsSuspended,
  armDeletionTransportFence,
  releaseDeletionTransportFence,
  recordCompletedDeletionTransportFence,
  installDeletionAnalyticsFence,
  inspectUnownedDeletionTransportFence,
  discardDeletionAnalyticsQueues,
  retainedDeletionAnalyticsCount,
} from '../analytics';

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

  it.each(['flush', 'unload'])(
    'drops every installed-SDK batch group extracted before cross-tab completion on %s',
    operation => {
      const queue = mocked.sdk._requestQueue as InstanceType<typeof RequestQueue>;
      let first = true;
      queue._sendRequest = (req, transport) => {
        if (first) {
          first = false;
          completeInAnotherTab();
        }
        mocked.sdk._send_retriable_request(req, transport);
      };
      for (const fixture of [1, 2]) {
        queue.enqueue({
          url: '/e/',
          batchGroup: `group-${fixture}`,
          data: { distinct_id: 'deleted-account', fixture },
        });
      }
      if (operation === 'flush') queue._flush();
      else queue.unload();
      expect(mocked.retryWire).not.toHaveBeenCalled();
      expect(queue._queue).toHaveLength(0);
      queue.enqueue({ url: '/e/', batchGroup: 'fresh', data: { distinct_id: 'fresh-account' } });
      queue._flush();
      expect(mocked.retryWire).toHaveBeenCalledOnce();
      expect(mocked.retryWire).toHaveBeenCalledWith(
        expect.objectContaining({ data: [{ distinct_id: 'fresh-account' }] }),
        undefined
      );
    }
  );

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

  it('preserves two installed-SDK batch groups across a proven safe cancellation', () => {
    const queue = mocked.sdk._requestQueue as InstanceType<typeof RequestQueue>;
    queue._sendRequest = (req, transport) => mocked.sdk._send_retriable_request(req, transport);
    queue.enqueue({ url: '/e/', batchGroup: 'one', data: { fixture: 1 } });
    queue.enqueue({ url: '/e/', batchGroup: 'two', data: { fixture: 2 } });
    const fenceId = armDeletionTransportFence('http://localhost:8090', 'account-a');
    queue._flush();
    expect(mocked.retryWire).not.toHaveBeenCalled();
    expect(retainedDeletionAnalyticsCount()).toBe(2);
    releaseDeletionTransportFence('http://localhost:8090', 'account-a', fenceId);
    mocked.sdk._send_retriable_request({ url: '/e/', data: { fixture: 3 } });
    expect(mocked.retryWire.mock.calls.map(call => call[0].data)).toEqual([
      [{ fixture: 1 }],
      [{ fixture: 2 }],
      { fixture: 3 },
    ]);
  });

  it('does not drain held batch requests when another tab completed before resume', () => {
    const fenceId = armDeletionTransportFence('http://localhost:8090', 'account-a');
    mocked.sdk._send_retriable_request({ url: '/e/', data: 'old-1' });
    mocked.sdk._send_retriable_request({ url: '/e/', data: 'old-2' });
    suspendDeletionAnalytics();
    releaseDeletionTransportFence('http://localhost:8090', 'account-a', fenceId);
    completeInAnotherTab();
    resumeDeletionAnalytics();
    expect(mocked.retryWire).not.toHaveBeenCalled();
    expect(retainedDeletionAnalyticsCount()).toBe(0);
    mocked.sdk._send_retriable_request({ url: '/e/', data: 'fresh' });
    expect(mocked.retryWire).toHaveBeenCalledOnce();
  });

  it('keeps a pre-intent marker and exposes bounded recovery if no intent appears', async () => {
    const id = armDeletionTransportFence('http://localhost:8090', 'account-a');
    expect(inspectUnownedDeletionTransportFence('http://localhost:8090', [])).toMatchObject({
      checking: true,
      orphan: false,
    });
    await vi.advanceTimersByTimeAsync(5_001);
    expect(inspectUnownedDeletionTransportFence('http://localhost:8090', [])).toMatchObject({
      checking: false,
      orphan: true,
    });
    expect(localStorage.length).toBe(1);
    expect(
      inspectUnownedDeletionTransportFence('http://localhost:8090', [
        {
          version: 1,
          backendUrl: 'http://localhost:8090',
          accountId: 'account-a',
          proof: 'x'.repeat(43),
          phase: 'pending',
          cleanup: 'pending',
          localCleanupDone: false,
          transportFenceId: id,
        },
      ])
    ).toMatchObject({ checking: false, orphan: false });
  });

  it('holds a due installed-SDK retry at its direct dispatcher until the fence is released', () => {
    const wire = allowSdkDispatch();
    const retry = mocked.sdk._retryQueue as InstanceType<typeof RetryQueue>;
    const fenceId = armDeletionTransportFence('http://localhost:8090', 'account-a');
    retry._queue.push({
      retryAt: Date.now() - 1,
      requestOptions: { url: '/e/', data: { distinct_id: 'account-a' } },
    });
    retry._flush();
    expect(wire).not.toHaveBeenCalled();
    expect(retainedDeletionAnalyticsCount()).toBe(1);
    releaseDeletionTransportFence('http://localhost:8090', 'account-a', fenceId);
    mocked.sdk._send_request({ url: '/e/', data: { distinct_id: 'later' } });
    expect(wire).toHaveBeenCalledOnce();
    expect(retainedDeletionAnalyticsCount()).toBe(0);
  });

  it('drops an in-flight SDK retry failure callback after validated cleanup', () => {
    let response!: (value: { statusCode: number }) => void;
    const wire = allowSdkDispatch().mockImplementation((_options, callback) => {
      response = callback;
    });
    const retry = mocked.sdk._retryQueue as InstanceType<typeof RetryQueue>;
    retry.retriableRequest({ url: '/e/', data: { distinct_id: 'account-a' } });
    expect(wire).toHaveBeenCalledOnce();
    discardDeletionAnalyticsQueues();
    response({ statusCode: 500 });
    expect(retry._queue).toHaveLength(0);
    expect(wire).toHaveBeenCalledOnce();
  });

  it('restores the installed retry poller and due request after safe cancellation', async () => {
    const wire = allowSdkDispatch();
    const retry = mocked.sdk._retryQueue as InstanceType<typeof RetryQueue>;
    retry._queue.push({ retryAt: Date.now() - 1, requestOptions: { url: '/e/' } });
    suspendDeletionAnalytics();
    resumeDeletionAnalytics();
    await vi.advanceTimersByTimeAsync(3_100);
    expect(wire).toHaveBeenCalledOnce();
  });

  it('flushes fence-only held requests in order on the next send after safe release', () => {
    const wire = mocked.wire;
    const fenceId = armDeletionTransportFence('http://localhost:8090', 'account-a');
    mocked.sdk._send_request({ url: '/e/', data: 'first' });
    releaseDeletionTransportFence('http://localhost:8090', 'account-a', fenceId);
    mocked.sdk._send_request({ url: '/e/', data: 'second' });
    expect(wire.mock.calls.map(call => call[0].data)).toEqual(['first', 'second']);
  });

  it('discards fence-only held requests when completion is recorded before marker release', () => {
    const wire = mocked.wire;
    const fenceId = armDeletionTransportFence('http://localhost:8090', 'account-a');
    mocked.sdk._send_request({ url: '/e/', data: 'deleted-account' });
    recordCompletedDeletionTransportFence('http://localhost:8090', 'account-a', fenceId);
    discardDeletionAnalyticsQueues();
    releaseDeletionTransportFence('http://localhost:8090', 'account-a', fenceId);
    mocked.sdk._send_request({ url: '/e/', data: 'new-account' });
    expect(wire.mock.calls.map(call => call[0].data)).toEqual(['new-account']);
  });

  it('drops another tab SDK queue and held request before its next send after completion', () => {
    const secondWire = vi.fn();
    const secondTab = {
      _send_request: secondWire,
      _send_retriable_request: vi.fn(),
      _retryQueue: undefined as InstanceType<typeof RetryQueue> | undefined,
    };
    const secondRetry = new RetryQueue(secondTab);
    secondTab._retryQueue = secondRetry;
    installDeletionAnalyticsFence(secondTab as never);
    const fenceId = armDeletionTransportFence('http://localhost:8090', 'account-a');
    secondTab._send_request({ url: '/e/', data: 'old-account' });
    secondRetry._queue.push({
      retryAt: Date.now() + 10_000,
      requestOptions: { url: '/e/', data: 'old-retry' },
    });
    recordCompletedDeletionTransportFence('http://localhost:8090', 'account-a', fenceId);
    releaseDeletionTransportFence('http://localhost:8090', 'account-a', fenceId);
    secondTab._send_request({ url: '/e/', data: 'first-after-completion' });
    expect(secondWire).not.toHaveBeenCalled();
    expect(secondRetry._queue).toHaveLength(0);
    expect(retainedDeletionAnalyticsCount(secondTab)).toBe(0);
    secondTab._send_request({ url: '/e/', data: 'new-account' });
    expect(secondWire).toHaveBeenCalledOnce();
    expect(Object.fromEntries(Object.entries(secondWire.mock.calls[0][0]))).toEqual({
      url: '/e/',
      data: 'new-account',
    });
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

  it('does not release held account events when success removes the marker', () => {
    const fenceId = armDeletionTransportFence('http://localhost:8090', 'account-a');
    const wire = mocked.sdk._send_request as (...args: unknown[]) => void;
    wire({ url: '/e/', data: { distinct_id: 'account-a' } });
    expect(retainedDeletionAnalyticsCount()).toBe(1);
    recordCompletedDeletionTransportFence('http://localhost:8090', 'account-a', fenceId);
    discardDeletionAnalyticsQueues();
    releaseDeletionTransportFence('http://localhost:8090', 'account-a', fenceId);
    wire({ url: '/e/', data: { distinct_id: 'new-anonymous-id' } });
    expect(retainedDeletionAnalyticsCount()).toBe(0);
    expect(mocked.wire).toHaveBeenCalledOnce();
    expect(Object.fromEntries(Object.entries(mocked.wire.mock.calls[0][0]))).toEqual({
      url: '/e/',
      data: { distinct_id: 'new-anonymous-id' },
    });
  });
});
