import { expect, test, type Page } from '@playwright/test';
import { libraryPageHeading } from '../libraryPage';

import {
  expectNoStructuralAxeViolations,
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
    path: '/projects/new',
    ready: (page: Page) => page.getByRole('heading', { name: 'New project' }),
  },
];

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
});
