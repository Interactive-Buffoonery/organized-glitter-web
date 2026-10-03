/**
 * New project cover creation against local PocketBase.
 *
 * These tests create their own records and refuse non-local app or backend
 * targets. The ambiguous-response case lets PocketBase persist the request,
 * then drops only the response before it reaches the browser.
 */

import { expect, test, type Page, type Request } from '@playwright/test';
import PocketBase from 'pocketbase';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertLocalE2ETargets, isLocalUrl } from '../fixtures/local-safety';

type ProjectRecord = {
  id: string;
  image?: string;
  title: string;
  user: string;
};

type ProjectWrite = {
  contentType: string;
  method: string;
};

const rootDir = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const PORTRAIT_FIXTURE = path.join(rootDir, 'e2e', 'fixtures', 'portrait-cover.jpg');
const pocketBaseUrl = process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const runPrefix = `E2E Project Create ${randomUUID()}`;

const isProjectRecordsRequest = (request: Request) =>
  new URL(request.url()).pathname.startsWith('/api/collections/projects/records');

const captureProjectWrites = (page: Page) => {
  const writes: ProjectWrite[] = [];

  page.on('request', request => {
    if (!isProjectRecordsRequest(request) || !['POST', 'PATCH'].includes(request.method())) return;

    writes.push({
      contentType: request.headers()['content-type'] ?? '',
      method: request.method(),
    });
  });

  return writes;
};

const createClient = async () => {
  if (!email || !password) {
    throw new Error('Missing E2E_TEST_EMAIL or E2E_TEST_PASSWORD for project create E2E tests.');
  }

  const pb = new PocketBase(pocketBaseUrl);
  await pb.collection('users').authWithPassword(email, password);
  if (!pb.authStore.record?.id) {
    throw new Error('PocketBase did not return an authenticated E2E user.');
  }
  return pb;
};

const getRunProjects = async (pb: PocketBase) => {
  const userId = pb.authStore.record?.id;
  if (!userId) throw new Error('Missing authenticated user for project lookup.');

  return pb.collection('projects').getFullList<ProjectRecord>({
    filter: pb.filter('user = {:userId} && title ~ {:prefix}', {
      userId,
      prefix: runPrefix,
    }),
  });
};

const deleteRecord = async (pb: PocketBase, collection: string, id: string) => {
  try {
    await pb.collection(collection).delete(id);
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error ? error.status : null;
    if (status !== 404) throw error;
  }
};

const cleanupRunProjects = async (pb: PocketBase) => {
  const projects = await getRunProjects(pb);

  for (const project of projects) {
    const projectFilter = pb.filter('project = {:projectId}', { projectId: project.id });
    const [progressNotes, projectTags] = await Promise.all([
      pb.collection('progress_notes').getFullList<{ id: string }>({ filter: projectFilter }),
      pb.collection('project_tags').getFullList<{ id: string }>({ filter: projectFilter }),
    ]);

    for (const note of progressNotes) await deleteRecord(pb, 'progress_notes', note.id);
    for (const projectTag of projectTags) await deleteRecord(pb, 'project_tags', projectTag.id);
    await deleteRecord(pb, 'projects', project.id);
  }
};

const fillProjectTitle = async (page: Page, title: string) => {
  await page.goto('/projects/new');
  await expect(page.getByRole('heading', { name: 'New project' })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByLabel('Project title').fill(title);
};

const fillProjectWithCover = async (page: Page, title: string) => {
  await fillProjectTitle(page, title);
  await page.locator('#project-image-input').setInputFiles(PORTRAIT_FIXTURE);

  const cropDialog = page.getByRole('dialog', { name: 'Crop project image' });
  await expect(cropDialog).toBeVisible();
  await cropDialog.getByRole('button', { name: 'Skip crop' }).click();
  await expect(page.getByRole('img', { name: 'Project preview' })).toBeVisible();
};

const expectSingleMultipartCreate = (writes: ProjectWrite[]) => {
  const creates = writes.filter(write => write.method === 'POST');
  const updates = writes.filter(write => write.method === 'PATCH');

  expect(creates, 'the UI sent exactly one project create request').toHaveLength(1);
  expect(updates, 'cover upload did not use a second project update').toHaveLength(0);
  expect(creates[0].contentType).toMatch(/^multipart\/form-data; boundary=/i);
};

test.describe('local project creation with a cover', () => {
  test.describe.configure({ timeout: 60_000 });

  test.skip(
    !isLocalUrl(appUrl) || !isLocalUrl(pocketBaseUrl),
    `Project create E2E tests only run against local targets, got ${appUrl} and ${pocketBaseUrl}`
  );

  let pb: PocketBase;

  test.beforeAll(async () => {
    assertLocalE2ETargets({
      appUrl,
      pocketBaseUrl,
      specName: 'Local project creation with a cover',
    });
    pb = await createClient();
  });

  test.beforeEach(async () => {
    await cleanupRunProjects(pb);
  });

  test.afterEach(async () => {
    await cleanupRunProjects(pb);
  });

  test('saves one project and uploads its cover in the create request', async ({ page }) => {
    const title = `${runPrefix} success`;
    const writes = captureProjectWrites(page);
    await fillProjectWithCover(page, title);

    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page).toHaveURL(/\/projects\/[a-z0-9]+$/, { timeout: 15_000 });

    await expect.poll(async () => getRunProjects(pb), { timeout: 15_000 }).toHaveLength(1);

    const projects = await getRunProjects(pb);
    expect(projects[0]).toMatchObject({ title });
    expect(projects[0].image, 'PocketBase saved the initial request cover').toBeTruthy();
    expectSingleMultipartCreate(writes);
  });

  test.describe('ambiguous response handling', () => {
    test.use({ serviceWorkers: 'block' });

    test('does not replay creation when the saved response is lost', async ({ page }) => {
      const title = `${runPrefix} ambiguous`;
      const writes = captureProjectWrites(page);
      let interceptedCreateCount = 0;

      await page.route('**/api/collections/projects/records', async route => {
        const request = route.request();
        if (request.method() !== 'POST') {
          await route.continue();
          return;
        }

        interceptedCreateCount += 1;
        const response = await route.fetch();
        expect(response.ok(), 'PocketBase persisted the intercepted create').toBe(true);
        await route.abort('failed');
      });

      await fillProjectTitle(page, title);
      await page.getByRole('button', { name: 'Create project' }).click();

      await expect
        .poll(() => interceptedCreateCount, {
          message: 'the browser create request reached the response-loss route',
          timeout: 15_000,
        })
        .toBe(1);
      await expect(page.getByText('Project creation status unknown', { exact: true })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page).toHaveURL(/\/projects\/new$/);
      await expect.poll(async () => getRunProjects(pb), { timeout: 15_000 }).toHaveLength(1);

      await page.waitForTimeout(2_000);

      const projects = await getRunProjects(pb);
      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({ title });
      expectSingleMultipartCreate(writes);
    });
  });
});
