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
      const status = link.locator(':scope > span').nth(1);
      const titleBox = await title.boundingBox();
      const identityBox = await identity.boundingBox();
      const statusBox = await status.boundingBox();
      expect(titleBox!.width).toBeGreaterThanOrEqual(120);
      expect(titleBox!.height).toBeGreaterThan(0);
      expect(
        statusBox!.x >= identityBox!.x + identityBox!.width ||
          statusBox!.y >= identityBox!.y + identityBox!.height
      ).toBe(true);
      await expect(link).toHaveAccessibleName(/NASA|Smithsonian|Summer Garden/);
    }
    const header = page.getByText('Project', { exact: true });
    if (await header.isVisible()) {
      const headerStatus = await page.getByText('Status', { exact: true }).boundingBox();
      const rowStatus = await links.first().locator(':scope > span').nth(1).boundingBox();
      expect(Math.abs(headerStatus!.x - rowStatus!.x)).toBeLessThan(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await links.first().focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#project-0$/);
  });
}
