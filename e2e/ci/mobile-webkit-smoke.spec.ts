import { expect, test } from '@playwright/test';

import { expectNoStructuralAxeViolations, pressEscape } from '../a11y/axe-test';

test.describe('mobile WebKit critical interactions', () => {
  test('opens the bottom add menu and coloring filters accessibly', async ({ page }) => {
    await page.goto('/overview');
    await expect(page.getByRole('heading', { name: /^Welcome back,/ })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: 'Add new item' }).click();
    await expect(page.getByRole('menuitem', { name: /new/i }).first()).toBeVisible();
    await expectNoStructuralAxeViolations(page, { include: '[role="menu"]' });
    await pressEscape(page);
    await expectNoStructuralAxeViolations(page);

    await page.goto('/dashboard?craft=coloring');
    await expect(page.getByRole('searchbox', { name: 'Search coloring books' })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: /open filters|filters/i }).click();
    await expect(page.locator('h2:not(.sr-only)', { hasText: 'Filters' })).toBeVisible();
    await expectNoStructuralAxeViolations(page);
    await page.getByRole('button', { name: /Status filter/ }).click();
    await page.getByRole('checkbox', { name: 'Wishlist', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Purchased', exact: true }).check();
    await pressEscape(page);
    await expect(page.getByRole('button', { name: /Status filter/ })).toContainText('2');
    await expectNoStructuralAxeViolations(page);
    await pressEscape(page);
  });
});
