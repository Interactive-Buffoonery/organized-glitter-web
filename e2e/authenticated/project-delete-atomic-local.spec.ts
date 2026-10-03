import { expect, test, type Page } from '@playwright/test';
import PocketBase from 'pocketbase';
import { randomUUID } from 'node:crypto';

import { assertLocalE2ETargets, isLocalUrl } from '../fixtures/local-safety';

type FixtureIds = {
  noteId?: string;
  projectId?: string;
  projectTagId?: string;
  tagId?: string;
};

const pocketBaseUrl = process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const runId = randomUUID();
const projectTitle = `E2E Atomic Delete ${runId}`;

const isNotFoundError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'status' in error && error.status === 404;

const createClient = async () => {
  if (!email || !password) {
    throw new Error('Missing E2E_TEST_EMAIL or E2E_TEST_PASSWORD for project delete E2E test.');
  }

  const pb = new PocketBase(pocketBaseUrl);
  await pb.collection('users').authWithPassword(email, password);
  if (!pb.authStore.record?.id) {
    throw new Error('PocketBase did not return an authenticated E2E user.');
  }
  return pb;
};

const safeDelete = async (pb: PocketBase, collection: string, id: string) => {
  try {
    await pb.collection(collection).delete(id);
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }
};

const createFixture = async (
  pb: PocketBase,
  fixture: FixtureIds
): Promise<Required<FixtureIds>> => {
  const userId = pb.authStore.record?.id;
  if (!userId) throw new Error('Missing authenticated user for project delete fixture.');

  const project = await pb.collection('projects').create<{ id: string }>({
    user: userId,
    title: projectTitle,
    status: 'progress',
    status_order: 4,
    kit_category: 'full',
  });
  fixture.projectId = project.id;
  const tag = await pb.collection('tags').create<{ id: string }>({
    user: userId,
    name: `Atomic delete ${runId}`,
    slug: `atomic-delete-${runId}`,
    color: '#7C3AED',
  });
  fixture.tagId = tag.id;
  const note = await pb.collection('progress_notes').create<{ id: string }>({
    project: project.id,
    content: 'This note must survive a rejected project deletion.',
    date: '2026-09-22',
  });
  fixture.noteId = note.id;
  const projectTag = await pb.collection('project_tags').create<{ id: string }>({
    project: project.id,
    tag: tag.id,
  });
  fixture.projectTagId = projectTag.id;

  return {
    noteId: note.id,
    projectId: project.id,
    projectTagId: projectTag.id,
    tagId: tag.id,
  };
};

const expectRecordExists = async (pb: PocketBase, collection: string, id: string) => {
  await expect.poll(async () => pb.collection(collection).getOne(id)).toMatchObject({ id });
};

const expectRecordMissing = async (pb: PocketBase, collection: string, id: string) => {
  await expect
    .poll(async () => {
      try {
        await pb.collection(collection).getOne(id);
        return false;
      } catch (error) {
        return isNotFoundError(error);
      }
    })
    .toBe(true);
};

const deleteProjectFromDetail = async (page: Page) => {
  await page.getByRole('button', { name: 'More project actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete project' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
};

test.describe('local atomic project deletion', () => {
  test.describe.configure({ timeout: 60_000 });
  test.use({ serviceWorkers: 'block' });

  test.skip(
    !isLocalUrl(appUrl) || !isLocalUrl(pocketBaseUrl),
    `Project delete E2E tests only run against local targets, got ${appUrl} and ${pocketBaseUrl}`
  );

  let pb: PocketBase;
  let fixture: FixtureIds | undefined;

  test.beforeAll(async () => {
    assertLocalE2ETargets({ appUrl, pocketBaseUrl, specName: 'Local atomic project deletion' });
    pb = await createClient();
  });

  test.afterEach(async () => {
    if (!fixture) return;
    if (fixture.projectId) await safeDelete(pb, 'projects', fixture.projectId);
    if (fixture.noteId) await safeDelete(pb, 'progress_notes', fixture.noteId);
    if (fixture.projectTagId) await safeDelete(pb, 'project_tags', fixture.projectTagId);
    if (fixture.tagId) await safeDelete(pb, 'tags', fixture.tagId);
    fixture = undefined;
  });

  test('keeps children when deletion fails, then cascades children while preserving the tag', async ({
    page,
  }) => {
    fixture = {};
    const created = await createFixture(pb, fixture);
    fixture = created;
    const projectDeletePath = `/api/collections/projects/records/${created.projectId}`;

    await page.route(`**${projectDeletePath}`, async route => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 500,
            message: 'Rejected by atomic deletion regression test.',
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto(`/projects/${created.projectId}`);
    await expect(page.getByRole('heading', { name: projectTitle })).toBeVisible({
      timeout: 15_000,
    });

    await deleteProjectFromDetail(page);
    await expect(page.locator('[data-sonner-toast][data-type="error"]').first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).toHaveURL(new RegExp(`/projects/${created.projectId}$`));

    await expectRecordExists(pb, 'projects', created.projectId);
    await expectRecordExists(pb, 'progress_notes', created.noteId);
    await expectRecordExists(pb, 'project_tags', created.projectTagId);
    await expectRecordExists(pb, 'tags', created.tagId);

    await page.unroute(`**${projectDeletePath}`);
    await deleteProjectFromDetail(page);
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });

    await expectRecordMissing(pb, 'projects', created.projectId);
    await expectRecordMissing(pb, 'progress_notes', created.noteId);
    await expectRecordMissing(pb, 'project_tags', created.projectTagId);
    await expectRecordExists(pb, 'tags', created.tagId);
  });
});
