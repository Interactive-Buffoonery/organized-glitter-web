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

for (const route of ['/login', '/register']) {
  for (const colorScheme of ['light', 'dark'] as const) {
    for (const width of [1280, 320]) {
      test(`${route} social sign-in failure is accessible in ${colorScheme} at ${width}px`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        await page.addInitScript(() => localStorage.setItem('theme', 'system'));
        await page.route('**/api/collections/users/auth-methods*', route => route.abort());
        await page.goto(route);
        await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);

        const alert = page.getByRole('alert').filter({ hasText: 'Social sign-in is unavailable' });
        await expect(alert).toHaveText(
          'Social sign-in is unavailable right now. Use email and password.'
        );
        await alert.scrollIntoViewIfNeeded();
        await expect(alert).toBeInViewport();
        await expect(page.getByLabel('Email', { exact: true })).toBeEditable();
        await expect(page.getByLabel('Password', { exact: true })).toBeEditable();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
        ).toBe(true);

        const builder = await createAxeBuilder(page, { include: '[role="alert"]' });
        const results = await builder.analyze();
        await testInfo.attach('social-sign-in-contrast', {
          body: JSON.stringify(results, null, 2),
          contentType: 'application/json',
        });
        expect(results.violations).toEqual([]);
        expect(results.incomplete.filter(result => result.id === 'color-contrast')).toEqual([]);
        expect(results.passes.find(result => result.id === 'color-contrast')?.nodes).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              html: expect.stringContaining('Social sign-in is unavailable'),
            }),
          ])
        );
      });
    }
  }
}
