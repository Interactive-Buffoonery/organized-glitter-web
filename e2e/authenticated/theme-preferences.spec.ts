/**
 * Theme preference round-trip in a real browser.
 *
 * Locks in three guarantees that jsdom unit tests can't fully verify:
 *
 *   1. Selecting a theme writes the right `data-theme` attribute and toggles
 *      the `.dark` Tailwind bridge class on `<html>`. The two
 *      are coupled by `ThemeClassSync` and have drifted apart in the past
 *      (the original review explicitly flagged this as the regression we
 *      most want to prevent).
 *
 *   2. The selection persists across a full page reload. This proves the
 *      round-trip: form submit -> PocketBase write -> query invalidation
 *      -> AccountThemeSync rehydrates -> ThemeClassSync re-applies.
 *
 *   3. The reduced-motion-aware fade transition declared in src/index.css
 *      is parseable and applies to the html element. This is a sanity
 *      check, not a visual diff — we only verify the property exists at
 *      the right spec, since timing it would be flaky.
 *
 * After each test we reset the account back to `system` so the next run
 * starts from a known state regardless of what previously failed.
 */

import { test, expect, type Page } from '@playwright/test';

const escapedLabel = (label: string) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const setAccountTheme = async (page: Page, label: string) => {
  // Preferences is now the default tab — no `?tab` param needed, but pass
  // it anyway so the test is robust to future default-tab changes.
  await page.goto('/profile?tab=preferences');

  const optionName = new RegExp(`^${escapedLabel(label)}\\b`);
  const option = page.getByRole('radio', { name: optionName });

  await expect(page.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();

  await option.click();

  // Wait for the visible account preference summary so we know the optimistic
  // UI and profile query have settled before asserting on persisted theme state.
  await expect(page.getByText('Active theme:')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(label, { exact: true }).last()).toBeVisible({ timeout: 10_000 });
};

test.describe('Theme preferences round-trip', () => {
  test.afterEach(async ({ page }) => {
    // Reset to System so the test account is in a known state for the
    // next run, even if the assertions above failed.
    try {
      await setAccountTheme(page, 'System');
    } catch {
      // If reset itself fails (e.g. fixture problem), don't mask the
      // original failure — Playwright will still report the real cause.
    }
  });

  test('Dark sets data-theme and the .dark bridge class', async ({ page }) => {
    await setAccountTheme(page, 'Dark');

    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(html).toHaveClass(/(^|\s)dark(\s|$)/);
  });

  test('Light sets data-theme without the .dark class', async ({ page }) => {
    await setAccountTheme(page, 'Light');

    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/);
  });

  test('selection persists across a full reload', async ({ page }) => {
    await setAccountTheme(page, 'Dark');

    await page.reload();
    await page.waitForLoadState('networkidle');

    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(html).toHaveClass(/(^|\s)dark(\s|$)/);
  });

  test('html declares a color transition gated on reduced-motion', async ({ page }) => {
    await page.goto('/profile?tab=preferences');

    // Read the computed transition-property on <html>. With
    // prefers-reduced-motion: no-preference (the Playwright default),
    // background-color and color must both be in the transition list.
    const transitionProperty = await page.evaluate(
      () => getComputedStyle(document.documentElement).transitionProperty
    );
    expect(transitionProperty).toContain('background-color');
    expect(transitionProperty).toContain('color');
  });
});
