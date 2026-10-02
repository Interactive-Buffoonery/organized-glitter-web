import { expect, test, type Page } from '@playwright/test';
import recovery from '../src/content/not-found.json' with { type: 'json' };

test('standalone recovery offers a readable, reachable way home', async ({ page }) => {
  await page.goto('/404.html');
  await expect(page.getByRole('heading', { level: 1, name: recovery.heading })).toBeVisible();
  const library = page.getByRole('link', { name: recovery.library.label, exact: true });
  await expect(library).toBeVisible();
  await expect(library).toHaveAttribute('href', '/dashboard');
  const home = page.getByRole('link', { name: recovery.home.label, exact: true });
  await expect(home).toBeVisible();
  await expect(home).toHaveAttribute('href', '/');
  const bounds = await home.boundingBox();
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await home.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('standalone recovery opens the library', async ({ page }) => {
  await page.goto('/404.html');
  await page.getByRole('link', { name: recovery.library.label, exact: true }).click();
  await expect(page).toHaveURL(/\/(dashboard|login)(?:[?#].*)?$/);
});

test('standalone recovery works without JavaScript in both appearances', async ({ browser }) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      colorScheme,
      viewport: { width: 320, height: 568 },
    });
    const page = await context.newPage();
    await page.goto('/404.html');
    await expect(page.getByRole('heading', { level: 1, name: recovery.heading })).toBeVisible();
    const home = page.getByRole('link', { name: recovery.home.label, exact: true });
    await expect(home).toBeInViewport();
    const library = page.getByRole('link', { name: recovery.library.label, exact: true });
    await expect(library).toBeInViewport();
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      colorScheme === 'dark' ? 'rgb(21, 21, 51)' : 'rgb(248, 232, 246)'
    );
    await home.click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/404.html');
    await library.click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await context.close();
  }
});

test('standalone recovery respects the saved appearance', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await page.goto('/404.html');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(21, 21, 51)');
});

test('keyboard follows the recovery actions', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Mobile Safari follows the device keyboard navigation preference.');
  await page.goto('/404.html');
  await page.keyboard.press('Tab');
  await expect(page.locator('header a[href="/"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: recovery.home.label, exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: recovery.library.label, exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/(dashboard|login)(?:[?#].*)?$/);
});

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

test('client keyboard recovery follows the main content focus path', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Mobile Safari follows the device keyboard navigation preference.');
  await openClientNotFound(page);
  const main = page.getByRole('main');
  await page.getByRole('link', { name: 'Skip to content', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(main).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(main.getByRole('link', { name: recovery.home.label, exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(main.getByRole('link', { name: recovery.library.label, exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/login(?:[?#].*)?$/);
});

test('unknown server URL returns the standalone recovery with HTTP 404', async ({ page }) => {
  const response = await page.goto('/this-route-does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.locator('main[data-error="page-not-found"]')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: recovery.heading })).toBeVisible();
  await page.getByRole('link', { name: recovery.home.label, exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});
