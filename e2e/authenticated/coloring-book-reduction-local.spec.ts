import { expect, test, type Page } from '@playwright/test';
import PocketBase from 'pocketbase';
import { createHash } from 'node:crypto';

import { assertLocalE2ETargets, isLocalUrl } from '../fixtures/local-safety';

const pocketBaseUrl = process.env.VITE_POCKETBASE_URL;
const appUrl = process.env.E2E_APP_URL;
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

const openEdit = async (page: Page, bookId: string) => {
  await page.goto(`/coloring/${bookId}/edit`);
  await expect(page.getByRole('heading', { name: 'Edit book', exact: true })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Number of pages' })).toBeVisible();
};

const submitTotal = async (page: Page, total: number) => {
  await page.getByRole('spinbutton', { name: 'Number of pages' }).fill(String(total));
  await page.getByRole('button', { name: 'Update book', exact: true }).click();
};

test.describe('local coloring book reductions', () => {
  test.use({ serviceWorkers: 'block' });
  test.describe.configure({ timeout: 120_000 });
  test.skip(
    !isLocalUrl(pocketBaseUrl) || !isLocalUrl(appUrl),
    'Run with the disposable release QA harness and explicit local URLs.'
  );

  let pb: PocketBase;
  const createdBookIds: string[] = [];

  test.beforeAll(async () => {
    assertLocalE2ETargets({ appUrl, pocketBaseUrl, specName: 'Coloring book reductions' });
    if (!email || !password) throw new Error('Missing local E2E user credentials.');
    pb = new PocketBase(pocketBaseUrl);
    await pb.collection('users').authWithPassword(email, password);
  });

  test.afterAll(async () => {
    for (const id of createdBookIds) await pb.collection('coloring_books').delete(id);
  });

  const createLegacyBook = async () => {
    const title = `Reduction fixture ${crypto.randomUUID()}`;
    const archiveFingerprint = createHash('sha256').update(title).digest('hex');
    let bookId = '';
    for (let firstPage = 1; firstPage <= 1200; firstPage += 100) {
      const result = await pb.send<{ bookId: string }>('/api/archive/restore-coloring-book', {
        method: 'POST',
        body: {
          archiveFingerprint,
          allowCreate: firstPage === 1,
          archiveBookRef: `coloring-book:${archiveFingerprint}`,
          title,
          status: 'purchased',
          totalPages: 1200,
          firstPage,
          pageCount: 100,
        },
      });
      if (!bookId) createdBookIds.push(result.bookId);
      bookId = result.bookId;
    }
    return bookId;
  };

  test('edits a title without reducing an unchanged legacy page total', async ({ page }) => {
    const bookId = await createLegacyBook();
    let reductionRequests = 0;
    page.on('request', request => {
      if (request.url().includes(`/api/coloring/books/${bookId}/reduce-pages`)) {
        reductionRequests += 1;
      }
    });
    await openEdit(page, bookId);
    const title = `Renamed legacy book ${crypto.randomUUID()}`;
    await page.getByRole('textbox', { name: 'Title *', exact: true }).fill(title);
    await page.getByRole('button', { name: 'Update book', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/coloring/${bookId}$`));
    expect(await pb.collection('coloring_books').getOne(bookId)).toMatchObject({
      title,
      total_pages: 1200,
    });
    expect(reductionRequests).toBe(0);
  });

  test('rejects excluding worked page 900 and permits reducing to 900', async ({ page }) => {
    const bookId = await createLegacyBook();
    const workedPage = await pb
      .collection('coloring_pages')
      .getFirstListItem(pb.filter('book = {:bookId} && page_number = 900', { bookId }));
    await pb.collection('coloring_pages').update(workedPage.id, {
      status: 'in_progress',
    });
    const note = await pb.collection('coloring_page_progress_notes').create({
      user: pb.authStore.record!.id,
      page: workedPage.id,
      date: '2026-09-05 12:00:00.000Z',
      content: 'Keep this saved work on page 900.',
    });
    const before = await pb.collection('coloring_pages').getOne(workedPage.id);

    await openEdit(page, bookId);
    await submitTotal(page, 100);
    await expect(page.getByText('Could not update coloring book', { exact: true })).toBeVisible();
    await expect(page.getByText(/Total pages cannot be less than 900/i)).toBeVisible();
    expect((await pb.collection('coloring_books').getOne(bookId)).total_pages).toBe(1200);
    expect(
      (
        await pb.collection('coloring_pages').getList(1, 1, {
          filter: pb.filter('book = {:bookId}', { bookId }),
        })
      ).totalItems
    ).toBe(1200);
    expect(await pb.collection('coloring_pages').getOne(workedPage.id)).toMatchObject({
      status: before.status,
      started_at: before.started_at,
    });

    await submitTotal(page, 900);
    await expect(page).toHaveURL(new RegExp(`/coloring/${bookId}$`));
    expect((await pb.collection('coloring_books').getOne(bookId)).total_pages).toBe(900);
    expect(
      (
        await pb.collection('coloring_pages').getList(1, 1, {
          filter: pb.filter('book = {:bookId}', { bookId }),
        })
      ).totalItems
    ).toBe(900);
    expect((await pb.collection('coloring_page_progress_notes').getOne(note.id)).content).toBe(
      note.content
    );
    await page.getByRole('button', { name: 'Next 500 pages' }).click();
    await page.getByRole('link', { name: /^Open page 900\./ }).click();
    await expect(page).toHaveURL(new RegExp(`/coloring/${bookId}/pages/${workedPage.id}$`));
    await expect(page.getByText('Keep this saved work on page 900.')).toBeVisible();
  });

  test('reduces 1200 untouched pages to 100 with bounded requests and no excess rows', async ({
    page,
  }) => {
    const bookId = await createLegacyBook();
    let completedBatches = 0;
    page.on('response', response => {
      if (response.url().includes(`/api/coloring/books/${bookId}/reduce-pages`) && response.ok()) {
        completedBatches += 1;
      }
    });
    await openEdit(page, bookId);
    await submitTotal(page, 100);
    await expect(page).toHaveURL(new RegExp(`/coloring/${bookId}$`));
    expect((await pb.collection('coloring_books').getOne(bookId)).total_pages).toBe(100);
    const pages = await pb.collection('coloring_pages').getFullList({
      filter: pb.filter('book = {:bookId}', { bookId }),
      sort: 'page_number',
    });
    expect(pages.map(record => record.page_number)).toEqual(
      Array.from({ length: 100 }, (_, i) => i + 1)
    );
    expect(completedBatches).toBe(3);
  });

  test('resumes a reduction after a later batch fails', async ({ page }) => {
    const bookId = await createLegacyBook();
    let requests = 0;
    const routePattern = `**/api/coloring/books/${bookId}/reduce-pages`;
    await page.route(routePattern, async route => {
      requests += 1;
      if (requests >= 2) {
        await route.abort('failed');
        return;
      }
      await route.continue();
    });
    await openEdit(page, bookId);
    await submitTotal(page, 100);
    await expect(page.getByText('Could not update coloring book', { exact: true })).toBeVisible();
    expect((await pb.collection('coloring_books').getOne(bookId)).total_pages).toBe(700);
    const intermediatePages = await pb.collection('coloring_pages').getFullList({
      filter: pb.filter('book = {:bookId}', { bookId }),
      sort: 'page_number',
    });
    expect(intermediatePages.map(record => record.page_number)).toEqual(
      Array.from({ length: 700 }, (_, i) => i + 1)
    );

    await page.unroute(routePattern);
    await openEdit(page, bookId);
    await expect(page.getByRole('spinbutton', { name: 'Number of pages' })).toHaveValue('700');
    await submitTotal(page, 100);
    await expect(page).toHaveURL(new RegExp(`/coloring/${bookId}$`));
    expect((await pb.collection('coloring_books').getOne(bookId)).total_pages).toBe(100);
    expect(
      (
        await pb.collection('coloring_pages').getList(1, 1, {
          filter: pb.filter('book = {:bookId}', { bookId }),
        })
      ).totalItems
    ).toBe(100);
  });
});
