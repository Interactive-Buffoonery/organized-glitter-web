import { expect, test } from '@playwright/test';

import { createPacedVisit, pacedTestTimeout } from './paced-visit';

test('mobile navigation and coloring page load in one paced session', async ({ page }) => {
  test.setTimeout(pacedTestTimeout(3));
  const visit = createPacedVisit(page, { initialPause: true });
  const bookId = process.env.E2E_COLORING_BOOK_ID!;
  const pageId = process.env.E2E_COLORING_PAGE_ID!;

  await visit('/overview', page.getByRole('heading', { name: /^Welcome back,/ }));
  await page.getByRole('button', { name: 'Add new item' }).click();
  await expect(page.getByRole('menuitem', { name: 'New diamond painting' })).toBeVisible();
  await page.keyboard.press('Escape');

  await visit(
    '/dashboard?craft=coloring',
    page.getByRole('searchbox', { name: 'Search coloring books' })
  );
  await visit(
    `/coloring/${bookId}/pages/${pageId}`,
    page.getByRole('heading', { name: /^Page \d+$/ })
  );
  await expect(page.getByRole('textbox', { name: 'Progress note', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
});
