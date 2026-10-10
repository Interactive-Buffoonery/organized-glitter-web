/**
 * Public homepage coverage: loading, runtime errors, and readable marketing
 * cards across both themes and phone, tablet, and desktop widths.
 */

import { test, expect, type ConsoleMessage } from '@playwright/test';

import { expectNoAxeViolations, waitForAccessibilityScanReady } from './a11y/axe-test';

test.describe('Home page', () => {
  test('loads without errors and keeps marketing cards readable across themes and widths', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
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
    await page.addInitScript(() => localStorage.setItem('theme', 'system'));

    for (const theme of ['light', 'dark'] as const) {
      for (const width of [320, 390, 800, 1280]) {
        await test.step(`marketing cards in ${theme} at ${width}px`, async () => {
          await page.setViewportSize({ width, height: 900 });
          await page.emulateMedia({ colorScheme: theme });
          await page.goto('/');
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          await waitForAccessibilityScanReady(page);

          for (const selector of ['.features-sheet', '.sig-panel']) {
            const card = page.locator(selector);
            await card.scrollIntoViewIfNeeded();
            await expect(card.locator('xpath=../../..')).toHaveCSS('opacity', '1');
            const surface = await card.evaluate(element => {
              const color = getComputedStyle(element).backgroundColor;
              const channels = color
                .match(/[\d.]+/g)!
                .slice(0, 3)
                .map(Number);
              const linear = channels.map(channel => {
                const value = channel / 255;
                return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
              });
              const bounds = element.getBoundingClientRect();
              return {
                luminance: linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722,
                left: bounds.left,
                right: bounds.right,
                clipped: element.scrollWidth > element.clientWidth,
              };
            });
            if (theme === 'dark') expect(surface.luminance).toBeLessThan(0.15);
            else expect(surface.luminance).toBeGreaterThan(0.8);
            expect(surface.left).toBeGreaterThanOrEqual(0);
            expect(surface.right).toBeLessThanOrEqual(width);
            expect(surface.clipped).toBe(false);
            await expectNoAxeViolations(page, { include: selector });
          }
          if (width === 320 || width === 1280) {
            const screenshot = testInfo.outputPath(`home-${theme}-${width}.png`);
            await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });
            await testInfo.attach(`home-${theme}-${width}`, {
              path: screenshot,
              contentType: 'image/png',
            });
          }
        });
      }
    }

    const realErrors = consoleErrors.filter(
      text => !ignorablePatterns.some(pattern => pattern.test(text))
    );
    expect(
      realErrors,
      `Unexpected console errors on home page:\n${realErrors.join('\n')}`
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
