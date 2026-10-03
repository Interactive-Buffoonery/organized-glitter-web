/**
 * Project color-count specs field (#86 / #87).
 *
 * The project specs section exposes a "# of colors" number input bound to the
 * `colorCount` form field, which persists to the PocketBase `color_count`
 * column. This spec proves the full round trip against the real backend:
 *
 *   1. A project is created via PocketBase with a known `color_count`, so the
 *      edit form has a value to render back.
 *   2. The edit route renders that value in the `#colorCount` number input
 *      (render-back from persisted data).
 *   3. The field accepts a new value through the UI and "Update project"
 *      persists it — verified by re-fetching the record from PocketBase, not by
 *      depending on toast copy or a redirect target.
 *
 * The project is created and torn down per run, so the shared fixture project is
 * never mutated. Mirrors the create/teardown pattern in
 * e2e/authenticated/cover-image-update.spec.ts.
 */

import { expect, test } from '@playwright/test';
import PocketBase from 'pocketbase';
import { randomUUID } from 'node:crypto';

import { assertLocalE2ETargets } from '../fixtures/local-safety';

type ProjectRecord = {
  id: string;
  title: string;
  user: string;
  color_count?: number;
};

const pocketBaseUrl = process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

const INITIAL_COLOR_COUNT = 37;
const UPDATED_COLOR_COUNT = 84;

const createClient = async () => {
  if (!email || !password) {
    throw new Error('Missing E2E_TEST_EMAIL or E2E_TEST_PASSWORD for color-count E2E test.');
  }
  const pb = new PocketBase(pocketBaseUrl);
  await pb.collection('users').authWithPassword(email, password);
  if (!pb.authStore.record?.id) {
    throw new Error('PocketBase did not return an authenticated E2E user.');
  }
  return pb;
};

test.describe('Project color-count specs field', () => {
  let pb: PocketBase;
  let projectId: string | null = null;

  test.beforeAll(async () => {
    assertLocalE2ETargets({
      appUrl,
      pocketBaseUrl,
      specName: 'Project color-count specs field',
    });
    pb = await createClient();
  });

  test.beforeEach(async () => {
    const project = await pb.collection('projects').create<ProjectRecord>({
      user: pb.authStore.record!.id,
      title: `E2E Color Count ${randomUUID().slice(0, 8)}`,
      status: 'stash',
      kit_category: 'full',
      color_count: INITIAL_COLOR_COUNT,
    });
    projectId = project.id;
  });

  test.afterEach(async () => {
    if (!projectId) return;
    try {
      await pb.collection('projects').delete(projectId);
    } catch (error) {
      const status = typeof error === 'object' && error && 'status' in error ? error.status : null;
      if (status !== 404) throw error;
    }
    projectId = null;
  });

  test('renders the persisted color count and saves an edited value', async ({ page }) => {
    expect(projectId).toBeTruthy();
    await page.goto(`/projects/${projectId}/edit`);

    const colorCountInput = page.locator('#colorCount');
    await expect(colorCountInput).toBeVisible({ timeout: 15_000 });

    // The label is the user-facing spec name; assert it is wired to the input.
    await expect(page.getByLabel('# of colors')).toBeVisible();

    // Render-back: the input reflects the persisted PocketBase value.
    await expect(colorCountInput).toHaveValue(String(INITIAL_COLOR_COUNT));

    // The field accepts a new value through the UI.
    await colorCountInput.fill(String(UPDATED_COLOR_COUNT));
    await expect(colorCountInput).toHaveValue(String(UPDATED_COLOR_COUNT));

    await page.getByRole('button', { name: 'Update project' }).click();

    // Saving navigates away from the edit form; confirm the value persisted by
    // reading the record back from the backend rather than trusting UI copy.
    await expect
      .poll(
        async () => {
          const record = await pb.collection('projects').getOne<ProjectRecord>(projectId!);
          return record.color_count;
        },
        { timeout: 15_000 }
      )
      .toBe(UPDATED_COLOR_COUNT);
  });
});
