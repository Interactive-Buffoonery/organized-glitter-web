import { test, expect } from '@playwright/test';

import { createAxeBuilder } from './a11y/axe-test';

const publicHeaderRoutes = ['/', '/about', '/privacy', '/terms', '/forgot-password'];

test.describe('Public header accessibility', () => {
  test('lets keyboard users skip the public header', async ({ page }) => {
    await page.goto('/');

    const skipLink = page.getByRole('link', { name: 'Skip to content' });
    const main = page.locator('#main-content');

    await expect(skipLink).toHaveAttribute('href', '#main-content');
    await page.keyboard.press('Tab');
    await expect(skipLink).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main-content$/);
    await expect(main).toBeFocused();
  });

  test('keeps the public mobile home link at least 44px square', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const homeLink = page.getByRole('link', { name: 'Organized Glitter home' });
    await expect(homeLink).toBeVisible();

    const box = await homeLink.boundingBox();
    expect(box, 'home link has a bounding box').not.toBeNull();
    expect(box!.width, 'home link is at least 44px wide').toBeGreaterThanOrEqual(44);
    expect(box!.height, 'home link is at least 44px tall').toBeGreaterThanOrEqual(44);
  });

  for (const route of publicHeaderRoutes) {
    test(`keeps public auth actions semantic on ${route}`, async ({ page }) => {
      await page.goto(route);

      const header = page.getByRole('banner', { name: 'Site header' });
      await expect(header).toHaveCount(1);

      await expect(header.getByRole('link', { name: 'Login' })).toHaveAttribute('href', /\/login$/);
      await expect(header.getByRole('link', { name: 'Get Started' })).toHaveAttribute(
        'href',
        /\/register$/
      );
      await expect(header.getByRole('button', { name: 'Login' })).toHaveCount(0);
      await expect(header.getByRole('button', { name: 'Get Started' })).toHaveCount(0);
      await expect(header.locator('a button, button a')).toHaveCount(0);

      const builder = await createAxeBuilder(page);
      const accessibilityScanResults = await builder
        .include('header[aria-label="Site header"]')
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });
  }
});

test('unknown public routes serve a standalone 404 page', async ({ page }) => {
  const response = await page.goto('/missing-page');

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole('main').getByRole('heading', { name: 'Page not found' })
  ).toBeVisible();
  await expect(page.getByRole('banner', { name: 'Site header' })).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
});

test.describe('Homepage feature dividers', () => {
  for (const theme of ['light', 'dark']) {
    for (const width of [1280, 390]) {
      test(`shows paper dividers in ${theme} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await page.addInitScript(value => localStorage.setItem('theme', value), theme);
        await page.goto('/');
        await expect(page.locator('.feature-spotlight')).toHaveCSS('border-bottom-width', '1px');
        const divider = page.locator('.feature-item + .feature-item').first();
        await expect(divider).toHaveCSS(
          width > 800 ? 'border-left-width' : 'border-top-width',
          '1px'
        );
      });
    }
  }
});
