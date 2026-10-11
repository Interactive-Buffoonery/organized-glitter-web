import { expect, test } from '@playwright/test';
import { assertLocalE2ETargets, requireFixtureOrSkip } from '../fixtures/local-safety';

const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const pocketBaseUrl = process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
const bookId = process.env.E2E_COLORING_BOOK_ID;
const pageId = process.env.E2E_COLORING_PAGE_ID;

test.describe('coloring detail request failures', () => {
  test.use({ serviceWorkers: 'block' });
  if (!bookId || !pageId) {
    requireFixtureOrSkip('Requires disposable coloring detail fixtures.');
  }

  test.beforeAll(() => {
    assertLocalE2ETargets({ appUrl, pocketBaseUrl, specName: 'Coloring detail errors' });
  });

  for (const detail of [
    { name: 'book', path: () => `/coloring/${bookId}`, collection: 'coloring_books' },
    {
      name: 'page',
      path: () => `/coloring/${bookId}/pages/${pageId}`,
      collection: 'coloring_pages',
    },
  ]) {
    test(`${detail.name} retries a server failure without losing the return filter`, async ({
      page,
    }, testInfo) => {
      if (detail.name === 'page') await page.clock.install();
      const routeId = detail.name === 'book' ? bookId : pageId;
      let allowSuccess = false;
      let intercepted = 0;
      await page.route(`**/api/collections/${detail.collection}/records/**`, async route => {
        if (!route.request().url().includes(`/records/${routeId}`)) {
          await route.continue();
          return;
        }
        intercepted += 1;
        if (!allowSuccess) {
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ code: 503, message: 'Service unavailable' }),
          });
          return;
        }
        await route.continue();
      });

      const returnTo = '/dashboard?craft=coloring&status=wishlist&page=3';
      const destination = `${detail.path()}?returnTo=${encodeURIComponent(returnTo)}`;
      await page.goto(destination);
      await expect.poll(() => intercepted).toBeGreaterThan(0);
      await expect(
        page.getByRole('heading', { name: `Could not load coloring ${detail.name}` })
      ).toBeVisible();
      if (detail.name === 'page') {
        await expect(page.getByRole('heading', { name: /^Page \d+$/ })).toHaveCount(0);
      }
      await expect(
        page.getByRole('heading', { name: `Coloring ${detail.name} not found` })
      ).toHaveCount(0);
      await testInfo.attach(`${detail.name}-failure`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      allowSuccess = true;
      await page.getByRole('button', { name: 'Try again' }).click();
      await expect(page).toHaveURL(
        new RegExp(encodeURIComponent(returnTo).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      );
      await expect(
        page.getByRole('heading', { name: `Could not load coloring ${detail.name}` })
      ).toHaveCount(0);
      if (detail.name === 'page') {
        await expect(page.getByRole('heading', { name: /^Page \d+$/ })).toBeVisible();
      }
      const backPath =
        detail.name === 'book'
          ? returnTo
          : `/coloring/${bookId}?returnTo=${encodeURIComponent(returnTo)}`;
      await expect(page.locator(`main a[href="${backPath}"]`).first()).toBeVisible();
      if (detail.name === 'page') {
        allowSuccess = false;
        await page.clock.setSystemTime(new Date(Date.now() + 6 * 60 * 1000));
        const failedRefresh = page.waitForResponse(
          response => response.url().includes(`/records/${pageId}`) && response.status() === 503
        );
        await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
        await failedRefresh;
        await expect(page.getByRole('heading', { name: /^Page \d+$/ })).toBeVisible();
        const refreshNotice = page.getByRole('alert').filter({
          hasText: 'Could not refresh coloring page. Showing the last loaded details.',
        });
        await expect(refreshNotice).toBeVisible();
        allowSuccess = true;
        await page.getByRole('button', { name: 'Try again' }).click();
        await expect(refreshNotice).toHaveCount(0);
        await expect(page.getByRole('heading', { name: /^Page \d+$/ })).toBeVisible();
        await expect(page.locator(`main a[href="${backPath}"]`).first()).toBeVisible();
        await expect(page).toHaveURL(url => url.searchParams.get('returnTo') === returnTo);
      }
      await testInfo.attach(`${detail.name}-recovered`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    });
  }

  for (const status of [403, 404]) {
    test(`background ${status} hides cached book details and keeps the edit draft`, async ({
      page,
    }) => {
      await page.clock.install();
      await page.goto(`/coloring/${bookId}`);
      await page.getByRole('button', { name: 'Edit coloring book' }).click();
      const editor = page.getByRole('dialog', { name: 'Edit coloring book' });
      await expect(editor).toBeVisible();
      const notes = `Preserved after background ${status}`;
      await editor.getByLabel('Notes').fill(notes);
      await page.waitForFunction(
        expected =>
          Object.keys(localStorage).some(
            key =>
              key.startsWith('og:form-draft:v1:') && localStorage.getItem(key)?.includes(expected)
          ),
        notes
      );

      const recordRoute = `**/api/collections/coloring_books/records/${bookId}*`;
      await page.route(recordRoute, route =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify({ code: status, message: 'Record unavailable' }),
        })
      );
      await page.clock.setSystemTime(new Date(Date.now() + 6 * 60 * 1000));
      const failedRefresh = page.waitForResponse(
        response => response.url().includes(`/records/${bookId}`) && response.status() === status
      );
      await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
      await failedRefresh;
      await expect(
        page.getByRole('heading', {
          name: status === 403 ? 'You cannot view this coloring book' : 'Coloring book not found',
        })
      ).toBeVisible();
      await expect(editor).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);

      await page.unroute(recordRoute);
      await page.reload();
      await page.getByRole('button', { name: 'Edit coloring book' }).click();
      await page.getByRole('button', { name: 'Restore draft' }).click();
      await expect(editor.getByLabel('Notes')).toHaveValue(notes);
    });
  }

  test('denied page hides cached details and does not offer retry', async ({ page }) => {
    await page.route(`**/api/collections/coloring_pages/records/${pageId}*`, async route => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ code: 403, message: 'Forbidden' }),
      });
    });

    await page.goto(`/coloring/${bookId}/pages/${pageId}`);

    await expect(
      page.getByRole('heading', { name: 'You cannot view this coloring page' })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Page \d+$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  });

  test('denied page list hides page details and navigation', async ({ page }) => {
    await page.route('**/api/collections/coloring_pages/records?*', async route => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ code: 403, message: 'Forbidden' }),
      });
    });

    const returnTo = '/dashboard?craft=coloring&status=wishlist&page=3';
    await page.goto(`/coloring/${bookId}/pages/${pageId}?returnTo=${encodeURIComponent(returnTo)}`);

    await expect(
      page.getByRole('heading', { name: 'You cannot view this coloring page' })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Page \d+$/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /previous coloring page/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /next coloring page/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Back to book' })).toHaveAttribute(
      'href',
      `/coloring/${bookId}?returnTo=${encodeURIComponent(returnTo)}`
    );
  });

  test('book page-list failure stays visible and retries in place', async ({ page }) => {
    let allowSuccess = false;
    await page.route('**/api/collections/coloring_pages/records?*', async route => {
      if (!allowSuccess) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 503, message: 'Service unavailable' }),
        });
        return;
      }
      await route.continue();
    });

    const returnTo = '/dashboard?craft=coloring&status=wishlist&page=3';
    await page.goto(`/coloring/${bookId}?returnTo=${encodeURIComponent(returnTo)}`);
    await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Could not load coloring book pages');
    await expect(page.getByText('0 pages', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Coloring book not found' })).toHaveCount(0);

    allowSuccess = true;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(
      page.getByRole('status').filter({ hasText: 'Coloring book pages loaded.' })
    ).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(encodeURIComponent(returnTo).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    );
    await expect(page.locator(`main a[href="${returnTo}"]`).first()).toBeVisible();
  });
});
