import { devices, expect, test, type Locator, type Page } from '@playwright/test';

import { waitForAccessibilityScanReady } from '../a11y/axe-test';
import { libraryPageHeading } from '../libraryPage';

// Use a real mobile Chromium profile so (pointer: coarse) / (hover: none) stay
// aligned with the Tailwind pointer-coarse:* classes that lift controls to 44px.
test.use({
  ...devices['Pixel 5'],
});

const MIN_TOUCH_PX = 44;

/**
 * Wait until splash/fonts/layout are settled and coarse-pointer media matches.
 * INT-1057: one-shot boundingBox reads after toBeVisible raced layout under
 * full-suite contention (first attempt ~1.5s fail, retry ~4.2s pass).
 */
const waitForMobileTouchLayoutReady = async (page: Page) => {
  await waitForAccessibilityScanReady(page);

  await page.waitForFunction(
    () =>
      window.matchMedia('(pointer: coarse)').matches && window.matchMedia('(hover: none)').matches,
    null,
    { timeout: 10_000 }
  );

  // useMobileDevice starts as desktop and flips in an effect. Bottom nav is a
  // reliable signal that mobile chrome has committed before size asserts.
  await expect(page.getByRole('navigation', { name: 'Bottom navigation' })).toBeVisible({
    timeout: 10_000,
  });
};

const expectTouchTarget = async (locator: Locator, label: string) => {
  await expect(locator, label).toBeVisible({ timeout: 10_000 });

  // Poll until the box is stable at the coarse-pointer minimum. Keeps the 44px
  // contract; does not inflate timeouts blindly or drop the assertion.
  await expect(async () => {
    const first = await locator.boundingBox();
    expect(first, `${label} has a bounding box`).not.toBeNull();

    await locator.page().evaluate(
      () =>
        new Promise<void>(resolve => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        })
    );

    const second = await locator.boundingBox();
    expect(second, `${label} still has a bounding box`).not.toBeNull();

    expect(
      Math.abs(first!.width - second!.width),
      `${label} width settled between frames`
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(first!.height - second!.height),
      `${label} height settled between frames`
    ).toBeLessThanOrEqual(1);

    expect(second!.width, `${label} is at least ${MIN_TOUCH_PX}px wide`).toBeGreaterThanOrEqual(
      MIN_TOUCH_PX
    );
    expect(second!.height, `${label} is at least ${MIN_TOUCH_PX}px tall`).toBeGreaterThanOrEqual(
      MIN_TOUCH_PX
    );
  }).toPass({ timeout: 10_000, intervals: [50, 100, 250, 500] });
};

const expectNoHorizontalOverflow = async (pageLabel: string, page: Page) => {
  const hasOverflow = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return (
      root.scrollWidth > window.innerWidth + 1 || document.body.scrollWidth > window.innerWidth + 1
    );
  });
  expect(hasOverflow, `${pageLabel} has no app-caused horizontal overflow`).toBe(false);
};

const readBottomNavPosition = async (page: Page) => {
  return page.getByRole('navigation', { name: 'Bottom navigation' }).evaluate(nav => {
    const rect = nav.getBoundingClientRect();
    const root = document.scrollingElement ?? document.documentElement;
    const appContainer = document.querySelector<HTMLElement>('.mobile-app-container');

    return {
      bottom: rect.bottom,
      innerHeight: window.innerHeight,
      scrollTop: root.scrollTop,
      appScrollTop: appContainer?.scrollTop ?? 0,
    };
  });
};

const expectBottomNavAnchored = async (page: Page) => {
  await waitForMobileTouchLayoutReady(page);
  const nav = page.getByRole('navigation', { name: 'Bottom navigation' });
  await expect(nav).toBeVisible({ timeout: 10_000 });

  await page.evaluate(() => window.scrollTo(0, 0));
  const atTop = await readBottomNavPosition(page);

  const scrollTarget = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return Math.max(0, Math.floor((root.scrollHeight - window.innerHeight) / 2));
  });
  test.skip(scrollTarget === 0, 'page too short to verify bottom nav scroll anchoring');

  await page.evaluate(y => window.scrollTo(0, y), scrollTarget);
  const midScroll = await readBottomNavPosition(page);

  expect(
    Math.abs(atTop.bottom - atTop.innerHeight),
    'bottom nav aligns at top'
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(midScroll.bottom - midScroll.innerHeight),
    'bottom nav aligns after scroll'
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(midScroll.bottom - atTop.bottom),
    'bottom nav position is invariant while scrolling'
  ).toBeLessThanOrEqual(1);
  expect(midScroll.appScrollTop, 'app shell is not the scroll container').toBe(0);
};

test.describe('mobile touch targets', () => {
  test('bottom nav remains anchored during scroll', async ({ page }) => {
    await page.goto('/overview');
    await expectBottomNavAnchored(page);
  });

  test('key mobile controls meet coarse-pointer sizing', async ({ page }) => {
    await page.goto('/overview');
    await waitForMobileTouchLayoutReady(page);
    await expectTouchTarget(page.getByRole('button', { name: 'Account menu' }), 'account menu');
    await expectNoHorizontalOverflow('/overview', page);

    await page.goto('/dashboard');
    await waitForMobileTouchLayoutReady(page);
    await expect(libraryPageHeading(page)).toBeVisible();
    await expectTouchTarget(
      page.getByRole('button', { name: 'Diamond paintings' }),
      'dashboard diamond craft selector'
    );
    await expectTouchTarget(
      page.getByRole('button', { name: 'Coloring books' }),
      'dashboard coloring craft selector'
    );
    await expectNoHorizontalOverflow('/dashboard', page);

    await page.goto('/dashboard?craft=coloring');
    await waitForMobileTouchLayoutReady(page);
    await expectTouchTarget(
      page.getByRole('searchbox', { name: 'Search coloring books' }),
      'coloring search'
    );
    await expectTouchTarget(page.getByRole('combobox', { name: 'Sort by' }), 'coloring sort');
    await expectTouchTarget(
      page.getByRole('button', { name: /switch to (ascending|descending)/i }),
      'coloring sort direction'
    );
    await expectTouchTarget(page.getByRole('button', { name: /open filters|filters/i }), 'filters');
    await expectNoHorizontalOverflow('/dashboard?craft=coloring', page);

    await page.goto('/randomizer');
    await waitForMobileTouchLayoutReady(page);
    await expect(page.getByRole('heading', { name: 'Randomizer' })).toBeVisible();
    for (const name of ['Diamond paintings', 'Coloring books', 'Coloring pages']) {
      const button = page.getByRole('button', { name, exact: true });
      await expectTouchTarget(button, `randomizer ${name} craft selector`);

      const hasTextOverflow = await button.evaluate(element => {
        return (
          element.scrollWidth > element.clientWidth + 1 ||
          element.scrollHeight > element.clientHeight + 1
        );
      });

      expect(hasTextOverflow, `${name} fits inside its segment`).toBe(false);
    }
    await expectTouchTarget(
      page.getByRole('button', { name: /in progress/i }).first(),
      'randomizer status chip'
    );
    await expectNoHorizontalOverflow('/randomizer', page);

    await page.goto('/profile');
    await waitForMobileTouchLayoutReady(page);
    await expect(page.getByRole('heading', { name: /profile & settings/i })).toBeVisible();
    await expectTouchTarget(page.getByRole('tab', { name: 'Preferences' }), 'profile tab');
    await expectNoHorizontalOverflow('/profile', page);

    await page.goto('/projects/new?craft=coloring');
    await waitForMobileTouchLayoutReady(page);
    await expect(page.getByRole('heading', { name: 'New coloring book' })).toBeVisible();
    await expectTouchTarget(
      page.getByRole('button', { name: 'Add book' }).last(),
      'form submit tray'
    );
    await expectTouchTarget(
      page.getByRole('button', { name: 'Cancel' }).last(),
      'form cancel tray'
    );
    await expectNoHorizontalOverflow('/projects/new?craft=coloring', page);

    await page.goto('/overview');
    await waitForMobileTouchLayoutReady(page);
    const addButton = page.getByRole('button', { name: 'Add new item' });
    await expectTouchTarget(addButton, 'bottom nav add action');
    await addButton.click();
    await expectTouchTarget(
      page.getByRole('menuitem', { name: 'New diamond painting' }),
      'add menu diamond action'
    );
    await expectTouchTarget(
      page.getByRole('menuitem', { name: 'New coloring book' }),
      'add menu coloring action'
    );
  });
});
