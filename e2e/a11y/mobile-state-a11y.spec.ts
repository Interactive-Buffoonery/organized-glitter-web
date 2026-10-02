import { expect, test } from '@playwright/test';
import { libraryPageHeading } from '../libraryPage';

import { expectNoStructuralAxeViolations, pressEscape, requireFixtureOrSkip } from './axe-test';

// Seeded by scripts/seed-e2e-randomizer-fixture.mjs. Mobile wheel key appears
// when more than six items are selected; these eight progress fixtures make
// that path deterministic for hosted a11y instead of relying on incidental data.
const DEFAULT_FIXTURE_RANDOMIZER_PROJECT_IDS = [
  '2s8feo1t3w4cwny',
  'gpi34djxp45vpve',
  'qkirrty89c0u2w9',
  '9y984d1znv4yju2',
  '9xt8wbkrd4s1p4k',
  'voljswe2ngmdaf8',
  'bp0z4t73q8orpt7',
  '51oedioebsc1o4t',
] as const;

const envRandomizerProjectIds = process.env.E2E_RANDOMIZER_PROJECT_IDS?.split(',')
  .map(id => id.trim())
  .filter(Boolean);

const FIXTURE_RANDOMIZER_PROJECT_IDS = (
  envRandomizerProjectIds?.length
    ? envRandomizerProjectIds
    : [...DEFAULT_FIXTURE_RANDOMIZER_PROJECT_IDS]
).slice(0, 8);

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

test.describe('mobile interactive accessibility states', () => {
  test('bottom add menu has no non-contrast WCAG A/AA axe violations', async ({ page }) => {
    await page.goto('/overview');
    await expect(page.getByRole('heading', { name: /^Welcome back,/ })).toBeVisible({
      timeout: 15_000,
    });

    const addButton = page.getByRole('button', { name: 'Add new item' });
    await expect(addButton).toBeVisible();
    await addButton.click();
    await expect(page.getByRole('menuitem', { name: /new/i }).first()).toBeVisible();
    await expectNoStructuralAxeViolations(page, { include: '[role="menu"]' });
    await pressEscape(page);
  });

  test('account menu has no non-contrast WCAG A/AA axe violations', async ({ page }) => {
    await page.goto('/overview');
    await expect(page.getByRole('heading', { name: /^Welcome back,/ })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: 'Open account menu' }).click();
    await expect(page.getByRole('heading', { name: 'Account menu' })).toBeVisible();
    await expectNoStructuralAxeViolations(page);
    await pressEscape(page);
  });

  test('dashboard filter drawer has no non-contrast WCAG A/AA axe violations', async ({ page }) => {
    await page.goto('/dashboard?craft=coloring');
    await expect(page.getByRole('searchbox', { name: 'Search coloring books' })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: /open filters|filters/i }).click();
    await expect(page.locator('h2:not(.sr-only)', { hasText: 'Filters' })).toBeVisible();
    await expectNoStructuralAxeViolations(page);
    await pressEscape(page);
  });

  test('dashboard sort drawer has no non-contrast WCAG A/AA axe violations', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(libraryPageHeading(page)).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: /sort projects/i }).click();
    await expect(page.locator('h2:not(.sr-only)', { hasText: 'Sort Projects' })).toBeVisible();
    await expectNoStructuralAxeViolations(page);
    await pressEscape(page);
  });

  test('randomizer wheel key has no non-contrast WCAG A/AA axe violations when fixture data exists', async ({
    page,
  }) => {
    if (FIXTURE_RANDOMIZER_PROJECT_IDS.length < 7) {
      requireFixtureOrSkip(
        'E2E_RANDOMIZER_PROJECT_IDS needs at least 7 progress project ids. Run scripts/seed-e2e-randomizer-fixture.mjs.'
      );
    }

    const items = FIXTURE_RANDOMIZER_PROJECT_IDS.join(',');
    await page.goto(`/randomizer?items=${items}&diamondStatus=progress`);
    await expect(page.getByRole('heading', { name: 'Randomizer' })).toBeVisible({
      timeout: 15_000,
    });

    const denseWheel = page.getByRole('button', {
      name: /randomizer wheel with ([7-9]|\d{2,}) items/i,
    });
    const wheelReady = await denseWheel
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!wheelReady) {
      requireFixtureOrSkip(
        'No randomizer wheel key found for the E2E account. Run scripts/seed-e2e-randomizer-fixture.mjs.'
      );
    }

    const wheelKeyButton = page.getByRole('button', { name: 'Open wheel key' });
    await expect(wheelKeyButton).toBeVisible({ timeout: 5_000 });
    await wheelKeyButton.click();
    await expect(page.getByRole('heading', { name: 'Wheel key' })).toBeVisible();
    await expectNoStructuralAxeViolations(page);
  });
});
