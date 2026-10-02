/**
 * Coloring page detail route hardening:
 *
 *   #96  — reject page/book mismatch on the detail route. A page that does not
 *          belong to the book in the URL must render the "Coloring page not
 *          found" state instead of mounting under the wrong book context
 *          (commit 3e934370 / useColoringPageDetailData).
 *
 *   #100 — preserve an unsaved lifecycle date draft when a sibling lifecycle
 *          date is saved. Saving the Started date optimistically updates the
 *          detail cache; before the fix that refired a combined effect and wiped
 *          the unsaved Completed draft (commit f27c4e15 /
 *          useColoringPageLifecycleDates).
 *
 * Both tests drive the real route in Chromium against fixture books/pages this
 * spec creates for the run, so they never depend on (or mutate) shared account
 * data and never silently skip against an empty account. Creating a book
 * auto-generates `total_pages` page records via a backend hook, and deleting a
 * book cascades its pages, so teardown only deletes the books.
 */

import { expect, test, type Page } from '@playwright/test';
import PocketBase from 'pocketbase';
import { randomUUID } from 'node:crypto';

import { assertLocalE2ETargets } from '../fixtures/local-safety';

const pocketBaseUrl = process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

interface RecordWithId {
  id: string;
}

interface PageRecord {
  id: string;
  page_number: number;
}

const authedClient = async () => {
  if (!email || !password) {
    throw new Error(
      'Missing E2E_TEST_EMAIL or E2E_TEST_PASSWORD for coloring page detail E2E test.'
    );
  }
  const pb = new PocketBase(pocketBaseUrl);
  await pb.collection('users').authWithPassword(email, password);
  if (!pb.authStore.record?.id) {
    throw new Error('PocketBase did not return an authenticated E2E user.');
  }
  return pb;
};

const createBookWithPages = async (pb: PocketBase, runId: string, totalPages: number) => {
  const userId = pb.authStore.record!.id;
  const book = await pb.collection('coloring_books').create<RecordWithId>({
    user: userId,
    title: `E2E Page Detail ${runId}`,
    status: 'in_progress',
    total_pages: totalPages,
  });
  const pages = await pb.collection('coloring_pages').getFullList<PageRecord>({
    filter: pb.filter('book = {:bookId}', { bookId: book.id }),
    sort: 'page_number',
  });
  if (pages.length < totalPages) {
    throw new Error(
      `Expected ${totalPages} auto-generated pages for book ${book.id}, got ${pages.length}.`
    );
  }
  return { book, pages };
};

const safeDeleteBook = async (pb: PocketBase, bookId: string | null) => {
  if (!bookId) return;
  try {
    await pb.collection('coloring_books').delete(bookId);
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error ? error.status : null;
    if (status !== 404) console.warn('Coloring page detail teardown cleanup failed', error);
  }
};

test.describe('Coloring page detail route', () => {
  test.describe('#96 page/book mismatch is treated as not found', () => {
    let pb: PocketBase;
    let bookAId: string | null = null;
    let bookBId: string | null = null;
    let bookAPageId: string | null = null;

    test.beforeAll(async () => {
      assertLocalE2ETargets({
        appUrl,
        pocketBaseUrl,
        specName: 'Coloring page detail route',
      });
      pb = await authedClient();
      const runId = randomUUID().slice(0, 8);

      const bookA = await createBookWithPages(pb, `${runId}-A`, 1);
      bookAId = bookA.book.id;
      bookAPageId = bookA.pages[0].id;

      const bookB = await createBookWithPages(pb, `${runId}-B`, 1);
      bookBId = bookB.book.id;
    });

    test.afterAll(async () => {
      await safeDeleteBook(pb, bookAId);
      await safeDeleteBook(pb, bookBId);
    });

    test('renders not found when the page belongs to a different book', async ({ page }) => {
      expect(bookAPageId, 'book A page fixture must exist').toBeTruthy();
      expect(bookBId, 'book B fixture must exist').toBeTruthy();

      // Both books are real and owned by the E2E user, so this exercises the
      // mismatch branch (loadedPage.bookId !== book.id), not a missing book.
      await page.goto(`/coloring/${bookBId}/pages/${bookAPageId}`);

      await expect(page.getByRole('heading', { name: 'Coloring page not found' })).toBeVisible({
        timeout: 15_000,
      });

      // Pre-fix this route mounted the page under book B and showed its
      // "Page N" heading; assert it is absent.
      await expect(page.getByRole('heading', { name: /^Page \d+$/ })).toHaveCount(0);
    });

    test('renders the page normally when the page belongs to the book', async ({ page }) => {
      // Control: the same page under its own book loads as a real detail view,
      // proving the mismatch test fails for the right reason.
      expect(bookAId, 'book A fixture must exist').toBeTruthy();
      expect(bookAPageId, 'book A page fixture must exist').toBeTruthy();

      await page.goto(`/coloring/${bookAId}/pages/${bookAPageId}`);

      await expect(page.getByRole('heading', { name: /^Page \d+$/ })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByRole('heading', { name: 'Coloring page not found' })).toHaveCount(0);
    });
  });

  test.describe('#100 unsaved sibling lifecycle draft survives a save', () => {
    let pb: PocketBase;
    let bookId: string | null = null;
    let pageId: string | null = null;

    test.beforeAll(async () => {
      assertLocalE2ETargets({
        appUrl,
        pocketBaseUrl,
        specName: 'Coloring page detail route',
      });
      pb = await authedClient();
      const runId = randomUUID().slice(0, 8);
      const { book, pages } = await createBookWithPages(pb, runId, 1);
      bookId = book.id;
      pageId = pages[0].id;
    });

    test.afterAll(async () => {
      await safeDeleteBook(pb, bookId);
    });

    const startedField = (page: Page) =>
      page.locator('div.space-y-2:has(#coloring-page-started-at)');
    const completedField = (page: Page) =>
      page.locator('div.space-y-2:has(#coloring-page-completed-at)');

    test('keeps the Completed draft after saving the Started date', async ({ page }) => {
      expect(bookId, 'book fixture must exist').toBeTruthy();
      expect(pageId, 'page fixture must exist').toBeTruthy();

      await page.goto(`/coloring/${bookId}/pages/${pageId}`);
      await expect(page.getByRole('heading', { name: 'Dates' })).toBeVisible({ timeout: 15_000 });

      const startedInput = page.locator('#coloring-page-started-at');
      const completedInput = page.locator('#coloring-page-completed-at');
      await expect(startedInput).toHaveValue('');
      await expect(completedInput).toHaveValue('');

      // Type both drafts (each differs from its committed empty value, so each
      // Save button becomes enabled).
      await startedInput.fill('2026-04-01');
      await completedInput.fill('2026-04-27');

      const startedSave = startedField(page).getByRole('button', { name: 'Save' });
      const completedSave = completedField(page).getByRole('button', { name: 'Save' });
      await expect(startedSave).toBeEnabled();
      await expect(completedSave).toBeEnabled();

      // Save only the Started date.
      await startedSave.click();

      // The save round-trips when the committed value catches up to the draft,
      // which disables the Started Save (canSave = draft !== value). Waiting for
      // this is what makes the test discriminate: the bug fired only after the
      // optimistic cache update changed the committed Started value and refired
      // the draft-sync effect.
      await expect(startedSave).toBeDisabled({ timeout: 15_000 });
      await expect(startedInput).toHaveValue('2026-04-01');

      // The unsaved Completed draft must survive the sibling save.
      await expect(completedInput).toHaveValue('2026-04-27');
      await expect(completedSave).toBeEnabled();
    });
  });
});
