import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { createAxeBuilder } from './axe-test';

const publicRoutes = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/about',
  '/privacy',
  '/terms',
  '/links',
];

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

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  for (const mode of ['login', 'register'] as const) {
    test(`${mode} password purpose at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(`/${mode}`);
      await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
        'autocomplete',
        mode === 'login' ? 'current-password' : 'new-password'
      );
      if (mode === 'register') {
        await expect(page.getByLabel('Confirm Password', { exact: true })).toHaveAttribute(
          'autocomplete',
          'new-password'
        );
      }
    });
  }
}
