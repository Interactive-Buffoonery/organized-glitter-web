import { expect, test, type Page, type TestInfo } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const artifactDir = path.join(rootDir, 'playwright-artifacts', 'randomizer-flow');

const escapedLabel = (label: string) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const setAccountTheme = async (page: Page, label: 'System' | 'Light' | 'Dark') => {
  await page.goto('/profile?tab=preferences');
  const themeGroup = page.getByRole('radiogroup', { name: 'Theme' });
  const option = themeGroup.getByRole('radio', { name: new RegExp(`^${escapedLabel(label)}\\b`) });
  await option.click();

  await expect(option).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 });
  if (label !== 'System') {
    await expect(page.locator('html')).toHaveAttribute('data-theme', label.toLowerCase(), {
      timeout: 10_000,
    });
  }
};

const captureStep = async (page: Page, testInfo: TestInfo, theme: string, step: string) => {
  const relativePath = path.join(testInfo.project.name, theme.toLowerCase(), `${step}.png`);
  const screenshotPath = path.join(artifactDir, relativePath);
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' });
  await testInfo.attach(`${theme} ${step}`, { path: screenshotPath, contentType: 'image/png' });
};

const waitForRandomizerReady = async (page: Page) => {
  await page.goto('/randomizer');
  await expect(page.getByRole('heading', { name: 'Randomizer' })).toBeVisible();
  await page.waitForFunction(
    () => !document.body.innerText.includes('Getting your collection ready...'),
    null,
    { timeout: 20_000 }
  );
};

const expectNoHorizontalOverflow = async (page: Page, label: string) => {
  const overflow = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return {
      body: document.body.scrollWidth,
      root: root.scrollWidth,
      viewport: window.innerWidth,
    };
  });

  expect(
    Math.max(overflow.body, overflow.root),
    `${label} should not overflow horizontally: ${JSON.stringify(overflow)}`
  ).toBeLessThanOrEqual(overflow.viewport + 1);
};

const runRandomizerFlow = async (page: Page, testInfo: TestInfo, theme: 'Light' | 'Dark') => {
  await setAccountTheme(page, theme);

  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', theme.toLowerCase());
  if (theme === 'Dark') {
    await expect(html).toHaveClass(/(^|\s)dark(\s|$)/);
  } else {
    await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/);
  }

  await waitForRandomizerReady(page);
  const categoryButton = page.getByRole('button', { name: 'Diamond paintings' });
  const emptyMessage = page.getByText('Nothing matches these filters.');
  const deselectAll = page.getByRole('button', { name: 'Deselect all', exact: true });
  const targetSelectorActions = deselectAll.locator('xpath=..');
  const selectAll = targetSelectorActions.getByRole('button', {
    name: 'Select all',
    exact: true,
  });
  const populatedWheel = page.getByRole('button', {
    name: /^Randomizer wheel with \d+ items$/i,
  });
  const spinButton = page.getByRole('button', {
    name: /^Spin$|Pick a book|Pick a page|Spin the wheel/i,
  });
  const noSelectionMessage = page.getByText(/Select items from the list or loosen the filters/i);

  await expect(categoryButton).toHaveAttribute('aria-pressed', 'true');

  await Promise.any([
    deselectAll.waitFor({ state: 'visible', timeout: 15_000 }),
    selectAll.waitFor({ state: 'visible', timeout: 15_000 }),
    emptyMessage.waitFor({ state: 'visible', timeout: 15_000 }),
  ]);

  if (await emptyMessage.isVisible()) {
    test.skip(true, 'The E2E account has no eligible randomizer targets.');
  }

  await expect(deselectAll).toBeVisible();
  await expect(selectAll).toBeVisible();
  await deselectAll.click();
  await expect(noSelectionMessage).toBeVisible();
  await captureStep(page, testInfo, theme, '01-initial-no-selection');
  await captureStep(page, testInfo, theme, '02-no-selection-disabled');

  await selectAll.click();
  await expect(populatedWheel).toBeVisible();
  await expect(spinButton).toBeEnabled();
  await captureStep(page, testInfo, theme, '03-all-selected-ready');

  await spinButton.click();
  await expect(page.getByRole('button', { name: /Spinning/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear result' })).toBeVisible({ timeout: 6_000 });
  await expect(page.getByText(/^Selected diamond painting$/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'View project' })).toBeVisible();
  await captureStep(page, testInfo, theme, '04-spin-result');

  const sectionSizeButton = page.getByRole('button', { name: 'Pick a section size' });
  if (await sectionSizeButton.isVisible()) {
    await sectionSizeButton.click();
    await expect(page.getByRole('heading', { name: 'Pick a section size' })).toBeVisible();
    await captureStep(page, testInfo, theme, '05-section-size-picker');

    const pickSizeButton = page.getByRole('button', { name: 'Pick size' });
    const missingDimensionsMessage = page.getByText('Add canvas dimensions to pick section sizes.');

    await Promise.any([
      pickSizeButton.waitFor({ state: 'visible', timeout: 10_000 }),
      missingDimensionsMessage.waitFor({ state: 'visible', timeout: 10_000 }),
    ]);

    if (await pickSizeButton.isVisible()) {
      await pickSizeButton.click();
      await expect(page.getByText(/\d+(?:\.\d+)? x \d+(?:\.\d+)? cm/)).toBeVisible({
        timeout: 10_000,
      });
      await captureStep(page, testInfo, theme, '06-section-size-result');
    } else {
      await expect(page.getByRole('link', { name: 'Edit project dimensions' })).toBeVisible();
      await captureStep(page, testInfo, theme, '06-section-size-dimensions-missing');
    }
  } else {
    await captureStep(page, testInfo, theme, '05-section-size-unavailable');
  }

  await page.getByRole('button', { name: 'Clear result' }).click();
  await expect(page.getByRole('button', { name: 'Clear result' })).toHaveCount(0);

  const coloringBooks = page.getByRole('button', { name: 'Coloring books' });
  if (await coloringBooks.isEnabled()) {
    await coloringBooks.click();
    await expect(coloringBooks).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Books', exact: true })).toBeVisible();
    await captureStep(page, testInfo, theme, '07-coloring-books-mode');

    const coloringEmptyMessage = page.getByText('Nothing matches these filters.');
    const coloringSelectAll = targetSelectorActions.getByRole('button', {
      name: 'Select all',
      exact: true,
    });
    await Promise.any([
      coloringSelectAll.waitFor({ state: 'visible', timeout: 15_000 }),
      coloringEmptyMessage.waitFor({ state: 'visible', timeout: 15_000 }),
    ]);

    if (await coloringSelectAll.isVisible()) {
      await coloringSelectAll.click();
      await expect(spinButton).toBeEnabled();
      await expect(populatedWheel).toBeVisible();
      await captureStep(page, testInfo, theme, '08-coloring-books-ready');

      await spinButton.click();
      await expect(page.getByRole('button', { name: /Spinning/ })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Clear result' })).toBeVisible({
        timeout: 6_000,
      });
      await expect(page.getByText(/^Selected coloring book$/)).toBeVisible();
      await expect(page.getByRole('link', { name: 'View book' })).toBeVisible();
      await captureStep(page, testInfo, theme, '09-coloring-book-result');

      const spinForPageButton = page.getByRole('button', { name: 'Spin for a page' });
      if (await spinForPageButton.isVisible()) {
        await captureStep(page, testInfo, theme, '10-coloring-book-page-picker');
      }
    }
  }

  await expectNoHorizontalOverflow(page, `Randomizer ${theme}`);
};

test.describe('Randomizer full flow', () => {
  test.use({ reducedMotion: 'reduce' });

  test.afterEach(async ({ page }) => {
    try {
      await setAccountTheme(page, 'System');
    } catch {
      // Preserve the original test failure if cleanup cannot reset the account.
    }
  });

  for (const theme of ['Light', 'Dark'] as const) {
    test(`spins and reviews the randomizer in ${theme.toLowerCase()} mode`, async ({
      page,
    }, testInfo) => {
      await runRandomizerFlow(page, testInfo, theme);
    });
  }
});
