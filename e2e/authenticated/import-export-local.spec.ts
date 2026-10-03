import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import PocketBase from 'pocketbase';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

import { assertLocalE2ETargets, isLocalUrl } from '../fixtures/local-safety';

type ProjectRecord = {
  id: string;
  title: string;
  image?: string;
  status?: string;
};

type ProgressNoteRecord = {
  id: string;
  project: string;
  image?: string;
  content?: string;
};

type TestFiles = {
  organizedCsvPath: string;
  dacCsvPath: string;
  photoZipPath: string;
};

const rootDir = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const fixtureDir = path.join(rootDir, 'e2e', 'fixtures', 'import-export');
const portraitFixture = path.join(rootDir, 'e2e', 'fixtures', 'portrait-cover.jpg');
const envFile = path.join(rootDir, '.env.e2e');
const localEnvFile = path.join(rootDir, '.env.e2e.local');

const parsedEnv = fs.existsSync(envFile) ? parseEnv(fs.readFileSync(envFile, 'utf8')) : {};
const parsedLocalEnv = fs.existsSync(localEnvFile)
  ? parseEnv(fs.readFileSync(localEnvFile, 'utf8'))
  : {};
const testEnv = { ...parsedEnv, ...parsedLocalEnv, ...process.env };

const pocketBaseUrl = testEnv.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
const appUrl = testEnv.E2E_APP_URL ?? 'http://localhost:3000';
const email = testEnv.E2E_TEST_EMAIL;
const password = testEnv.E2E_TEST_PASSWORD;
const runPrefix = `E2E Import Export ${Date.now()}`;
const runSlug = runPrefix.toLowerCase().replace(/[^a-z0-9]+/g, '-');

const organizedTitle = `${runPrefix} Organized CSV Project`;
const dacFoxTitle = `${runPrefix} DAC Fox`;
const dacMoonTitle = `${runPrefix} DAC Moon`;

const fillTemplate = async (filename: string) => {
  const template = await readFile(path.join(fixtureDir, filename), 'utf8');
  return template.replaceAll('{{RUN_PREFIX}}', runPrefix).replaceAll('{{RUN_SLUG}}', runSlug);
};

const makeTestFiles = async (dir: string): Promise<TestFiles> => {
  const [organizedCsv, dacCsv, photoManifest, imageBytes] = await Promise.all([
    fillTemplate('organized-projects.csv'),
    fillTemplate('dac-orders.csv'),
    fillTemplate('photo-import.json'),
    readFile(portraitFixture),
  ]);

  const organizedCsvPath = path.join(dir, 'organized-projects.csv');
  const dacCsvPath = path.join(dir, 'dac-orders.csv');
  const photoZipPath = path.join(dir, 'photo-import.zip');
  const zip = new JSZip();

  zip.file('photo-import.json', photoManifest);
  zip.file('photos/cover.jpg', imageBytes);
  zip.file('photos/progress.jpg', imageBytes);
  zip.file('photos/unmatched.jpg', imageBytes);

  await Promise.all([
    writeFile(organizedCsvPath, organizedCsv),
    writeFile(dacCsvPath, dacCsv),
    writeFile(photoZipPath, await zip.generateAsync({ type: 'nodebuffer' })),
  ]);

  return { organizedCsvPath, dacCsvPath, photoZipPath };
};

const createClient = async () => {
  if (!email || !password) {
    throw new Error('Missing E2E_TEST_EMAIL or E2E_TEST_PASSWORD for import/export E2E tests.');
  }

  const pb = new PocketBase(pocketBaseUrl);
  await pb.collection('users').authWithPassword(email, password);
  if (!pb.authStore.record?.id) {
    throw new Error('PocketBase did not return an authenticated E2E user.');
  }
  return pb;
};

const listAll = async <T extends { id: string }>(
  pb: PocketBase,
  collection: string,
  filter: string
) => {
  return pb.collection(collection).getFullList<T>({ filter });
};

const deleteRecord = async (pb: PocketBase, collection: string, id: string) => {
  try {
    await pb.collection(collection).delete(id);
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error ? error.status : null;
    if (status !== 404) throw error;
  }
};

const cleanupRunRecords = async (pb: PocketBase) => {
  const userId = pb.authStore.record?.id;
  if (!userId) return;

  const titleFilter = pb.filter('user = {:userId} && title ~ {:prefix}', {
    userId,
    prefix: runPrefix,
  });
  const projects = await listAll<ProjectRecord>(pb, 'projects', titleFilter);
  const projectIds = projects.map(project => project.id);

  if (projectIds.length > 0) {
    const projectIdFilter = projectIds
      .map(projectId => pb.filter('project = {:projectId}', { projectId }))
      .join(' || ');
    const [progressNotes, projectTags] = await Promise.all([
      listAll<ProgressNoteRecord>(pb, 'progress_notes', projectIdFilter),
      listAll<{ id: string }>(pb, 'project_tags', projectIdFilter),
    ]);

    for (const note of progressNotes) await deleteRecord(pb, 'progress_notes', note.id);
    for (const projectTag of projectTags) await deleteRecord(pb, 'project_tags', projectTag.id);
    for (const project of projects) await deleteRecord(pb, 'projects', project.id);
  }

  const namedCollections = ['tags', 'companies', 'artists'];
  for (const collection of namedCollections) {
    const records = await listAll<{ id: string }>(
      pb,
      collection,
      pb.filter('user = {:userId} && name ~ {:prefix}', { userId, prefix: runPrefix })
    );
    for (const record of records) await deleteRecord(pb, collection, record.id);
  }
};

const getProjectByTitle = async (pb: PocketBase, title: string) => {
  const userId = pb.authStore.record?.id;
  if (!userId) throw new Error('Missing authenticated user for project lookup.');
  return pb.collection('projects').getFirstListItem<ProjectRecord>(
    pb.filter('user = {:userId} && title = {:title}', {
      userId,
      title,
    })
  );
};

const getProjectsByPrefix = async (pb: PocketBase) => {
  const userId = pb.authStore.record?.id;
  if (!userId) throw new Error('Missing authenticated user for project lookup.');
  return listAll<ProjectRecord>(
    pb,
    'projects',
    pb.filter('user = {:userId} && title ~ {:prefix}', { userId, prefix: runPrefix })
  );
};

const getProgressNotes = async (pb: PocketBase, projectId: string) => {
  return listAll<ProgressNoteRecord>(
    pb,
    'progress_notes',
    pb.filter('project = {:projectId}', { projectId })
  );
};

const deleteRunProjectsOnly = async (pb: PocketBase) => {
  const projects = await getProjectsByPrefix(pb);
  for (const project of projects) {
    const notes = await getProgressNotes(pb, project.id);
    for (const note of notes) await deleteRecord(pb, 'progress_notes', note.id);
    const projectTags = await listAll<{ id: string }>(
      pb,
      'project_tags',
      pb.filter('project = {:projectId}', { projectId: project.id })
    );
    for (const projectTag of projectTags) await deleteRecord(pb, 'project_tags', projectTag.id);
    await deleteRecord(pb, 'projects', project.id);
  }
};

const openDataSettings = async (page: Page) => {
  await page.goto('/profile?tab=data');
  await expect(page.getByRole('tab', { name: 'Data', selected: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('region', { name: 'Import' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Restore archive' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Export' })).toBeVisible();
};

const uploadFile = async (page: Page, label: string, filePath: string) => {
  await page.getByLabel(label).setInputFiles(filePath);
};

const expectDownloadedArchiveContents = async (archivePath: string) => {
  const zip = await JSZip.loadAsync(await readFile(archivePath));
  const files = Object.keys(zip.files);
  expect(files).toContain('manifest.json');
  expect(files).toContain('diamond-projects.csv');
  expect(files).toContain('coloring-books.csv');
  expect(files).toContain('coloring-pages.csv');
  expect(files.some(file => file.startsWith('photos/'))).toBe(true);

  const manifestText = await zip.file('manifest.json')?.async('string');
  expect(manifestText).toBeTruthy();
  const manifest = JSON.parse(manifestText ?? '{}') as {
    diamondProjects?: Array<{ title: string }>;
  };
  expect(manifest.diamondProjects?.some(project => project.title === organizedTitle)).toBe(true);
};

const expectImportExportData = async (pb: PocketBase) => {
  const projects = await getProjectsByPrefix(pb);
  expect(projects.map(project => project.title)).toEqual(
    expect.arrayContaining([organizedTitle, dacFoxTitle, dacMoonTitle])
  );

  const organizedProject = await getProjectByTitle(pb, organizedTitle);
  expect(organizedProject.image, 'bulk photo import added a project cover').toBeTruthy();
  const notes = await getProgressNotes(pb, organizedProject.id);
  expect(
    notes.some(note => note.image),
    'bulk photo import added a progress note image'
  ).toBe(true);
};

test.describe('local import/export workflows', () => {
  test.describe.configure({ timeout: 120_000 });

  test.skip(
    !isLocalUrl(pocketBaseUrl),
    `Import/export E2E tests only run against local PocketBase, got ${pocketBaseUrl}`
  );

  let pb: PocketBase;
  let tempDir: string;
  let files: TestFiles;

  test.beforeAll(async () => {
    assertLocalE2ETargets({
      appUrl,
      pocketBaseUrl,
      specName: 'Local import/export workflows',
    });
    pb = await createClient();
  });

  test.beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'og-import-export-e2e-'));
    files = await makeTestFiles(tempDir);
    await cleanupRunRecords(pb);
  });

  test.afterEach(async () => {
    await cleanupRunRecords(pb);
    await rm(tempDir, { recursive: true, force: true });
  });

  test('imports CSV and DAC data, attaches bulk photos, exports and restores an archive', async ({
    browser,
    page,
  }) => {
    await page.goto('/import');
    await expect(page).toHaveURL(/\/profile\?tab=data/);
    await openDataSettings(page);

    await uploadFile(page, 'Organized Glitter CSV file', files.organizedCsvPath);
    await expect(page.getByText('organized-projects.csv')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Import CSV$/ })).toBeEnabled();
    await page.getByRole('button', { name: /^Import CSV$/ }).click();
    await expect(page.getByText(/Imported 1, failed 0/i)).toBeVisible({ timeout: 30_000 });

    await uploadFile(page, 'Diamond Art Club CSV file', files.dacCsvPath);
    await expect(page.getByText('dac-orders.csv')).toBeVisible();
    await expect(page.getByText(/2 projects parsed/i)).toBeVisible();
    await expect(page.getByText(dacFoxTitle)).toBeVisible();
    await page.getByRole('button', { name: 'Import DAC projects' }).click();
    await expect(page.getByRole('heading', { name: 'DAC import complete' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Imported 2, failed 0/i)).toBeVisible();

    await uploadFile(page, 'Bulk photo ZIP file', files.photoZipPath);
    await expect(page.getByText(/3 photos ready for review/i)).toBeVisible({ timeout: 30_000 });
    // Desktop uses a table; phones use review cards.
    for (const filename of ['cover.jpg', 'progress.jpg', 'unmatched.jpg']) {
      await expect(
        page.getByText(filename, { exact: true }).filter({ visible: true })
      ).toBeVisible();
    }
    await expect(page.getByText(/Included/).first()).toBeVisible();
    await expect(page.getByText(/Unmatched/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import confirmed photos' })).toBeEnabled();
    await page.getByRole('button', { name: 'Import confirmed photos' }).click();
    await expect(page.getByRole('heading', { name: 'Bulk photo result' })).toBeVisible({
      timeout: 45_000,
    });
    await expect(
      page.getByText('2 imported, 1 skipped, 0 failed, 1 progress notes created, 0 overwrites.')
    ).toBeVisible();

    await expectImportExportData(pb);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export full archive' }).click();
    const download = await downloadPromise;
    const archivePath = path.join(tempDir, 'organized-glitter-export.zip');
    await download.saveAs(archivePath);
    await expect(page.getByRole('heading', { name: /Archive exported/i })).toBeVisible({
      timeout: 30_000,
    });
    await expectDownloadedArchiveContents(archivePath);
    const authenticatedStorageState = await page.context().storageState();

    await uploadFile(page, 'Archive ZIP file', archivePath);
    await expect(page.getByText('organized-glitter-export.zip')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Import archive$/ })).toBeEnabled();
    await page.getByRole('button', { name: /^Import archive$/ }).click();
    await expect(page.getByRole('heading', { name: 'Archive import summary' })).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByText('Records skipped', { exact: true })).toBeVisible();

    await deleteRunProjectsOnly(pb);
    const restoreContext = await browser.newContext({
      baseURL: appUrl,
      storageState: authenticatedStorageState,
    });
    try {
      const restorePage = await restoreContext.newPage();
      await openDataSettings(restorePage);
      await uploadFile(restorePage, 'Archive ZIP file', archivePath);
      await restorePage.getByRole('button', { name: /^Import archive$/ }).click();
      await expect(
        restorePage.getByRole('heading', { name: 'Archive import summary' })
      ).toBeVisible({ timeout: 45_000 });
      await expect(
        restorePage.getByText(
          /3 diamond projects, 0 coloring books, 1 progress notes, and 2 photos imported\./
        )
      ).toBeVisible();
      await expectImportExportData(pb);
    } finally {
      await restoreContext.close();
    }
  });

  test.describe('mobile touch coverage', () => {
    test.use({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });

    test('mobile data tab keeps import controls reachable and uses review cards', async ({
      page,
    }) => {
      await pb.collection('projects').create({
        user: pb.authStore.record?.id,
        title: organizedTitle,
        status: 'stash',
        kit_category: 'full',
      });

      await openDataSettings(page);
      const container = page.locator('.mobile-app-container');
      await container.evaluate(element => {
        element.scrollTop = element.scrollHeight;
      });

      const selectZip = page.getByRole('button', { name: 'Select photo ZIP' });
      await expect(selectZip).toBeVisible();
      const box = await selectZip.boundingBox();
      expect(
        box?.height ?? 0,
        'mobile photo ZIP button has touch target height'
      ).toBeGreaterThanOrEqual(44);

      await uploadFile(page, 'Bulk photo ZIP file', files.photoZipPath);
      await expect(page.getByText(/3 photos ready for review/i)).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('table')).toBeHidden();
      await expect(
        page.locator('div.md\\:hidden > article').filter({ hasText: 'cover.jpg' })
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Import confirmed photos' })).toBeVisible();
    });
  });
});
