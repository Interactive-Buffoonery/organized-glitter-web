import { expect, test, type Page, type Request } from '@playwright/test';
import JSZip from 'jszip';
import PocketBase from 'pocketbase';
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

import { assertLocalE2ETargets, isLocalUrl } from '../fixtures/local-safety';

type ColoringBookRecord = {
  id: string;
  title: string;
  status: string;
  notes: string;
  date_started: string;
  completed_pages: number;
  completion_percentage: number;
};

type ColoringPageRecord = {
  id: string;
  page_number: number;
  status: string;
  revealed_subject: string;
  started_at: string;
  completed_at: string;
};

type RestoreBatchRequest = {
  firstPage: number;
  pageCount: number;
};

const rootDir = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const envFile = path.join(rootDir, '.env.e2e');
const localEnvFile = path.join(rootDir, '.env.e2e.local');

const readEnvFile = (filePath: string) =>
  fs.existsSync(filePath) ? parseEnv(fs.readFileSync(filePath, 'utf8')) : {};

const testEnv = {
  ...readEnvFile(envFile),
  ...readEnvFile(localEnvFile),
  ...process.env,
};
const pocketBaseUrl = testEnv.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
const appUrl = testEnv.E2E_APP_URL ?? 'http://localhost:3000';
const email = testEnv.E2E_TEST_EMAIL;
const password = testEnv.E2E_TEST_PASSWORD;
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const bookTitle = `E2E Archive Recovery ${runId}`;
const bookRef = `coloring-book:archive-recovery-${runId}`;
const totalPages = 501;
const independentSubject = `Independent edit ${runId}`;
const archiveSubject = `Archived subject ${runId}`;
const independentBookNote = `Independent book note ${runId}`;

const createClient = async () => {
  if (!email || !password) {
    throw new Error('Missing E2E_TEST_EMAIL or E2E_TEST_PASSWORD for archive recovery E2E test.');
  }

  const pb = new PocketBase(pocketBaseUrl);
  await pb.collection('users').authWithPassword(email, password);
  if (!pb.authStore.record?.id) {
    throw new Error('PocketBase did not return an authenticated E2E user.');
  }
  return pb;
};

const createArchive = async () => {
  const pages = Array.from({ length: totalPages }, (_, index) => {
    const pageNumber = index + 1;
    const hasArchivedMetadata = pageNumber === 1 || pageNumber === totalPages;
    return {
      ref: `coloring-page:archive-recovery-${runId}-${pageNumber}`,
      oldId: `archive-recovery-${runId}-${pageNumber}`,
      pageNumber,
      status: hasArchivedMetadata ? 'completed' : 'not_started',
      mediumRefs: [],
      ...(hasArchivedMetadata
        ? {
            revealedSubject: archiveSubject,
            startedAt: '2026-08-01',
            completedAt: '2026-08-02',
          }
        : {}),
      photoPaths: [],
      progressNotes: [],
    };
  });
  const manifest = {
    schemaVersion: 1,
    exportedAt: '2026-09-05T12:00:00.000Z',
    source: 'organized-glitter',
    files: [],
    diamondProjects: [],
    coloringMediums: [],
    coloringBooks: [
      {
        ref: bookRef,
        oldId: `archive-recovery-${runId}`,
        title: bookTitle,
        isMystery: false,
        status: 'in_progress',
        totalPages,
        tags: [],
        pages,
      },
    ],
    warnings: [],
  };
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest));
  return zip.generateAsync({ type: 'nodebuffer' });
};

const openDataSettings = async (page: Page) => {
  await page.goto('/profile?tab=data');
  await expect(page.getByRole('tab', { name: 'Data', selected: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('region', { name: 'Restore archive' })).toBeVisible();
};

const multipartNumber = (request: Request, field: string): number => {
  const body = request.postData() ?? '';
  const match = body.match(new RegExp(`name="${field}"\\r?\\n\\r?\\n(\\d+)`));
  if (!match) throw new Error(`Archive restore request omitted ${field}.`);
  return Number(match[1]);
};

const listBooks = async (pb: PocketBase) => {
  const userId = pb.authStore.record?.id;
  if (!userId) throw new Error('Missing authenticated user for archive book lookup.');
  return pb.collection('coloring_books').getFullList<ColoringBookRecord>({
    filter: pb.filter('user = {:userId} && title = {:title}', { userId, title: bookTitle }),
  });
};

const listPages = (pb: PocketBase, bookId: string) =>
  pb.collection('coloring_pages').getFullList<ColoringPageRecord>({
    filter: pb.filter('book = {:bookId}', { bookId }),
    sort: 'page_number',
  });

const cleanup = async (pb: PocketBase) => {
  for (const book of await listBooks(pb)) {
    try {
      await pb.collection('coloring_books').delete(book.id);
    } catch (error) {
      const status = typeof error === 'object' && error && 'status' in error ? error.status : null;
      if (status !== 404) throw error;
    }
  }
};

test.describe('local archive recovery', () => {
  test.describe.configure({ timeout: 360_000 });
  test.use({ serviceWorkers: 'block' });

  test.skip(
    !isLocalUrl(pocketBaseUrl),
    `Archive recovery E2E only runs against local PocketBase, got ${pocketBaseUrl}`
  );

  let pb: PocketBase;

  test.beforeAll(async () => {
    assertLocalE2ETargets({ appUrl, pocketBaseUrl, specName: 'Local archive recovery' });
    pb = await createClient();
    await cleanup(pb);
  });

  test.afterAll(async () => {
    await cleanup(pb);
  });

  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('og:archive-import-recovery:v')) localStorage.removeItem(key);
      }
    });
  });

  test('resumes an interrupted 501-page restore without overwriting an edited page', async ({
    page,
  }) => {
    const archive = await createArchive();
    const restoreBatches: RestoreBatchRequest[] = [];
    let shouldInterrupt = true;
    let metadataRequestCount = 0;

    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/archive/restore-coloring-page-metadata') {
        metadataRequestCount += 1;
      }
    });
    await page.route('**/api/archive/restore-coloring-book', async route => {
      const request = route.request();
      restoreBatches.push({
        firstPage: multipartNumber(request, 'firstPage'),
        pageCount: multipartNumber(request, 'pageCount'),
      });
      if (shouldInterrupt && restoreBatches.length === 2) {
        shouldInterrupt = false;
        await route.abort('connectionreset');
        return;
      }
      await route.continue();
    });

    await openDataSettings(page);
    await page.getByLabel('Archive ZIP file').setInputFiles({
      name: `archive-recovery-${runId}.zip`,
      mimeType: 'application/zip',
      buffer: archive,
    });
    await page.getByRole('button', { name: /^Import archive$/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Archive import completed with errors' })
    ).toBeVisible({ timeout: 60_000 });

    await expect.poll(async () => (await listBooks(pb)).length).toBe(1);
    const [bookAfterInterruption] = await listBooks(pb);
    const pagesAfterInterruption = await listPages(pb, bookAfterInterruption.id);
    expect(pagesAfterInterruption).toHaveLength(100);
    expect(restoreBatches).toEqual([
      { firstPage: 1, pageCount: 100 },
      { firstPage: 101, pageCount: 100 },
    ]);

    const firstPage = pagesAfterInterruption[0];
    await pb.collection('coloring_pages').update(firstPage.id, {
      status: 'in_progress',
      revealed_subject: independentSubject,
      started_at: '2026-09-01',
    });
    await pb.collection('coloring_books').update(bookAfterInterruption.id, {
      status: 'in_stash',
      notes: independentBookNote,
      date_started: '2026-09-02',
    });

    await page.getByRole('button', { name: /^Import archive$/ }).click();
    const conflictMessage = `Page 1 in ${bookTitle}: current metadata differs from the archive and no safe restore checkpoint matches it`;
    await expect(page.getByText(conflictMessage, { exact: true }).first()).toBeVisible({
      timeout: 300_000,
    });

    const booksAfterRetry = await listBooks(pb);
    expect(booksAfterRetry).toHaveLength(1);
    expect(booksAfterRetry[0].id).toBe(bookAfterInterruption.id);
    expect(booksAfterRetry[0]).toMatchObject({
      status: 'in_stash',
      notes: independentBookNote,
      completed_pages: 1,
      completion_percentage: 0,
    });
    expect(booksAfterRetry[0].date_started).toContain('2026-09-02');
    const restoredPages = await listPages(pb, bookAfterInterruption.id);
    expect(restoredPages).toHaveLength(totalPages);
    expect(restoredPages.map(restoredPage => restoredPage.page_number)).toEqual(
      Array.from({ length: totalPages }, (_, index) => index + 1)
    );

    expect(restoredPages[0]).toMatchObject({
      id: firstPage.id,
      status: 'in_progress',
      revealed_subject: independentSubject,
    });
    expect(restoredPages.at(-1)).toMatchObject({
      page_number: totalPages,
      status: 'completed',
      revealed_subject: archiveSubject,
    });
    expect(restoredPages.at(-1)?.started_at).toContain('2026-08-01');
    expect(restoredPages.at(-1)?.completed_at).toContain('2026-08-02');

    expect(restoreBatches).toEqual([
      { firstPage: 1, pageCount: 100 },
      { firstPage: 101, pageCount: 100 },
      { firstPage: 1, pageCount: 100 },
      { firstPage: 101, pageCount: 100 },
      { firstPage: 201, pageCount: 100 },
      { firstPage: 301, pageCount: 100 },
      { firstPage: 401, pageCount: 100 },
      { firstPage: 501, pageCount: 1 },
    ]);
    expect(restoreBatches.every(batch => batch.pageCount <= 100)).toBe(true);
    expect(metadataRequestCount).toBe(1);
  });
});
