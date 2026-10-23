import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { createAxeBuilder } from './axe-test';

const publicRoutes = ['/', '/login', '/privacy'];

test.describe('public accessibility axe scans', () => {
  for (const route of publicRoutes) {
    test(`${route} has no WCAG A/AA axe violations`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator('#main-content')).toBeVisible();

      const builder = await createAxeBuilder(page);
      const accessibilityScanResults = await builder.analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });
  }
});

test('standalone 404 page has no WCAG A/AA axe violations', async ({ page }) => {
  const response = await page.goto('/missing-a11y-route');
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole('main').getByRole('heading', { name: 'Page not found' })
  ).toBeVisible();

  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  expect(accessibilityScanResults.violations).toEqual([]);
});
