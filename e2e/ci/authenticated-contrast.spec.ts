import { expect, test, type Page } from '@playwright/test';

import { expectNoAxeViolations } from '../a11y/axe-test';

const prepareTheme = async (page: Page, colorScheme: 'light' | 'dark') => {
  await page.addInitScript(() => window.localStorage.setItem('theme', 'system'));
  await page.emulateMedia({ colorScheme });
  await page.goto('/overview');

  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', colorScheme);
  if (colorScheme === 'dark') {
    await expect(html).toHaveClass(/(^|\s)dark(\s|$)/);
  } else {
    await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/);
  }
};

for (const colorScheme of ['light', 'dark'] as const) {
  test(`overview has no WCAG A or AA violations in ${colorScheme} mode`, async ({ page }) => {
    await prepareTheme(page, colorScheme);
    await expect(page.getByRole('heading', { name: /^Welcome back,/ })).toBeVisible();
    await expectNoAxeViolations(page);
  });
}
