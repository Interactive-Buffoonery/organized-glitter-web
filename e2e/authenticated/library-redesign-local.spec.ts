import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  for (const theme of ['light', 'dark']) {
    test(`library cards and filters at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: theme as 'light' | 'dark' });
      await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
      for (const craft of ['diamond', 'coloring']) {
        await page.goto(craft === 'diamond' ? '/dashboard' : '/coloring');
        await expect(page.getByTestId('library-page-heading')).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'Diamond paintings', exact: true })
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'Coloring books', exact: true })
        ).toBeVisible();
        const chips = page.getByRole('group', { name: 'Filter by status' });
        await expect(chips.getByRole('button', { name: /^All, \d+/ })).toBeVisible();
        await expect(chips.getByRole('button', { name: /Archived|Destashed/ })).toHaveCount(0);
        await expect(
          chips.getByRole('button', { name: /, 0$/ }).filter({ hasNotText: 'All' })
        ).toHaveCount(0);
        const createAction = page.getByRole('link', {
          name: craft === 'diamond' ? 'New kit' : 'New book',
          exact: true,
        });
        if (width < 640) await expect(createAction).toBeHidden();
        else await expect(createAction).toBeVisible();
        if (width < 640) {
          await page.getByRole('button', { name: /open filters|filters \(/i }).click();
          await expect(page.getByRole('dialog')).toBeVisible();
          await page
            .getByRole('dialog')
            .getByRole('button', { name: 'Close filters', exact: true })
            .last()
            .click();
          await expect(page.getByRole('dialog')).toBeHidden();
        }
        const available = chips.getByRole('button').filter({ hasNotText: /^All/ });
        if (await available.count()) {
          const chip = available.first();
          await chip.click();
          await expect(chip).toHaveAttribute('aria-pressed', 'true');
          await expect(page).toHaveURL(/status=/);
          await chips.getByRole('button', { name: /^All/ }).click();
        }
        await expect(
          page.getByRole('heading', {
            name: craft === 'diamond' ? 'Local Active Kit' : 'Local Garden Coloring Book',
            exact: true,
          })
        ).toBeVisible();
        const screenshotDir = process.env.E2E_LIBRARY_SCREENSHOTS;
        if (screenshotDir)
          await page.screenshot({
            path: `${screenshotDir}/${craft}-${width}-${theme}.png`,
            fullPage: true,
            animations: 'disabled',
          });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
        ).toBe(true);
      }
    });
  }
}
