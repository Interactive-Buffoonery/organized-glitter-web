import { expect, test, type Page } from '@playwright/test';
import recovery from '../src/content/not-found.json' with { type: 'json' };

async function openClientNotFound(page: Page) {
  await page.goto('/login');
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toBeVisible();
  await page.evaluate(() => {
    history.pushState(null, '', '/missing-client-page');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { level: 1, name: recovery.heading })).toBeVisible();
  await expect(page.locator('#main-content')).toBeVisible();
}

test('client recovery exposes shared actions and reaches both destinations', async ({ page }) => {
  await openClientNotFound(page);
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1, name: recovery.heading })).toBeVisible();
  const library = main.getByRole('link', { name: recovery.library.label, exact: true });
  await expect(library).toBeVisible();
  await expect(library).toHaveAttribute('href', recovery.library.href);
  const home = main.getByRole('link', { name: recovery.home.label, exact: true });
  await expect(home).toBeVisible();
  await expect(home).toHaveAttribute('href', recovery.home.href);
  await home.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await openClientNotFound(page);
  await main.getByRole('link', { name: recovery.library.label, exact: true }).click();
  await expect(page).toHaveURL(/\/login(?:[?#].*)?$/);
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toBeVisible();
});

test('unknown server URL returns the standalone recovery with HTTP 404', async ({ page }) => {
  const response = await page.goto('/this-route-does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.locator('main[data-error="page-not-found"]')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: recovery.heading })).toBeVisible();
  await page.getByRole('link', { name: recovery.home.label, exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});
