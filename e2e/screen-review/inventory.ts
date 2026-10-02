import type { Locator, Page } from '@playwright/test';
import { libraryPageHeading } from '../libraryPage';

export interface ScreenDefinition {
  id: string;
  title: string;
  path: string | ((page: Page) => Promise<string | null>);
  ready: (page: Page) => Locator;
  review: 'public' | 'authenticated';
  notes?: string;
}

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

// Seeded fixtures (scripts/seed-e2e-coloring-fixture.mjs and the prod demo
// project). Resolving by id avoids the dashboard href-discovery race that made
// these screens skip intermittently even when the fixture data existed.
const FIXTURE_PROJECT_ID = process.env.E2E_FIXTURE_PROJECT_ID?.trim() || 'n5zfnqdq3zzwso0';
const FIXTURE_COLORING_BOOK_ID = process.env.E2E_COLORING_BOOK_ID?.trim() || 'kgs059794affuba';

const isReachable = async (page: Page, path: string, ready: Locator) => {
  await page.goto(path);
  return ready.waitFor({ state: 'visible', timeout: 15_000 }).then(
    () => true,
    () => false
  );
};

const getDiamondProjectPath = async (page: Page) => {
  const fixturePath = `/projects/${FIXTURE_PROJECT_ID}`;
  if (await isReachable(page, fixturePath, page.getByRole('heading', { name: 'Details' }))) {
    return fixturePath;
  }

  await page.goto('/dashboard');
  await libraryPageHeading(page).waitFor({
    state: 'visible',
    timeout: 15_000,
  });

  const existingPath = await getFirstHrefMatching(page, /^\/projects\/(?!new(?:\/|$))[^/]+$/);
  if (existingPath) return existingPath;

  const listViewButton = page.getByRole('button', { name: 'List', exact: true }).first();
  if (await listViewButton.isVisible()) {
    await listViewButton.click();
    await page.getByRole('list', { name: 'Projects' }).waitFor({
      state: 'visible',
      timeout: 5_000,
    });
  }

  return getFirstHrefMatching(page, /^\/projects\/(?!new(?:\/|$))[^/]+$/);
};

const getDiamondProjectEditPath = async (page: Page) => {
  const projectPath = await getDiamondProjectPath(page);
  return projectPath ? `${projectPath}/edit` : null;
};

const getColoringBookPath = async (page: Page) => {
  const fixturePath = `/coloring/${FIXTURE_COLORING_BOOK_ID}`;
  if (await isReachable(page, fixturePath, page.getByRole('heading', { name: 'Pages' }))) {
    return fixturePath;
  }

  await page.goto('/dashboard?craft=coloring');
  await page.getByRole('searchbox', { name: 'Search coloring books' }).waitFor({
    state: 'visible',
    timeout: 15_000,
  });

  return getFirstHrefMatching(page, /^\/coloring\/(?!new(?:[/?#]|$))[^/?#]+$/);
};

const getColoringPagePath = async (page: Page) => {
  const bookPath = await getColoringBookPath(page);
  if (!bookPath) return null;

  await page.goto(bookPath);
  await page.getByRole('heading', { name: 'Pages' }).waitFor({ state: 'visible', timeout: 15_000 });

  return getFirstHrefMatching(page, /^\/coloring\/[^/]+\/pages\/[^/?#]+$/);
};

export const screenInventory: ScreenDefinition[] = [
  {
    id: 'home',
    title: 'Public home',
    path: '/',
    ready: page => page.getByRole('heading', { level: 1 }),
    review: 'public',
  },
  {
    id: 'links',
    title: 'Links page',
    path: '/links',
    ready: page => page.locator('.mobile-app-container .aurora-bg.site-header-safe-area'),
    review: 'public',
  },
  {
    id: 'overview',
    title: 'Overview',
    path: '/overview',
    ready: page => page.getByRole('heading', { name: /^Welcome back,/ }),
    review: 'authenticated',
  },
  {
    id: 'dashboard-diamond',
    title: 'Library: diamond paintings',
    path: '/dashboard',
    ready: libraryPageHeading,
    review: 'authenticated',
  },
  {
    id: 'dashboard-coloring',
    title: 'Library: coloring books',
    path: '/dashboard?craft=coloring',
    ready: page => page.getByRole('searchbox', { name: 'Search coloring books' }),
    review: 'authenticated',
  },
  {
    id: 'new-project',
    title: 'New diamond painting',
    path: '/projects/new',
    ready: page => page.getByRole('heading', { name: 'New project' }),
    review: 'authenticated',
  },
  {
    id: 'new-coloring-book',
    title: 'New coloring book',
    path: '/coloring/new',
    ready: page => page.getByRole('heading', { name: 'New coloring book' }),
    review: 'authenticated',
  },
  {
    id: 'project-detail',
    title: 'Project detail',
    path: getDiamondProjectPath,
    ready: page => page.getByRole('heading', { name: 'Details' }),
    review: 'authenticated',
    notes: 'Skipped when the E2E account has no diamond project fixture.',
  },
  {
    id: 'project-edit',
    title: 'Edit project',
    path: getDiamondProjectEditPath,
    ready: page => page.getByRole('button', { name: 'Update project' }),
    review: 'authenticated',
    notes: 'Skipped when the E2E account has no diamond project fixture.',
  },
  {
    id: 'coloring-book-detail',
    title: 'Coloring book detail',
    path: getColoringBookPath,
    ready: page => page.getByRole('heading', { name: 'Pages' }),
    review: 'authenticated',
    notes: 'Skipped when the E2E account has no coloring book fixture.',
  },
  {
    id: 'coloring-page-detail',
    title: 'Coloring page detail',
    path: getColoringPagePath,
    ready: page => page.getByRole('heading', { name: /^Page \d+$/ }),
    review: 'authenticated',
    notes: 'Skipped when the E2E account has no coloring page fixture.',
  },
  {
    id: 'randomizer',
    title: 'Randomizer',
    path: '/randomizer',
    ready: page => page.getByRole('heading', { name: 'Randomizer' }),
    review: 'authenticated',
  },
  {
    id: 'stats',
    title: 'Stats',
    path: '/stats',
    ready: page => page.getByRole('heading', { name: 'Stats' }),
    review: 'authenticated',
  },
  {
    id: 'profile',
    title: 'Profile and settings',
    path: '/profile',
    ready: page => page.getByRole('heading', { name: /profile & settings/i }),
    review: 'authenticated',
  },
  {
    id: 'profile-preferences',
    title: 'Profile preferences',
    path: '/profile?tab=preferences',
    ready: page => page.getByRole('tab', { name: 'Preferences', selected: true }),
    review: 'authenticated',
  },
  {
    id: 'options-publishers',
    title: 'Book publishers',
    path: '/options/publishers',
    ready: page => page.getByRole('heading', { name: 'Book Publisher Management' }),
    review: 'authenticated',
  },
  {
    id: 'options-illustrators',
    title: 'Book illustrators',
    path: '/options/illustrators',
    ready: page => page.getByRole('heading', { name: 'Book Illustrator Management' }),
    review: 'authenticated',
  },
  {
    id: 'options-coloring-mediums',
    title: 'Coloring mediums',
    path: '/options/coloring-mediums',
    ready: page => page.getByRole('heading', { name: 'Coloring medium management' }),
    review: 'authenticated',
  },
  {
    id: 'import',
    title: 'Import',
    path: '/import',
    ready: page => page.getByRole('heading', { level: 1 }),
    review: 'authenticated',
  },
];
