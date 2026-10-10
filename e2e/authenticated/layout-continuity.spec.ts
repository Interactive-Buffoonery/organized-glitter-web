import { expect, test, type Page, type TestInfo } from '@playwright/test';

import { waitForAccessibilityScanReady } from '../a11y/axe-test';
import { assertLocalE2ETargets } from '../fixtures/local-safety';
import { measureScreenshotPaint } from '../fixtures/screenshot-paint';

const viewports = [
  { width: 320, height: 900, hasTouch: true },
  { width: 768, height: 1024, hasTouch: true },
  { width: 1024, height: 1200, hasTouch: false },
  { width: 1024, height: 1200, hasTouch: true },
  { width: 1440, height: 1200, hasTouch: false },
];

const capture = async (page: Page, testInfo: TestInfo, name: string) => {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
};

const selectTheme = async (page: Page, label: string) => {
  await page.goto('/profile?tab=preferences');
  const option = page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', {
    name: label,
    exact: true,
  });
  await option.click();
  await expect(option).toBeChecked();
  await expect(page.getByText(`Active theme: ${label}`, { exact: true })).toBeVisible();
};

test.beforeEach(({ baseURL }) => {
  assertLocalE2ETargets({
    appUrl: baseURL,
    pocketBaseUrl: process.env.VITE_POCKETBASE_URL,
    specName: 'layout-continuity',
  });
});

for (const viewport of viewports) {
  test.describe(`${viewport.width}px ${viewport.hasTouch ? 'touch' : 'desktop'}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.hasTouch,
    });

    for (const colorScheme of ['light', 'dark'] as const) {
      test(`${colorScheme} shell fills short pages and keeps long-page atmosphere`, async ({
        page,
      }, testInfo) => {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        await page.goto('/profile?tab=preferences');
        const themeGroup = page.getByRole('radiogroup', { name: 'Theme' });
        await expect(themeGroup).toBeVisible();
        await waitForAccessibilityScanReady(page);
        const originalTheme = await themeGroup.getByRole('radio', { checked: true }).innerText();
        try {
          await selectTheme(page, 'System');
          const closeNotice = page.getByRole('button', { name: 'Close hosting notice' });
          if (await closeNotice.isVisible()) {
            await closeNotice.click();
            await expect(closeNotice).toHaveCount(0);
          }
          // Below lg this is the fixed list picker; at lg and up it opens the first list.
          await page.goto('/options');
          await expect(page).toHaveURL(
            viewport.width < 1024 ? /\/options$/ : /\/options\/companies$/
          );
          await expect(
            page.getByRole('heading', { name: 'Manage Lists', exact: true })
          ).toBeVisible();
          await expect(page.getByText('Loading options…', { exact: true })).toHaveCount(0);
          await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
          await waitForAccessibilityScanReady(page);

          const footer = page.getByRole('contentinfo');
          const bottomNav = page.getByRole('navigation', { name: 'Bottom navigation' });
          expect(
            await page.evaluate(() => document.documentElement.scrollHeight)
          ).toBeLessThanOrEqual(viewport.height + 1);
          if (viewport.width < 1024 || viewport.hasTouch) {
            await expect(bottomNav).toBeVisible();
            await expect(footer).toHaveCount(0);
            const padding = await page
              .getByRole('main')
              .evaluate(main => Number.parseFloat(getComputedStyle(main).paddingBottom));
            const navBounds = await bottomNav.boundingBox();
            expect(navBounds).not.toBeNull();
            expect(padding).toBeGreaterThanOrEqual(navBounds!.height);
            expect(
              Math.abs(navBounds!.y + navBounds!.height - viewport.height)
            ).toBeLessThanOrEqual(1);
          } else {
            await expect(footer).toBeVisible();
            const placement = await footer.evaluate(element => ({
              bottom: element.getBoundingClientRect().bottom,
              viewport: window.innerHeight,
              safeBottom: Number.parseFloat(
                getComputedStyle(document.querySelector('.mobile-app-container')!).paddingBottom
              ),
            }));
            expect(
              Math.abs(placement.bottom + placement.safeBottom - placement.viewport)
            ).toBeLessThanOrEqual(1);
          }

          const shell = page.locator('.aurora-bg');
          await expect
            .poll(() => shell.evaluate(element => element.getBoundingClientRect().height))
            .toBeGreaterThanOrEqual(viewport.height);
          await capture(page, testInfo, 'short-page');

          await page.goto('/projects/new');
          await expect(
            page.getByRole('heading', { name: /^New (project|coloring book)$/ })
          ).toBeVisible();
          await waitForAccessibilityScanReady(page);
          await expect
            .poll(() => page.evaluate(() => document.documentElement.scrollHeight))
            .toBeGreaterThan(viewport.height);

          const atmosphere = page.locator('.page-atmosphere');
          await expect(atmosphere).toHaveCSS('position', 'fixed');
          await expect(atmosphere).toHaveCSS('background-size', '100% 100%');
          await expect(atmosphere).toHaveCSS('background-repeat', 'no-repeat');
          const initialBounds = await atmosphere.boundingBox();
          expect(initialBounds).toEqual({
            x: 0,
            y: 0,
            width: await page.evaluate(() => document.documentElement.clientWidth),
            height: viewport.height,
          });
          // The outer gutter exposes the page paint without cards, sticky chrome,
          // or scrollbars. Its pixels must stay continuous as the document scrolls.
          const clip = { x: 0, y: 120, width: 2, height: viewport.height - 240 };
          const initialPaint = await page.screenshot({ clip, animations: 'disabled' });
          // A fixed layer can still contain a hard shade cutoff. Adjacent rows
          // should change smoothly throughout the unobstructed gutter.
          await capture(page, testInfo, 'long-page-top');
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
          expect(await atmosphere.boundingBox()).toEqual(initialBounds);
          const scrolledPaint = await page.screenshot({ clip, animations: 'disabled' });
          const paint = await measureScreenshotPaint(page, initialPaint, scrolledPaint);
          expect(paint.firstLargestRowStep).toBeLessThanOrEqual(3);
          expect(paint.secondLargestRowStep).toBeLessThanOrEqual(3);
          // PNG decoding can vary by one channel value between browser engines.
          expect(paint.largestDifference).toBeLessThanOrEqual(1);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth)
          ).toBeLessThanOrEqual(viewport.width);
          await capture(page, testInfo, 'long-page-bottom');
        } finally {
          await selectTheme(page, originalTheme.trim());
        }
      });
    }
  });
}
