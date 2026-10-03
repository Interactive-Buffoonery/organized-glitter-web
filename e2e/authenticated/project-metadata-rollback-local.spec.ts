/** Real local PocketBase regression for new-project metadata rollback. */
import { expect, test } from '@playwright/test';
import PocketBase from 'pocketbase';
import { randomUUID } from 'node:crypto';
import { assertLocalE2ETargets } from '../fixtures/local-safety';

const pocketBaseUrl = process.env.VITE_POCKETBASE_URL!;
const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const companyName = `E2E Rollback Company ${randomUUID().slice(0, 8)}`;
const artistName = `E2E Rollback Artist ${randomUUID().slice(0, 8)}`;
const projectTitle = `E2E Rollback Project ${randomUUID().slice(0, 8)}`;

test.use({ serviceWorkers: 'block' });

test('rolls back a company when artist creation fails during project save', async ({ page }) => {
  assertLocalE2ETargets({ appUrl, pocketBaseUrl, specName: 'Project metadata rollback' });
  const pb = new PocketBase(pocketBaseUrl);
  await pb
    .collection('users')
    .authWithPassword(process.env.E2E_TEST_EMAIL!, process.env.E2E_TEST_PASSWORD!);
  try {
    await page.goto('/projects/new');
    await expect(page.getByRole('heading', { name: 'New project' })).toBeVisible();
    await page.getByLabel('Project title').fill(projectTitle);
    await page.getByRole('button', { name: 'Add Company' }).click();
    const companyDialog = page.getByRole('dialog', { name: 'Add New Company' });
    await companyDialog.getByLabel('Company Name').fill(companyName);
    await companyDialog.getByRole('button', { name: 'Add Company' }).click();
    await expect(companyDialog).not.toBeVisible();
    const getCompanies = () =>
      pb.collection('companies').getFullList<{ id: string }>({
        filter: pb.filter('name = {:name}', { name: companyName }),
      });
    expect(await getCompanies()).toHaveLength(0);

    let artistCreateAttempts = 0;
    await page.route('**/api/collections/artists/records', async route => {
      if (route.request().method() === 'POST') {
        artistCreateAttempts += 1;
        await route.fulfill({
          status: 503,
          body: '{"message":"Artist service unavailable"}',
          contentType: 'application/json',
        });
      } else {
        await route.continue();
      }
    });
    await page.getByRole('button', { name: 'Add Artist' }).click();
    const artistDialog = page.getByRole('dialog', { name: 'Add New Artist' });
    await artistDialog.getByLabel('Artist Name').fill(artistName);
    await artistDialog.getByRole('button', { name: 'Add Artist' }).click();
    await expect(artistDialog).not.toBeVisible();
    expect(await getCompanies()).toHaveLength(0);

    await page.getByRole('button', { name: 'Create project' }).click();
    await expect.poll(() => artistCreateAttempts).toBe(1);
    await expect(page.getByRole('alert')).toBeVisible();

    await expect.poll(async () => (await getCompanies()).length).toBe(0);
    const projects = await pb.collection('projects').getFullList({
      filter: pb.filter('title = {:title}', { title: projectTitle }),
    });
    expect(projects).toHaveLength(0);
  } finally {
    const cleanupFailures: string[] = [];
    const deleteRecords = async (collection: string, ids: string[]) => {
      for (const id of ids) {
        try {
          await pb.collection(collection).delete(id);
        } catch (error) {
          cleanupFailures.push(`${collection}/${id}`);
          console.warn(`Failed to clean up ${collection}/${id}`, error);
        }
      }
    };
    const records = await pb.collection('projects').getFullList<{ id: string }>({
      filter: pb.filter('title = {:title}', { title: projectTitle }),
    });
    await deleteRecords(
      'projects',
      records.map(record => record.id)
    );
    for (const [collection, name] of [
      ['artists', artistName],
      ['companies', companyName],
    ]) {
      const metadata = await pb.collection(collection).getFullList<{ id: string }>({
        filter: pb.filter('name = {:name}', { name }),
      });
      await deleteRecords(
        collection,
        metadata.map(record => record.id)
      );
    }
    expect(cleanupFailures, `Cleanup failed for ${cleanupFailures.join(', ')}`).toEqual([]);
  }
});
