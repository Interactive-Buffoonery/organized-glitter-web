import { expect, test, type Page } from '@playwright/test';

import { getFirstHrefMatching, requireFixtureOrSkip } from '../a11y/axe-test';

const DEFAULT_FIXTURE_PROJECT_ID = 'n5zfnqdq3zzwso0';
const FIXTURE_PROJECT_ID = process.env.E2E_FIXTURE_PROJECT_ID?.trim() || DEFAULT_FIXTURE_PROJECT_ID;

const DEFAULT_FIXTURE_COLORING_BOOK_ID = 'kgs059794affuba';
const FIXTURE_COLORING_BOOK_ID =
  process.env.E2E_COLORING_BOOK_ID?.trim() || DEFAULT_FIXTURE_COLORING_BOOK_ID;

const authenticatedTitleRoutes = [
  { path: '/overview', title: /Overview \| Organized Glitter/ },
  { path: '/dashboard', title: /Library \| Organized Glitter/ },
  { path: '/projects/new', title: /New project \| Organized Glitter/ },
  { path: '/projects/new?craft=coloring', title: /New coloring book \| Organized Glitter/ },
  { path: '/profile', title: /Profile \| Organized Glitter/ },
  { path: '/randomizer', title: /Randomizer \| Organized Glitter/ },
  { path: '/stats', title: /Stats \| Organized Glitter/ },
  { path: '/notes', title: /Notes \| Organized Glitter/ },
];

const ensureColoringBookPath = async (page: Page) => {
  // Prefer the seeded fixture book so the test targets a known-good record
  // deterministically instead of whichever book the dashboard happens to list
  // first. Fall back to discovery, then skip if the account has no coloring data.
  const fixturePath = `/coloring/${FIXTURE_COLORING_BOOK_ID}`;
  await page.goto(fixturePath);
  if (
    await page
      .getByRole('heading', { name: 'Pages' })
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false)
  ) {
    return fixturePath;
  }

  await page.goto('/dashboard?craft=coloring');
  await expect(page.getByRole('searchbox', { name: 'Search coloring books' })).toBeVisible({
    timeout: 15_000,
  });

  const path = await getFirstHrefMatching(page, /^\/coloring\/(?!new(?:[/?#]|$))[^/?#]+$/);
  if (path) return path;

  return requireFixtureOrSkip('No coloring book fixture found for the E2E account.');
};

const getColoringPagePath = async (page: Page, bookPath: string) => {
  const bookId = bookPath.replace(/^\/coloring\//, '').split(/[/?#]/)[0];
  const fixturePageId = process.env.E2E_COLORING_PAGE_ID?.trim();

  if (fixturePageId) {
    const fixturePagePath = `/coloring/${bookId}/pages/${fixturePageId}`;
    await page.goto(fixturePagePath);
    if (
      await page
        .getByRole('heading', { name: /^Page \d+$/ })
        .waitFor({ state: 'visible', timeout: 15_000 })
        .then(() => true)
        .catch(() => false)
    ) {
      return fixturePagePath;
    }
  }

  await page.goto(bookPath);
  await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible({ timeout: 15_000 });
  const pageLink = page.locator('a[href*="/pages/"]').first();
  if (!(await pageLink.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => false))) {
    return requireFixtureOrSkip(`No coloring page found for ${bookPath}.`);
  }

  const path = await getFirstHrefMatching(page, /^\/coloring\/[^/]+\/pages\/[^/?#]+$/);
  if (path) return path;

  return requireFixtureOrSkip(`No coloring page found for ${bookPath}.`);
};

test.describe('Authenticated page titles', () => {
  for (const route of authenticatedTitleRoutes) {
    test(`${route.path} has a specific document title`, async ({ page }) => {
      await page.goto(route.path);

      await expect(page).toHaveTitle(route.title);
    });
  }

  test('/projects/:id keeps record-specific title after detail data loads', async ({ page }) => {
    await page.goto(`/projects/${FIXTURE_PROJECT_ID}`);

    // Wait positively for the loaded "Details" heading, which auto-retries
    // through the transient "project not found" state the page renders before
    // the detail query resolves. Gating the skip on a race against that
    // transient (the prior waitForAnyVisible approach) made this test skip even
    // when the fixture exists. Only skip if the loaded state never arrives.
    const loadedIndicator = page.getByRole('heading', { name: 'Details' });
    const loaded = await loadedIndicator
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (!loaded) {
      requireFixtureOrSkip(
        `Fixture project ${FIXTURE_PROJECT_ID} not found; set E2E_FIXTURE_PROJECT_ID.`
      );
    }

    await expect(page).toHaveTitle(/\| Organized Glitter$/);
    await expect(page).not.toHaveTitle('Project details | Organized Glitter');
  });

  test('/coloring/:id keeps record-specific title after book data loads', async ({ page }) => {
    const bookPath = await ensureColoringBookPath(page);

    await page.goto(bookPath);
    await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible({ timeout: 15_000 });

    await expect(page).toHaveTitle(/\| Organized Glitter$/);
    await expect(page).not.toHaveTitle('Coloring book details | Organized Glitter');
  });

  test('/coloring/:bookId/pages/:pageId keeps record-specific title after page data loads', async ({
    page,
  }) => {
    const bookPath = await ensureColoringBookPath(page);
    const pagePath = await getColoringPagePath(page, bookPath);

    await page.goto(pagePath);
    await expect(page.getByRole('heading', { name: /^Page \d+$/ })).toBeVisible({
      timeout: 15_000,
    });

    await expect(page).toHaveTitle(/\| Organized Glitter$/);
    await expect(page).not.toHaveTitle('Coloring page details | Organized Glitter');
  });
});
