import { expect, test } from '@playwright/test';
import { gunzipSync } from 'node:zlib';
import { assertLocalE2ETargets } from '../fixtures/local-safety';
import type {} from '../../src/e2e/accountDeletionBridge';

const analyticsHost = 'http://127.0.0.1:9899';
const backendUrl = process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';

test.use({
  serviceWorkers: 'block',
  trace: 'off',
  video: 'off',
  screenshot: 'off',
});

test('holds and discards queued events in the built PostHog bundle', async ({ page }) => {
  assertLocalE2ETargets({ appUrl, pocketBaseUrl: backendUrl, specName: 'Deletion analytics' });
  expect(process.env.VITE_PUBLIC_POSTHOG_KEY).toBe('phc_disposable_deletion_qa');
  expect(process.env.VITE_PUBLIC_POSTHOG_HOST).toBe(analyticsHost);
  const requests: Array<{ path: string; body: string }> = [];
  await page.route(`${analyticsHost}/**`, route => {
    const bytes = route.request().postDataBuffer();
    let body = bytes?.toString('utf8') ?? '';
    if (bytes) {
      try {
        body = gunzipSync(bytes).toString('utf8');
      } catch {
        // The SDK can send plain JSON when compression is unavailable.
      }
    }
    requests.push({
      path: new URL(route.request().url()).pathname,
      body,
    });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/profile?tab=account');
  const usageAnalytics = page.getByRole('switch', { name: 'Usage analytics' });
  await expect(usageAnalytics).toBeEnabled();
  if (!(await usageAnalytics.isChecked())) await usageAnalytics.check();
  await expect(usageAnalytics).toBeChecked();
  await expect.poll(() => page.evaluate(() => Boolean(window.__ogDeletionQa))).toBe(true);
  await page.evaluate(() => {
    const { posthog } = window.__ogDeletionQa!;
    posthog.set_config({ opt_out_useragent_filter: true });
    posthog.capture('session_context', { fixture: 'baseline-before-deletion' });
  });
  await expect
    .poll(() => requests.some(request => request.body.includes('baseline-before-deletion')), {
      timeout: 6000,
    })
    .toBe(true);

  requests.length = 0;
  const safeFence = await page.evaluate(backend => {
    const { posthog, armDeletionTransportFence, suspendDeletionAnalytics } = window.__ogDeletionQa!;
    posthog.capture('session_context', { fixture: 'queued-before-safe-cancel' });
    const fence = armDeletionTransportFence(backend, 'disposable-account');
    suspendDeletionAnalytics();
    return fence;
  }, backendUrl);
  await page.waitForTimeout(3500);
  expect(requests).toEqual([]);
  await page.evaluate(
    ({ backend, fence }) => {
      const { posthog, releaseDeletionTransportFence, resumeDeletionAnalytics } =
        window.__ogDeletionQa!;
      releaseDeletionTransportFence(backend, 'disposable-account', fence);
      resumeDeletionAnalytics();
      posthog.opt_in_capturing({ captureEventName: false });
      posthog.capture('session_context', { fixture: 'new-after-safe-cancel' });
    },
    { backend: backendUrl, fence: safeFence }
  );
  await expect
    .poll(() => requests.some(request => request.body.includes('queued-before-safe-cancel')), {
      timeout: 6000,
    })
    .toBe(true);

  requests.length = 0;
  const completedFence = await page.evaluate(backend => {
    const { posthog, armDeletionTransportFence, suspendDeletionAnalytics } = window.__ogDeletionQa!;
    posthog.capture('session_context', { fixture: 'old-before-confirmed-deletion' });
    const fence = armDeletionTransportFence(backend, 'disposable-account');
    suspendDeletionAnalytics();
    return fence;
  }, backendUrl);
  await page.waitForTimeout(3500);
  expect(requests).toEqual([]);
  await page.evaluate(
    ({ backend, fence }) => {
      const {
        posthog,
        discardDeletionAnalyticsQueues,
        recordCompletedDeletionTransportFence,
        releaseDeletionTransportFence,
        resumeDeletionAnalytics,
      } = window.__ogDeletionQa!;
      discardDeletionAnalyticsQueues();
      recordCompletedDeletionTransportFence(backend, 'disposable-account', fence);
      releaseDeletionTransportFence(backend, 'disposable-account', fence);
      resumeDeletionAnalytics();
      posthog.reset();
      posthog.opt_in_capturing({ captureEventName: false });
      posthog.capture('session_context', { fixture: 'fresh-after-confirmed-deletion' });
    },
    { backend: backendUrl, fence: completedFence }
  );
  await expect
    .poll(() => requests.some(request => request.body.includes('fresh-after-confirmed-deletion')), {
      timeout: 6000,
    })
    .toBe(true);
  expect(requests.some(request => request.body.includes('old-before-confirmed-deletion'))).toBe(
    false
  );
});
