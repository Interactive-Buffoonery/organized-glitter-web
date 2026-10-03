import { expect, test } from '@playwright/test';

import { expectNoStructuralAxeViolations } from '../a11y/axe-test';

test('overview has no structural WCAG A or AA violations', async ({ page }) => {
  await page.goto('/overview');
  await expect(page.getByRole('heading', { name: /^Welcome back,/ })).toBeVisible({
    timeout: 15_000,
  });

  await expectNoStructuralAxeViolations(page);
});
