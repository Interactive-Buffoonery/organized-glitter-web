import { expect, test } from '@playwright/test';
import { assertLocalE2ETargets } from '../fixtures/local-safety';

for (const width of [320, 768, 1440]) {
  test(`UI labels remain readable at ${width}px`, async ({ page, baseURL }, testInfo) => {
    assertLocalE2ETargets({
      appUrl: baseURL,
      pocketBaseUrl: process.env.VITE_POCKETBASE_URL,
      specName: 'ui-copy-local',
    });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/overview');
    await expect(page.getByRole('heading', { level: 1, name: /^Welcome back,/ })).toBeVisible();
    await expect(page.getByText(/Thank you for being part of Organized Glitter/)).toBeVisible();
    const paragraph = page.getByText(/Thank you for being part of Organized Glitter/);
    expect(await paragraph.evaluate(element => element.tagName)).toBe('P');
    await page.screenshot({ path: testInfo.outputPath('overview.png'), fullPage: true });

    await page.goto('/stats');
    const scope = page.getByRole('group', { name: 'Craft scope' });
    const diamond = scope.getByRole('button', { name: 'Diamond paintings', exact: true });
    await expect(diamond).toBeVisible();
    expect(await diamond.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(
      true
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await page.screenshot({ path: testInfo.outputPath('stats.png'), fullPage: true });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    expect(await diamond.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(
      true
    );
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '';
    });

    await page.goto('/notes');
    await expect(page.getByRole('tab', { name: 'Diamond paintings', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Coloring pages', exact: true })).toBeVisible();
  });
}
