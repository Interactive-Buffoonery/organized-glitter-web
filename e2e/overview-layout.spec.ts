import { expect, test } from '@playwright/test';

for (const [width, height] of [
  [1071, 1030],
  [1280, 800],
  [1024, 800],
  [768, 800],
  [390, 844],
  [1536, 900],
]) {
  test(`overview project identity at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/e2e/fixtures/overview-layout/index.html');
    const links = page.getByRole('region', { name: 'In progress' }).getByRole('link');
    await expect(links).toHaveCount(3);
    if (process.env.OVERVIEW_SCREENSHOTS)
      await page.screenshot({
        path: `${process.env.OVERVIEW_SCREENSHOTS}/${width}.png`,
        fullPage: true,
      });
    for (const link of await links.all()) {
      const identity = link.locator(':scope > span').nth(0);
      const title = identity.locator(':scope > span').nth(1).locator('span').first();
      const activity = link.locator(':scope > span').nth(1);
      const titleBox = await title.boundingBox();
      const identityBox = await identity.boundingBox();
      const activityBox = await activity.boundingBox();
      expect(titleBox!.width).toBeGreaterThanOrEqual(120);
      expect(titleBox!.height).toBeGreaterThan(0);
      expect(
        activityBox!.x >= identityBox!.x + identityBox!.width ||
          activityBox!.y >= identityBox!.y + identityBox!.height
      ).toBe(true);
      await expect(activity).toBeVisible();
      await expect(activity).toHaveText('Updated today');
      await expect(link).toHaveAccessibleName(/NASA|Smithsonian|Summer Garden/);
    }
    const header = page.getByText('Project', { exact: true });
    if (await header.isVisible()) {
      const headerActivity = await page.getByText('Last activity', { exact: true }).boundingBox();
      const rowActivity = await links.first().locator(':scope > span').nth(1).boundingBox();
      expect(Math.abs(headerActivity!.x - rowActivity!.x)).toBeLessThan(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await links.first().focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#project-0$/);
  });
}
