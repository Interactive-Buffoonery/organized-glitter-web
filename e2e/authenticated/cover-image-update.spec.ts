/**
 * Inline cover update flow.
 *
 * Exercises the overlay button on ProjectDetailView's hero image against a
 * project created for this test run, so the suite never mutates a shared
 * fixture record.
 */

import { expect, test, type Page } from '@playwright/test';
import PocketBase from 'pocketbase';
import { File } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertLocalE2ETargets } from '../fixtures/local-safety';

type ProjectRecord = {
  id: string;
  image?: string;
  title: string;
  user: string;
};

const rootDir = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const PORTRAIT_FIXTURE = path.join(rootDir, 'e2e', 'fixtures', 'portrait-cover.jpg');
const pocketBaseUrl = process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const initialCoverBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64'
);

const createClient = async () => {
  if (!email || !password) {
    throw new Error('Missing E2E_TEST_EMAIL or E2E_TEST_PASSWORD for cover image E2E tests.');
  }

  const pb = new PocketBase(pocketBaseUrl);
  await pb.collection('users').authWithPassword(email, password);
  if (!pb.authStore.record?.id) {
    throw new Error('PocketBase did not return an authenticated E2E user.');
  }
  return pb;
};

const createTemporaryProject = async (pb: PocketBase) => {
  const userId = pb.authStore.record?.id;
  if (!userId) {
    throw new Error('Missing authenticated user for temporary cover project.');
  }

  return pb.collection('projects').create<ProjectRecord>({
    user: userId,
    title: `E2E Cover Update ${randomUUID()}`,
    status: 'stash',
    kit_category: 'full',
    image: new File([initialCoverBytes], 'initial-cover.png', { type: 'image/png' }),
  });
};

const deleteTemporaryProject = async (pb: PocketBase, projectId: string) => {
  try {
    await pb.collection('projects').delete(projectId);
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error ? error.status : null;
    if (status !== 404) throw error;
  }
};

const replaceCoverViaUi = async (page: Page, filePath: string) => {
  const replaceButton = page.getByRole('button', { name: 'Replace cover image' });
  await expect(replaceButton).toBeVisible({ timeout: 15_000 });

  const fileChooserPromise = page.waitForEvent('filechooser');
  await replaceButton.click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(filePath);

  const cropDialog = page.getByRole('dialog');
  await expect(cropDialog).toBeVisible();
  await cropDialog.getByRole('button', { name: /portrait crop/i }).click();
  await cropDialog.getByRole('button', { name: /use crop/i }).click();
  await expect(page.getByText('Cover image updated')).toBeVisible({ timeout: 15_000 });
};

test.describe('Inline cover update', () => {
  let pb: PocketBase;
  let createdProjectId: string | null = null;

  test.beforeAll(async () => {
    assertLocalE2ETargets({
      appUrl,
      pocketBaseUrl,
      specName: 'Inline cover update',
    });
    pb = await createClient();
  });

  test.beforeEach(async () => {
    const project = await createTemporaryProject(pb);
    createdProjectId = project.id;
  });

  test.afterEach(async () => {
    if (createdProjectId) {
      await deleteTemporaryProject(pb, createdProjectId);
      createdProjectId = null;
    }
  });

  test('replaces the hero cover via the overlay editor without leaving the page', async ({
    page,
  }) => {
    expect(createdProjectId).toBeTruthy();
    const projectUrl = `/projects/${createdProjectId}`;
    await page.goto(projectUrl);

    const heroImage = page.locator('main img[alt]').first();
    await expect(heroImage).toBeVisible({ timeout: 15_000 });
    const originalSrc = await heroImage.getAttribute('src');
    expect(originalSrc).toBeTruthy();

    await replaceCoverViaUi(page, PORTRAIT_FIXTURE);

    expect(new URL(page.url()).pathname).toBe(projectUrl);

    await expect
      .poll(async () => heroImage.getAttribute('src'), { timeout: 15_000 })
      .not.toBe(originalSrc);

    const updatedSrc = await heroImage.getAttribute('src');
    expect(updatedSrc).toBeTruthy();

    await page.reload();
    await expect(page.getByRole('button', { name: 'Replace cover image' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(heroImage).toBeVisible();
    const reloadedSrc = await heroImage.getAttribute('src');
    expect(new URL(reloadedSrc!).pathname).toBe(new URL(updatedSrc!).pathname);

    await page.getByRole('button', { name: 'Edit project', exact: true }).click();
    await page.getByRole('button', { name: 'Crop image', exact: true }).click();
    await expect(page.getByRole('dialog', { name: /crop/i })).toBeVisible();
  });
});
