import { expect, test, type Page } from '@playwright/test';
import PocketBase from 'pocketbase';
import { randomUUID } from 'node:crypto';

import { assertLocalE2ETargets } from '../fixtures/local-safety';

const pocketBaseUrl = process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

interface ColoringBookRecord {
  id: string;
  title: string;
  total_pages: number;
}

interface ColoringPageRecord {
  id: string;
  page_number: number;
  started_at: string;
}

const startedField = (page: Page) => page.locator('div.space-y-2:has(#coloring-page-started-at)');

const hasColoringBookDraft = (page: Page, title: string) =>
  page.evaluate(expected => {
    return Object.keys(localStorage).some(key => {
      if (!key.startsWith('og:form-draft:v1:') || !key.endsWith(':coloring-book-new:new')) {
        return false;
      }
      try {
        const draft = JSON.parse(localStorage.getItem(key) ?? 'null') as {
          values?: { fields?: { title?: string } };
        } | null;
        return draft?.values?.fields?.title === expected;
      } catch {
        return false;
      }
    });
  }, title);

test.describe('coloring book UI creation', () => {
  test.use({ serviceWorkers: 'block' });

  const title = `Browser QA coloring book ${randomUUID()}`;
  let pb: PocketBase | undefined;
  let userId = '';
  let bookId: string | null = null;

  test.beforeAll(async () => {
    assertLocalE2ETargets({ appUrl, pocketBaseUrl, specName: 'Coloring book UI creation' });
    if (!email || !password) {
      throw new Error('Missing E2E_TEST_EMAIL or E2E_TEST_PASSWORD for coloring book UI creation.');
    }

    pb = new PocketBase(pocketBaseUrl);
    await pb.collection('users').authWithPassword(email, password);
    userId = pb.authStore.record?.id ?? '';
    if (!userId) throw new Error('PocketBase did not return an authenticated E2E user.');
  });

  test.afterAll(async () => {
    if (!pb || !userId) return;

    const books = await pb.collection('coloring_books').getFullList<ColoringBookRecord>({
      filter: pb.filter('user = {:userId} && title = {:title}', { userId, title }),
    });
    for (const book of books) {
      try {
        await pb.collection('coloring_books').delete(book.id);
      } catch (error) {
        const status =
          typeof error === 'object' && error && 'status' in error ? error.status : null;
        if (status !== 404) throw error;
      }
    }
  });

  test('creates a book and edits an auto-generated page', async ({ page }) => {
    if (!pb) throw new Error('PocketBase E2E client was not initialized.');

    await page.goto('/coloring/new');
    await expect(page.getByRole('textbox', { name: 'Title *', exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('textbox', { name: 'Title *', exact: true }).fill(title);
    await page.getByRole('spinbutton', { name: 'Number of pages' }).fill('2');
    await expect.poll(() => hasColoringBookDraft(page, title)).toBe(true);
    await page.getByRole('button', { name: 'Add book', exact: true }).click();

    await expect(page).toHaveURL(/\/coloring\/[a-z0-9]+$/, { timeout: 15_000 });
    bookId = new URL(page.url()).pathname.split('/').at(-1) ?? null;
    expect(bookId, 'created coloring book URL must contain its record ID').toBeTruthy();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByText('2 pages', { exact: true })).toBeVisible();

    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.getByRole('button', { name: 'Edit coloring book' }).click();
      const editor = page.getByRole('dialog', { name: 'Edit coloring book' });
      await expect(editor).toBeVisible();
      await editor.getByLabel('Notes').fill(`Unsent note at ${viewport.width}`);

      let releaseSave: () => void = () => {};
      let saveStarted: () => void = () => {};
      const pendingSave = new Promise<void>(resolve => {
        releaseSave = resolve;
      });
      const started = new Promise<void>(resolve => {
        saveStarted = resolve;
      });
      const bookUpdateRoute = /\/api\/collections\/coloring_books\/records\/[^/]+\/?$/;
      await page.route(bookUpdateRoute, async route => {
        if (route.request().method() !== 'PATCH') return route.continue();
        saveStarted();
        await pendingSave;
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ code: 400, message: 'Save rejected', data: {} }),
        });
      });
      const unexpectedDialogs: string[] = [];
      const onDialog = (dialog: { message: () => string; dismiss: () => Promise<void> }) => {
        unexpectedDialogs.push(dialog.message());
        void dialog.dismiss();
      };
      page.on('dialog', onDialog);
      await editor.getByRole('button', { name: 'Save changes' }).click();
      await started;
      await page.keyboard.press('Escape');
      await page.mouse.click(10, 10);
      await page.evaluate(() => window.history.back());
      await expect(editor).toBeVisible();
      await expect(editor.getByLabel('Notes')).toHaveValue(`Unsent note at ${viewport.width}`);
      expect(unexpectedDialogs).toEqual([]);
      page.off('dialog', onDialog);
      releaseSave();
      await expect(editor.getByRole('button', { name: 'Save changes' })).toBeEnabled();
      await page.unroute(bookUpdateRoute);

      page.once('dialog', dialog => dialog.dismiss());
      await editor.getByRole('button', { name: 'Cancel' }).click();
      await expect(editor).toBeVisible();
      await expect(editor.getByLabel('Notes')).toHaveValue(`Unsent note at ${viewport.width}`);
      page.once('dialog', dialog => dialog.accept());
      await editor.getByRole('button', { name: 'Cancel' }).click();
      await expect(editor).toHaveCount(0);
    }

    const persistedBook = await pb.collection('coloring_books').getOne<ColoringBookRecord>(bookId!);
    expect(persistedBook).toMatchObject({ title, total_pages: 2 });
    await expect.poll(() => hasColoringBookDraft(page, title)).toBe(false);
    await page.goto('/coloring/new');
    await expect(page.getByRole('textbox', { name: 'Title *', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Unfinished draft' })).toHaveCount(0);
    await page.goto(`/coloring/${bookId}`);

    let generatedPages: ColoringPageRecord[] = [];
    await expect
      .poll(
        async () => {
          generatedPages = await pb!.collection('coloring_pages').getFullList<ColoringPageRecord>({
            filter: pb!.filter('book = {:bookId}', { bookId }),
            sort: 'page_number',
          });
          return generatedPages.map(record => record.page_number);
        },
        { timeout: 15_000 }
      )
      .toEqual([1, 2]);

    await page.getByRole('link', { name: /^Open page 1\./ }).click();
    await expect(page).toHaveURL(
      new RegExp(
        `/coloring/${bookId}/pages/${generatedPages[0].id}\\?returnTo=%2Fdashboard%3Fcraft%3Dcoloring$`
      )
    );
    await expect(page.getByRole('heading', { name: 'Page 1', exact: true })).toBeVisible();

    const startedInput = page.locator('#coloring-page-started-at');
    await startedInput.fill('2026-04-03');
    const saveStarted = startedField(page).getByRole('button', { name: 'Save' });
    await saveStarted.click();
    await expect(saveStarted).toBeDisabled({ timeout: 15_000 });
    await expect
      .poll(
        async () =>
          (await pb!.collection('coloring_pages').getOne<ColoringPageRecord>(generatedPages[0].id))
            .started_at
      )
      .toContain('2026-04-03');
  });
});
