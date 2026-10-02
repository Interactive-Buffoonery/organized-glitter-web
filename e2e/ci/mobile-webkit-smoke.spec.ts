import { expect, test } from '@playwright/test';

import { expectNoStructuralAxeViolations, pressEscape } from '../a11y/axe-test';
import { libraryPageHeading } from '../libraryPage';

test.describe('mobile WebKit critical interactions', () => {
  test('opens the bottom add menu accessibly', async ({ page }) => {
    await page.goto('/overview');
    await expect(page.getByRole('heading', { name: /^Welcome back,/ })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: 'Add new item' }).click();
    await expect(page.getByRole('menuitem', { name: /new/i }).first()).toBeVisible();
    await expectNoStructuralAxeViolations(page, { include: '[role="menu"]' });
    await pressEscape(page);
  });

  test('opens the account menu accessibly', async ({ page }) => {
    await page.goto('/overview');
    await expect(page.getByRole('heading', { name: /^Welcome back,/ })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: 'Open account menu' }).click();
    await expect(page.getByRole('heading', { name: 'Account menu' })).toBeVisible();
    await expectNoStructuralAxeViolations(page);
    await pressEscape(page);
  });

  test('opens the coloring filter drawer accessibly', async ({ page }) => {
    await page.goto('/dashboard?craft=coloring');
    await expect(page.getByRole('searchbox', { name: 'Search coloring books' })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: /open filters|filters/i }).click();
    await expect(page.locator('h2:not(.sr-only)', { hasText: 'Filters' })).toBeVisible();
    await expectNoStructuralAxeViolations(page);
    await pressEscape(page);
  });

  test('opens the project sort drawer accessibly', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(libraryPageHeading(page)).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: /sort projects/i }).click();
    await expect(page.locator('h2:not(.sr-only)', { hasText: 'Sort Projects' })).toBeVisible();
    await expectNoStructuralAxeViolations(page);
  });
});
