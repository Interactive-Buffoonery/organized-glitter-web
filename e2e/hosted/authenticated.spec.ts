import { expect, test } from '@playwright/test';

import { libraryPageHeading } from '../libraryPage';
import { createPacedVisit, pacedTestTimeout } from './paced-visit';

test('key signed-in routes load in one paced session', async ({ page }) => {
  test.setTimeout(pacedTestTimeout(7));
  const visit = createPacedVisit(page, { initialPause: true });
  const bookId = process.env.E2E_COLORING_BOOK_ID!;
  const pageId = process.env.E2E_COLORING_PAGE_ID!;

  await visit('/overview', page.getByRole('heading', { name: /^Welcome back,/ }));
  await visit('/dashboard', libraryPageHeading(page));
  await visit('/projects/new', page.getByLabel('Project title'));
  await visit(
    '/dashboard?craft=coloring',
    page.getByRole('searchbox', { name: 'Search coloring books' })
  );
  await visit(`/coloring/${bookId}`, page.getByRole('heading', { name: 'Pages' }));
  await visit(
    `/coloring/${bookId}/pages/${pageId}`,
    page.getByRole('heading', { name: /^Page \d+$/ })
  );
  await visit('/stats', page.getByRole('heading', { name: 'Stats' }));

  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0);
});
