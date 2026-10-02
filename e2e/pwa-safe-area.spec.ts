/**
 * E2E regression for the hideNav top safe-area fix: `/links` uses MainLayout
 * with `hideNav`, so the layout root must carry `site-header-safe-area` while
 * the sticky header is absent. Desktop Chrome cannot assert
 * env(safe-area-inset-top) pixels, but the class contract matches the PWA CSS
 * in public/css/safe-area.css.
 */

import { test, expect, type ConsoleMessage } from '@playwright/test';

test.describe('PWA safe-area (hideNav)', () => {
  test('links page applies site-header-safe-area on MainLayout root', async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', (err: Error) => {
      consoleErrors.push(`pageerror: ${err.message}`);
    });

    await page.goto('/links');

    await expect(page).toHaveTitle(/Links/);

    await expect(
      page.locator('.mobile-app-container .aurora-bg.site-header-safe-area')
    ).toHaveCount(1);

    await expect(page.getByRole('banner', { name: 'Site header' })).toHaveCount(0);

    const ignorablePatterns = [
      /us\.i\.posthog\.com/,
      /ERR_CONNECTION_REFUSED.*posthog/i,
      /Failed to load resource.*posthog/i,
    ];
    const realErrors = consoleErrors.filter(
      text => !ignorablePatterns.some(pattern => pattern.test(text))
    );

    expect(
      realErrors,
      `Unexpected console errors on /links load:\n${realErrors.join('\n')}`
    ).toHaveLength(0);
  });
});
