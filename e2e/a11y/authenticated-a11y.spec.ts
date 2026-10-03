import { expect, test, type Page } from '@playwright/test';
import { libraryPageHeading } from '../libraryPage';

import {
  expectNoStructuralAxeViolations,
  fixtureColoringBookPath,
  fixtureColoringPagePath,
  requireFixtureOrSkip,
  waitForAnyVisible,
} from './axe-test';

const DEFAULT_FIXTURE_PROJECT_ID = 'n5zfnqdq3zzwso0';
const FIXTURE_PROJECT_ID = process.env.E2E_FIXTURE_PROJECT_ID?.trim() || DEFAULT_FIXTURE_PROJECT_ID;

const stableRoutes = [
  {
    path: '/overview',
    ready: (page: Page) => page.getByRole('heading', { name: /^Welcome back,/ }),
  },
  {
    path: '/dashboard',
    ready: libraryPageHeading,
  },
  {
    path: '/dashboard?craft=coloring',
    ready: (page: Page) => page.getByRole('searchbox', { name: 'Search coloring books' }),
  },
  {
    path: '/projects/new',
    ready: (page: Page) => page.getByRole('heading', { name: 'New project' }),
  },
  {
    path: '/projects/new?craft=coloring',
    ready: (page: Page) => page.getByRole('heading', { name: 'New coloring book' }),
  },
  {
    path: '/randomizer',
    ready: (page: Page) => page.getByRole('heading', { name: 'Randomizer' }),
  },
  {
    path: '/stats',
    ready: (page: Page) => page.getByRole('heading', { name: 'Stats' }),
  },
  {
    path: '/profile',
    ready: (page: Page) => page.getByRole('heading', { name: /profile & settings/i }),
  },
  {
    path: '/options/companies',
    ready: (page: Page) => page.getByRole('heading', { name: 'Company List' }),
  },
  {
    path: '/options/artists',
    ready: (page: Page) => page.getByRole('heading', { name: 'Artist List' }),
  },
  {
    path: '/options/tags',
    ready: (page: Page) => page.getByRole('heading', { name: 'Tag List' }),
  },
  {
    path: '/options/publishers',
    ready: (page: Page) => page.getByRole('heading', { name: 'Book Publisher Management' }),
  },
  {
    path: '/options/illustrators',
    ready: (page: Page) => page.getByRole('heading', { name: 'Book Illustrator Management' }),
  },
  {
    path: '/options/coloring-mediums',
    ready: (page: Page) => page.getByRole('heading', { name: 'Coloring medium management' }),
  },
];

const ensureColoringBookPath = async (page: Page) => {
  const path = await fixtureColoringBookPath(page);
  if (path) return path;

  return requireFixtureOrSkip('No coloring book fixture found for the E2E account.');
};

const getColoringPagePath = async (page: Page, bookPath: string) => {
  const path = await fixtureColoringPagePath(page, bookPath);
  if (!path) {
    return requireFixtureOrSkip(`No coloring page found for ${bookPath}.`);
  }

  return path;
};

test.describe('authenticated accessibility structural axe scans', () => {
  for (const route of stableRoutes) {
    test(`${route.path} has no non-contrast WCAG A/AA axe violations`, async ({ page }) => {
      await page.goto(route.path);
      await expect(route.ready(page)).toBeVisible({ timeout: 15_000 });

      await expectNoStructuralAxeViolations(page);
    });
  }

  test('/projects/:id has no non-contrast WCAG A/AA axe violations when fixture exists', async ({
    page,
  }) => {
    await page.goto(`/projects/${FIXTURE_PROJECT_ID}`);

    const notFoundHeading = page.getByRole('heading', { name: /project not found/i });
    const loadedIndicator = page.getByRole('heading', { name: 'Details' });
    await waitForAnyVisible([notFoundHeading, loadedIndicator], 15_000);

    if (await notFoundHeading.isVisible()) {
      requireFixtureOrSkip(
        `Fixture project ${FIXTURE_PROJECT_ID} not found; set E2E_FIXTURE_PROJECT_ID.`
      );
    }

    await expectNoStructuralAxeViolations(page);
  });

  test('/coloring/:id has no non-contrast WCAG A/AA axe violations when fixture exists', async ({
    page,
  }) => {
    const bookPath = await ensureColoringBookPath(page);

    await page.goto(bookPath);
    await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible({ timeout: 15_000 });

    await expectNoStructuralAxeViolations(page);
  });

  test('/coloring/:bookId/pages/:pageId has no non-contrast WCAG A/AA axe violations when fixture exists', async ({
    page,
  }) => {
    const bookPath = await ensureColoringBookPath(page);
    const pagePath = await getColoringPagePath(page, bookPath);

    await page.goto(pagePath);
    await expect(page.getByRole('heading', { name: /^Page \d+$/ })).toBeVisible({
      timeout: 15_000,
    });

    await expectNoStructuralAxeViolations(page);
  });
});
