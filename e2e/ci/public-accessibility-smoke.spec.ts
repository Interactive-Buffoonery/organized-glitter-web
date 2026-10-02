import { expect, test } from '@playwright/test';

import { createAxeBuilder } from '../a11y/axe-test';

for (const route of ['/', '/login']) {
  test(`${route} has no WCAG A or AA violations`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator('#main-content')).toBeVisible();

    const builder = await createAxeBuilder(page);
    const results = await builder.analyze();
    expect(results.violations).toEqual([]);
  });
}
