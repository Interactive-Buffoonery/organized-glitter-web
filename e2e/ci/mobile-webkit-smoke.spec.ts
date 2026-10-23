import { expect, test } from '@playwright/test';

import { expectNoStructuralAxeViolations, pressEscape } from '../a11y/axe-test';

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
});
