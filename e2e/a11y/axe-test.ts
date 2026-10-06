import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';

export { requireFixtureOrSkip } from '../fixtures/local-safety';

const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const;

interface AxeScanOptions {
  include?: string | string[];
  disableRules?: string[];
}

export const isAppRootOpaque = () => {
  const root = document.getElementById('root');
  if (root) return Number.parseFloat(getComputedStyle(root).opacity) >= 0.999;
  const staticPage = document.querySelector<HTMLElement>('[data-static-landing]');
  if (!staticPage?.querySelector('main#main-content')) return false;
  const style = getComputedStyle(staticPage);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    Number.parseFloat(style.opacity || '1') >= 0.999
  );
};

export async function waitForAccessibilityScanReady(page: Page) {
  await page.locator('#app-loading').waitFor({ state: 'detached', timeout: 20_000 });
  await page.waitForFunction(isAppRootOpaque, null, { timeout: 20_000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

export async function createAxeBuilder(page: Page, options: AxeScanOptions = {}) {
  await waitForAccessibilityScanReady(page);

  const builder = new AxeBuilder({ page }).withTags([...wcagTags]).exclude('#app-loading');

  const includes = Array.isArray(options.include)
    ? options.include
    : options.include
      ? [options.include]
      : [];

  includes.forEach(selector => builder.include(selector));

  if (options.disableRules?.length) {
    builder.disableRules(options.disableRules);
  }

  return builder;
}

export async function expectNoAxeViolations(page: Page, options: AxeScanOptions = {}) {
  const builder = await createAxeBuilder(page, options);
  const accessibilityScanResults = await builder.analyze();

  expect(accessibilityScanResults.violations).toEqual([]);
}

export async function expectNoStructuralAxeViolations(page: Page, options: AxeScanOptions = {}) {
  await expectNoAxeViolations(page, {
    ...options,
    disableRules: [...(options.disableRules ?? []), 'color-contrast'],
  });
}

export async function waitForAnyVisible(locators: Locator[], timeout: number) {
  const result = await Promise.any(
    locators.map(async locator => {
      await locator.waitFor({ state: 'visible', timeout });
      return locator;
    })
  ).catch((error: unknown) => error);

  if (result instanceof Error) {
    throw result;
  }
}

export const getFirstHrefMatching = async (page: Page, pattern: RegExp) =>
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

// Seeded coloring fixture (scripts/seed-e2e-coloring-fixture.mjs). Specs target
// it by id so they resolve a known-good record deterministically instead of
// racing dashboard href discovery, which timed out intermittently under load.
const DEFAULT_FIXTURE_COLORING_BOOK_ID = 'kgs059794affuba';
const FIXTURE_COLORING_BOOK_ID =
  process.env.E2E_COLORING_BOOK_ID?.trim() || DEFAULT_FIXTURE_COLORING_BOOK_ID;

/**
 * Resolve a coloring book detail path, preferring the seeded fixture book.
 * Navigates straight to the fixture and waits positively for the "Pages"
 * heading (auto-retrying through load), then falls back to dashboard discovery.
 * Returns the path, or null when no coloring book is reachable.
 */
export const fixtureColoringBookPath = async (page: Page): Promise<string | null> => {
  const fixturePath = `/coloring/${FIXTURE_COLORING_BOOK_ID}`;
  await page.goto(fixturePath);
  const loaded = await page
    .getByRole('heading', { name: 'Pages' })
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (loaded) return fixturePath;

  await page.goto('/dashboard?craft=coloring');
  await page
    .getByRole('searchbox', { name: 'Search coloring books' })
    .waitFor({ state: 'visible', timeout: 15_000 });
  return getFirstHrefMatching(page, /^\/coloring\/(?!new(?:[/?#]|$))[^/?#]+$/);
};

/**
 * Resolve a coloring page detail path under the given book. Prefer the seeded
 * page id when CI provides one, then scan rendered page links after the grid
 * finishes loading. Returns the path, or null when no page is reachable.
 */
export const fixtureColoringPagePath = async (
  page: Page,
  bookPath: string
): Promise<string | null> => {
  const bookId = bookPath.replace(/^\/coloring\//, '').split(/[/?#]/)[0];
  const fixturePageId = process.env.E2E_COLORING_PAGE_ID?.trim();

  if (fixturePageId) {
    const fixturePagePath = `/coloring/${bookId}/pages/${fixturePageId}`;
    await page.goto(fixturePagePath);
    const directLoaded = await page
      .getByRole('heading', { name: /^Page \d+$/ })
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (directLoaded) return fixturePagePath;
  }

  await page.goto(bookPath);
  await page.getByRole('heading', { name: 'Pages' }).waitFor({ state: 'visible', timeout: 15_000 });
  const pageLink = page.locator('a[href*="/pages/"]').first();
  if (!(await pageLink.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => false))) {
    return null;
  }

  return getFirstHrefMatching(page, /^\/coloring\/[^/]+\/pages\/[^/?#]+$/);
};

export const pressEscape = async (page: Page) => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
};
