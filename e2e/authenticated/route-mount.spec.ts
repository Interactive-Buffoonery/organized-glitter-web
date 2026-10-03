/**
 * Authenticated route-mount sweep.
 *
 * For every route a logged-in user can reach, this test navigates to it in a
 * real Chromium browser and asserts:
 *
 *   1. The page reaches a known "loaded" indicator (a heading or link
 *      specific to that route) — proves routing + lazy chunks + data
 *      hydrated.
 *   2. No console.error fires during load (filtered for known benign
 *      third-party noise).
 *   3. No "Maximum update depth exceeded" or "Too many re-renders" log
 *      sneaked through (catches a BUG-1 style regression even if the
 *      error boundary swallows the visible crash).
 *   4. No error-boundary fallback text is on screen.
 *
 * This is the real-browser companion to the jsdom mount-smoke tests under
 * `src/pages/__tests__/*-mount-smoke.test.tsx`. Browsers catch what jsdom
 * can't (layout-dependent CSS, real event timing, service worker reg,
 * real network fetches against prod PocketBase).
 *
 * Routes that need a specific project ID use FIXTURE_PROJECT_ID below.
 * Managed local runs require that fixture; hosted runs skip fixture-specific
 * checks when it is unavailable.
 *
 * Coloring routes discover a book and page from the E2E account UI. If the
 * E2E account has no coloring data, managed runs fail while hosted runs skip
 * rather than mutating the shared backend.
 */

import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { requireFixtureOrSkip } from '../fixtures/local-safety';
import { libraryPageHeading } from '../libraryPage';

// Known seed rows, overridden by the disposable harness when it manages fixtures.
const DEFAULT_FIXTURE_PROJECT_ID = 'n5zfnqdq3zzwso0';
const FIXTURE_PROJECT_ID = process.env.E2E_FIXTURE_PROJECT_ID?.trim() || DEFAULT_FIXTURE_PROJECT_ID;
const DEFAULT_FIXTURE_COLORING_BOOK_ID = 'kgs059794affuba';
const FIXTURE_COLORING_BOOK_ID =
  process.env.E2E_COLORING_BOOK_ID?.trim() || DEFAULT_FIXTURE_COLORING_BOOK_ID;

// Console noise we don't control and don't want to assert on.
const IGNORABLE_CONSOLE_PATTERNS: RegExp[] = [
  /us\.i\.posthog\.com/,
  /ERR_CONNECTION_REFUSED.*posthog/i,
  /^Failed to load resource: net::ERR_NETWORK_CHANGED$/,
  /Failed to load resource.*posthog/i,
  // The NotFound route intentionally logs a 404 for telemetry; StrictMode
  // double-invocation in dev fires it twice. Not a real error.
  /User attempted to access non-existent route/,
  // React Query logs retryable PocketBase blips before the retry path settles.
  /\[ColoringTagService\]\s+Error loading coloring tags: .*ClientResponseError 0:/s,
  /\[QueryClient\]\s+Unknown error - allowing retry:/,
];

// Known render-loop signatures that SHOULD fail the test even if they
// appear in console.error rather than as a page crash.
const RENDER_LOOP_PATTERNS: RegExp[] = [/Maximum update depth exceeded/, /Too many re-renders/];

// Error-boundary fallback UI strings used in this repo.
const ERROR_BOUNDARY_PATTERNS = {
  headline: /something went wrong/i,
  body: /there was an error loading/i,
};

interface ConsoleCapture {
  errors: string[];
  loopMatches: string[];
}

const captureConsole = (page: Page): ConsoleCapture => {
  const errors: string[] = [];
  const loopMatches: string[] = [];

  page.on('console', (msg: ConsoleMessage) => {
    const text = msg.text();
    if (RENDER_LOOP_PATTERNS.some(p => p.test(text))) {
      loopMatches.push(text);
    }
    if (msg.type() === 'error') {
      errors.push(text);
    }
  });

  page.on('pageerror', (err: Error) => {
    if (RENDER_LOOP_PATTERNS.some(p => p.test(err.message))) {
      loopMatches.push(`pageerror: ${err.message}`);
    }
    errors.push(`pageerror: ${err.message}`);
  });

  return { errors, loopMatches };
};

const assertClean = async (page: Page, capture: ConsoleCapture, routeLabel: string) => {
  // Render-loop errors are the most important signal — always fail on them.
  expect(
    capture.loopMatches,
    `Render-loop signature detected on ${routeLabel}:\n${capture.loopMatches.join('\n')}`
  ).toHaveLength(0);

  // Error-boundary fallback UI visible in the rendered page is a crash.
  // innerText is layout-aware, so hidden pre-React shell text in index.html
  // does not look like a rendered error boundary.
  const visibleText = await page.locator('body').innerText();
  expect(visibleText, `Error boundary headline is visible on ${routeLabel}`).not.toMatch(
    ERROR_BOUNDARY_PATTERNS.headline
  );
  expect(visibleText, `Error boundary body text is visible on ${routeLabel}`).not.toMatch(
    ERROR_BOUNDARY_PATTERNS.body
  );

  // Only after the above checks: filter generic console.errors for noise
  // and assert the rest are empty. This is least important, most flaky.
  const realErrors = capture.errors.filter(
    text => !IGNORABLE_CONSOLE_PATTERNS.some(p => p.test(text))
  );
  expect(
    realErrors,
    `Unexpected console errors on ${routeLabel}:\n${realErrors.join('\n')}`
  ).toHaveLength(0);
};

const waitForAnyVisible = async (locators: Locator[], timeout: number) => {
  const result = await Promise.any(
    locators.map(async locator => {
      await locator.waitFor({ state: 'visible', timeout });
      return locator;
    })
  ).catch((error: unknown) => error);

  if (result instanceof Error) {
    throw result;
  }
};

const getFirstHrefMatching = async (page: Page, pattern: RegExp) =>
  page.evaluate(source => {
    const pattern = new RegExp(source);
    return (
      Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
        .map(anchor => {
          try {
            return new URL(anchor.href, window.location.origin).pathname;
          } catch {
            return anchor.getAttribute('href') ?? '';
          }
        })
        .find(path => pattern.test(path)) ?? null
    );
  }, pattern.source);

const ensureColoringBookPath = async (
  page: Page
): Promise<{ bookPath: string; pagePath?: string }> => {
  // Prefer the seeded fixture book by id so this resolves deterministically
  // instead of racing dashboard href discovery under load.
  const fixturePath = `/coloring/${FIXTURE_COLORING_BOOK_ID}`;
  await page.goto(fixturePath);
  const fixtureLoaded = await page
    .getByRole('heading', { name: 'Pages' })
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (fixtureLoaded) return { bookPath: fixturePath };

  await page.goto('/dashboard?craft=coloring');
  await expect(page.getByRole('searchbox', { name: 'Search coloring books' })).toBeVisible({
    timeout: 15_000,
  });

  const path = await getFirstHrefMatching(page, /^\/coloring\/(?!new(?:[/?#]|$))[^/?#]+$/);
  if (path) return { bookPath: path };

  return requireFixtureOrSkip('No coloring book fixture found for the E2E account.');
};

const getColoringPagePath = async (page: Page, bookPath: string): Promise<string> => {
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
  if (!path) {
    return requireFixtureOrSkip(`No coloring page found for ${bookPath}.`);
  }

  return path;
};

test.describe('Authenticated route mount sweep', () => {
  test('/dashboard loads', async ({ page }) => {
    const capture = captureConsole(page);
    await page.goto('/dashboard');
    await expect(libraryPageHeading(page)).toBeVisible();
    await assertClean(page, capture, '/dashboard');
  });

  test('/overview loads (post-login default destination)', async ({ page }) => {
    const capture = captureConsole(page);
    await page.goto('/overview');
    // The Overview welcome heading starts with "Welcome back, <username>".
    // /overview is the documented post-login landing page
    // (DEFAULT_AUTH_REDIRECT in src/utils/auth/redirects.ts).
    await expect(page.getByRole('heading', { name: /^Welcome back,/ })).toBeVisible();
    await assertClean(page, capture, '/overview');
  });

  test('/projects/new loads (BUG-1 reproducer in a real browser)', async ({ page }) => {
    const capture = captureConsole(page);
    await page.goto('/projects/new');
    await expect(page.getByRole('heading', { name: 'New project' })).toBeVisible();
    // Tags section (the BUG-1 surface) must render interactively.
    await expect(page.getByRole('button', { name: /add tag/i })).toBeVisible();
    await assertClean(page, capture, '/projects/new');
  });

  test('/coloring redirects to the coloring dashboard', async ({ page }) => {
    const capture = captureConsole(page);
    await page.goto('/coloring');
    await expect(page).toHaveURL(/\/dashboard\?craft=coloring/);
    await expect(page.getByRole('searchbox', { name: 'Search coloring books' })).toBeVisible();
    await assertClean(page, capture, '/coloring');
  });

  test('/coloring/new loads', async ({ page }) => {
    const capture = captureConsole(page);
    await page.goto('/coloring/new');
    await expect(page.getByRole('heading', { name: 'New coloring book' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add book' }).last()).toBeVisible();
    await assertClean(page, capture, '/coloring/new');
  });

  test('/coloring/:id loads', async ({ page }) => {
    const { bookPath } = await ensureColoringBookPath(page);
    const capture = captureConsole(page);

    await page.goto(bookPath);
    await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'More actions' })).toBeVisible();
    await assertClean(page, capture, bookPath);
  });

  test('/coloring/:id/edit loads', async ({ page }) => {
    const { bookPath } = await ensureColoringBookPath(page);
    const editPath = `${bookPath}/edit`;
    const capture = captureConsole(page);

    await page.goto(editPath);
    await expect(page.getByRole('button', { name: 'Update book' }).last()).toBeVisible();
    await assertClean(page, capture, editPath);
  });

  test('/coloring/:bookId/pages/:pageId loads', async ({ page }) => {
    const { bookPath, pagePath: createdPagePath } = await ensureColoringBookPath(page);
    const pagePath = createdPagePath ?? (await getColoringPagePath(page, bookPath));
    const capture = captureConsole(page);

    await page.goto(pagePath);
    await expect(page.getByRole('heading', { name: /^Page \d+$/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible();
    await expect(page.getByRole('button', { name: /add (a photo|photos)/i })).toBeVisible();
    await assertClean(page, capture, pagePath);
  });

  test('/projects/:id loads', async ({ page }) => {
    const capture = captureConsole(page);
    await page.goto(`/projects/${FIXTURE_PROJECT_ID}`);

    // These are client-side routes served by the Vite dev server, so
    // navigation always returns 200 (the SPA shell) even when the project
    // record is missing. Wait positively for the loaded "Details" heading,
    // which auto-retries through the transient "project not found" state the
    // page renders before the detail query resolves; only skip if the loaded
    // state never arrives.
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

    await assertClean(page, capture, `/projects/${FIXTURE_PROJECT_ID}`);
  });

  test('/projects/:id/edit loads', async ({ page }) => {
    const capture = captureConsole(page);
    await page.goto(`/projects/${FIXTURE_PROJECT_ID}/edit`);

    // Same SPA-shell-returns-200 caveat as /projects/:id above. Wait positively
    // for the loaded edit form (the "Update project" button) instead of racing
    // the transient not-found state; only skip if it never arrives.
    const editIndicator = page.getByRole('button', { name: 'Update project' });
    const loaded = await editIndicator
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (!loaded) {
      requireFixtureOrSkip(
        `Fixture project ${FIXTURE_PROJECT_ID} not found; set E2E_FIXTURE_PROJECT_ID.`
      );
    }

    await expect(editIndicator).toBeVisible();
    // Populated form indicator.
    await expect(page.getByRole('textbox', { name: 'Project title' })).toBeVisible();
    await assertClean(page, capture, `/projects/${FIXTURE_PROJECT_ID}/edit`);
  });

  test('/randomizer loads with the wheel', async ({ page }) => {
    const capture = captureConsole(page);
    await page.goto('/randomizer');
    await expect(page.getByRole('heading', { name: 'Randomizer' })).toBeVisible();
    const populatedWheel = page.getByRole('button', {
      name: /^Randomizer wheel with \d+ items$/i,
    });
    const emptyWheel = page.getByRole('img', { name: 'Empty randomizer wheel' });
    await waitForAnyVisible([populatedWheel, emptyWheel], 10_000);
    await assertClean(page, capture, '/randomizer');
  });

  test('/stats loads', async ({ page }) => {
    const capture = captureConsole(page);
    await page.goto('/stats');
    await expect(page.getByRole('heading', { name: 'Stats' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Craft scope' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'All crafts', pressed: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Diamond paintings' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Coloring' })).toBeVisible();
    await assertClean(page, capture, '/stats');
  });

  test('/profile loads with all profile tabs', async ({ page }) => {
    const capture = captureConsole(page);
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: /profile & settings/i })).toBeVisible();
    for (const name of ['Data', 'Preferences']) {
      await expect(page.getByRole('tab', { name })).toBeVisible();
    }
    const mobileMenu = page.getByRole('button', { name: 'Open account menu', exact: true });
    if (await mobileMenu.isVisible()) {
      await mobileMenu.click();
    }
    await expect(page.getByRole('link', { name: 'Manage Lists' })).toBeVisible();
    await assertClean(page, capture, '/profile');
  });

  test('/profile?tab=preferences deep-links correctly', async ({ page }) => {
    const capture = captureConsole(page);
    await page.goto('/profile?tab=preferences');
    await expect(page.getByRole('tab', { name: 'Preferences', selected: true })).toBeVisible();
    await assertClean(page, capture, '/profile?tab=preferences');
  });

  test('/options/publishers loads', async ({ page }) => {
    const capture = captureConsole(page);
    await page.goto('/options/publishers');
    await expect(page.getByRole('heading', { name: 'Book Publisher Management' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add publisher' })).toBeVisible();
    await assertClean(page, capture, '/options/publishers');
  });

  test('/options/illustrators loads', async ({ page }) => {
    const capture = captureConsole(page);
    await page.goto('/options/illustrators');
    await expect(page.getByRole('heading', { name: 'Book Illustrator Management' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add illustrator' })).toBeVisible();
    await assertClean(page, capture, '/options/illustrators');
  });

  test('/options/coloring-mediums loads', async ({ page }) => {
    const capture = captureConsole(page);
    await page.goto('/options/coloring-mediums');
    await expect(page.getByRole('heading', { name: 'Coloring medium management' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add coloring medium' })).toBeVisible();
    await assertClean(page, capture, '/options/coloring-mediums');
  });

  test('/import loads', async ({ page }) => {
    const capture = captureConsole(page);
    await page.goto('/import');
    // Any of the well-known copy on the import page.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await assertClean(page, capture, '/import');
  });
});
