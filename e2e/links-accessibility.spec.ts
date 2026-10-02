import { test, expect, type Locator, type Page } from '@playwright/test';

import { createAxeBuilder } from './a11y/axe-test';

const tabUntilFocused = async (page: Page, locator: Locator, maxTabs = 12) => {
  for (let i = 0; i < maxTabs; i += 1) {
    await page.keyboard.press('Tab');
    if (await locator.evaluate(element => element === document.activeElement)) {
      return;
    }
  }

  await expect(locator).toBeFocused();
};

test.describe('Links page accessibility', () => {
  test('exposes card actions as keyboard-reachable links', async ({ page }) => {
    await page.goto('/links');

    await expect(page.locator('#root')).toHaveAttribute('data-app-ready', 'true');
    await expect(page.locator('#root')).not.toHaveAttribute('inert');

    const cardActions = page.getByTestId('links-page-card-actions');
    await expect(cardActions).toHaveCount(1);

    const links = cardActions.getByRole('link');
    const linkCount = await links.count();
    expect(linkCount).toBeGreaterThan(0);

    for (let index = 0; index < linkCount; index += 1) {
      const link = links.nth(index);
      await expect(link).toHaveAttribute('href', /^(https?:\/\/|mailto:|\/|#)/);
      await expect(link).toHaveAccessibleName(/\S/);
    }

    await expect(cardActions.getByRole('button')).toHaveCount(0);
    await expect(cardActions.locator('div[onclick], a button, button a')).toHaveCount(0);

    await tabUntilFocused(page, links.first());
    for (let index = 0; index < linkCount; index += 1) {
      await expect(links.nth(index)).toBeFocused();
      await page.keyboard.press('Tab');
    }
    await expect(page.getByRole('link', { name: /Follow on Instagram/i })).toBeFocused();

    const builder = await createAxeBuilder(page);
    const accessibilityScanResults = await builder
      .include('[data-testid="links-page-card-actions"]')
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
