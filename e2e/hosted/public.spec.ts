import { expect, test } from '@playwright/test';

import { createPacedVisit, pacedTestTimeout } from './paced-visit';

test('public pages and login load in one paced session', async ({ page }) => {
  test.setTimeout(pacedTestTimeout(3));
  const visit = createPacedVisit(page, { initialPause: true });

  await visit('/', page.getByRole('heading', { level: 1 }));
  await visit('/links', page.getByRole('region', { name: 'Primary links' }));
  await visit('/login', page.getByLabel('Password'));

  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
});
