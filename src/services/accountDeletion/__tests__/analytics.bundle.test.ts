import { expect, it, vi } from 'vitest';

it('holds captures from the Vite-resolved PostHog bundle during deletion', async () => {
  const sends: Array<{ url: string; body: string }> = [];
  let holdNextEvent = false;
  let failHeldEvent: (() => void) | undefined;
  class FakeXHR {
    withCredentials = true;
    readyState = 0;
    status = 0;
    responseText = '';
    onreadystatechange?: () => void;
    private url = '';
    open(_method: string, url: string) {
      this.url = url;
    }
    setRequestHeader() {}
    send(body?: Document | XMLHttpRequestBodyInit | null) {
      sends.push({ url: this.url, body: String(body ?? '') });
      if (holdNextEvent && this.url.includes('/e/')) {
        holdNextEvent = false;
        failHeldEvent = () => {
          this.readyState = 4;
          this.status = 500;
          this.responseText = '{}';
          this.onreadystatechange?.();
        };
        return;
      }
      this.readyState = 4;
      this.status = 200;
      this.responseText = '{}';
      this.onreadystatechange?.();
    }
  }
  vi.stubGlobal('XMLHttpRequest', FakeXHR);
  vi.stubGlobal('fetch', async (url: string, options?: RequestInit) => {
    sends.push({ url: String(url), body: String(options?.body ?? '') });
    return new Response('{}', { status: 200 });
  });
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: () => true });
  const { default: posthog } = await import('posthog-js');
  const {
    armDeletionTransportFence,
    installDeletionAnalyticsFence,
    discardDeletionAnalyticsQueues,
    recordCompletedDeletionTransportFence,
    releaseDeletionTransportFence,
    resumeDeletionAnalytics,
    suspendDeletionAnalytics,
  } = await import('../analytics');
  posthog.init('phc_disposable_fixture', {
    api_host: 'http://127.0.0.1:9',
    api_transport: 'XHR',
    disable_compression: true,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    advanced_disable_decide: true,
    advanced_disable_flags: true,
    disable_surveys: true,
    request_queue_config: { flush_interval_ms: 250 },
  });
  expect((posthog as unknown as { _retryQueue?: unknown })._retryQueue).toBeUndefined();
  expect((posthog as unknown as { _requestQueue?: unknown })._requestQueue).toBeUndefined();
  expect(installDeletionAnalyticsFence()).toBe(true);
  expect(
    installDeletionAnalyticsFence({ config: { token: 'unknown-sdk' } } as Parameters<
      typeof installDeletionAnalyticsFence
    >[0])
  ).toBe(false);
  await new Promise(resolve => setTimeout(resolve, 300));
  posthog.capture('baseline-before-deletion');
  await new Promise(resolve => setTimeout(resolve, 650));
  expect(sends.some(request => request.url.includes('/e/'))).toBe(true);
  sends.length = 0;
  posthog.capture('queued-before-deletion');
  const fenceId = armDeletionTransportFence('http://localhost:8090', 'account-a');
  suspendDeletionAnalytics();
  await new Promise(resolve => setTimeout(resolve, 650));
  expect(sends.filter(request => request.url.includes('/e/'))).toHaveLength(0);
  releaseDeletionTransportFence('http://localhost:8090', 'account-a', fenceId);
  resumeDeletionAnalytics();
  await new Promise(resolve => setTimeout(resolve, 100));
  expect(sends.filter(request => request.url.includes('/e/'))).toHaveLength(1);

  sends.length = 0;
  posthog.opt_in_capturing({ captureEventName: false });
  sends.length = 0;
  posthog.capture('old-before-cross-tab-completion');
  const crossTabFence = armDeletionTransportFence('http://localhost:8090', 'account-a');
  suspendDeletionAnalytics();
  await new Promise(resolve => setTimeout(resolve, 650));
  expect(sends.filter(request => request.url.includes('/e/'))).toHaveLength(0);
  localStorage.setItem('og:account-deletion:analytics-complete:v1:other-tab', 'completed');
  releaseDeletionTransportFence('http://localhost:8090', 'account-a', crossTabFence);
  resumeDeletionAnalytics();
  await new Promise(resolve => setTimeout(resolve, 100));
  expect(sends.filter(request => request.url.includes('/e/'))).toHaveLength(0);
  posthog.opt_in_capturing({ captureEventName: false });
  posthog.capture('fresh-after-cross-tab-completion');
  await new Promise(resolve => setTimeout(resolve, 650));
  expect(sends.some(request => request.body.includes('fresh-after-cross-tab-completion'))).toBe(
    true
  );

  sends.length = 0;
  posthog.opt_in_capturing();
  sends.length = 0;
  posthog.capture('old-before-confirmed-deletion');
  const completedFence = armDeletionTransportFence('http://localhost:8090', 'account-a');
  suspendDeletionAnalytics();
  await new Promise(resolve => setTimeout(resolve, 650));
  expect(sends.filter(request => request.url.includes('/e/'))).toHaveLength(0);
  discardDeletionAnalyticsQueues();
  recordCompletedDeletionTransportFence('http://localhost:8090', 'account-a', completedFence);
  releaseDeletionTransportFence('http://localhost:8090', 'account-a', completedFence);
  resumeDeletionAnalytics();
  await new Promise(resolve => setTimeout(resolve, 100));
  expect(sends.filter(request => request.url.includes('/e/'))).toHaveLength(0);
  posthog.opt_in_capturing();
  sends.length = 0;
  posthog.capture('fresh-after-confirmed-deletion');
  await new Promise(resolve => setTimeout(resolve, 650));
  const delivered = sends.filter(request => request.url.includes('/e/'));
  expect(delivered).toHaveLength(1);
  expect(delivered[0].body).toContain('fresh-after-confirmed-deletion');
  expect(delivered[0].body).not.toContain('old-before-confirmed-deletion');

  sends.length = 0;
  holdNextEvent = true;
  posthog.capture('late-retry-before-confirmed-deletion');
  await new Promise(resolve => setTimeout(resolve, 650));
  expect(failHeldEvent).toBeTypeOf('function');
  const initialCount = sends.filter(request => request.url.includes('/e/')).length;
  const lateFence = armDeletionTransportFence('http://localhost:8090', 'account-a');
  suspendDeletionAnalytics();
  discardDeletionAnalyticsQueues();
  recordCompletedDeletionTransportFence('http://localhost:8090', 'account-a', lateFence);
  releaseDeletionTransportFence('http://localhost:8090', 'account-a', lateFence);
  failHeldEvent?.();
  resumeDeletionAnalytics();
  await new Promise(resolve => setTimeout(resolve, 4_000));
  expect(sends.filter(request => request.url.includes('/e/'))).toHaveLength(initialCount);
  vi.unstubAllGlobals();
});
