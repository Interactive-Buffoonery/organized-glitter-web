/**
 * Step-1 smoke test: prove the Playwright test runner works end-to-end.
 *
 * Navigates to the public home page (no login required), asserts the page
 * title contains "Organized Glitter", and fails the test if any
 * console.error fires during load. This is the minimum viable test; step 2
 * adds authenticated route-mount sweeps.
 */

import { test, expect, type ConsoleMessage } from '@playwright/test';

test.describe('Home page', () => {
  test('loads with the expected title and no console errors', async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', (err: Error) => {
      consoleErrors.push(`pageerror: ${err.message}`);
    });

    await page.goto('/');

    await expect(page).toHaveTitle(/Organized Glitter/);

    // Filter out the known benign third-party noise so we can still assert on
    // real app errors. PostHog's `/e/` endpoint is fronted by a same-origin
    // path in production but hits `us.i.posthog.com` directly in local dev,
    // which can fail with ERR_CONNECTION_REFUSED when you're offline or
    // behind a restrictive network. It's not our code.
    const ignorablePatterns = [
      /us\.i\.posthog\.com/,
      /ERR_CONNECTION_REFUSED.*posthog/i,
      /Failed to load resource.*posthog/i,
      /Failed to load resource: the server responded with a status of 504 \(Outdated Optimize Dep\)/i,
    ];
    const realErrors = consoleErrors.filter(
      text => !ignorablePatterns.some(pattern => pattern.test(text))
    );

    expect(
      realErrors,
      `Unexpected console errors on home page load:\n${realErrors.join('\n')}`
    ).toHaveLength(0);
  });
});

test.describe('Startup recovery', () => {
  test.use({ serviceWorkers: 'block' });

  test('shows an error when the entry script fails and recovers on Retry', async ({ page }) => {
    test.setTimeout(50_000);
    const entryScript = /\/(?:assets\/main-[^/]+\.js|src\/main\.tsx)(?:\?.*)?$/;
    await page.route(entryScript, route =>
      route.fulfill({ status: 429, contentType: 'text/plain', body: 'Test rate limit' })
    );

    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible({
      timeout: 35_000,
    });
    await expect(page.locator('#root')).toBeEmpty();
    await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible();

    await page.unroute(entryScript);
    await page.getByRole('button', { name: 'Try Again' }).click();
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#app-loading')).toHaveCount(0);
    await expect(page.locator('#app-error')).toHaveCount(0);
    await expect(page.locator('#root')).toHaveCSS('opacity', '1');
  });
});
