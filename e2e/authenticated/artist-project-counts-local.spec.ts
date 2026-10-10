import { devices, expect, test } from '@playwright/test';
import PocketBase from 'pocketbase';
import { randomUUID } from 'node:crypto';
import { assertLocalE2ETargets } from '../fixtures/local-safety';

const pocketBaseUrl = process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const browserName = process.env.E2E_ARTIST_BROWSER === 'webkit' ? 'webkit' : 'chromium';
test.use({ serviceWorkers: 'block' });
test.use(
  browserName === 'webkit'
    ? { ...devices['iPhone 13'], browserName: 'webkit' }
    : { ...devices['Desktop Chrome'], browserName: 'chromium' }
);

test('artist counts link to matching projects and recover after an endpoint failure', async ({
  page,
}) => {
  test.setTimeout(90_000);
  assertLocalE2ETargets({ appUrl, pocketBaseUrl, specName: 'Artist project counts' });
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) throw new Error('Missing local E2E credentials.');
  const pb = new PocketBase(pocketBaseUrl);
  await pb.collection('users').authWithPassword(email, password);
  const user = pb.authStore.record?.id;
  if (!user) throw new Error('Missing authenticated local E2E user.');
  const suffix = randomUUID();
  const artists: string[] = [];
  const projects: string[] = [];
  const usedName = `Counted artist ${suffix}`;
  const unusedName = `Unused artist ${suffix}`;
  const title = `Artist project ${suffix}`;

  try {
    const used = await pb.collection('artists').create({ user, name: usedName });
    artists.push(used.id);
    const unused = await pb.collection('artists').create({ user, name: unusedName });
    artists.push(unused.id);
    for (const name of [title, `${title} second`]) {
      const project = await pb.collection('projects').create({
        user,
        artist: used.id,
        title: name,
        status: 'stash',
        status_order: 2,
        kit_category: 'full',
      });
      projects.push(project.id);
    }

    await page.goto('/options/artists');
    await expect(page.getByRole('columnheader', { name: 'Projects', exact: true })).toBeVisible();
    const countedRow = page.getByRole('row').filter({ hasText: usedName });
    const unusedRow = page.getByRole('row').filter({ hasText: unusedName });
    const link = countedRow.getByRole('link', { name: '2 projects', exact: true });
    await expect(link).toHaveAttribute('href', `/dashboard?artist=${used.id}`);
    await expect(unusedRow.getByText('No projects', { exact: true })).toBeVisible();
    await expect(unusedRow.getByRole('link')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('artist-counts.png'), fullPage: true });
    await link.click();
    await expect(page).toHaveURL(new RegExp(`artist=${used.id}`));
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();

    let unavailable = true;
    await page.route('**/api/stats/artist-project-counts', route =>
      unavailable
        ? route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Synthetic local endpoint failure' }),
          })
        : route.continue()
    );
    await page.goto('/options/artists');
    await page.reload();
    await expect(page.getByText('Project counts are unavailable.', { exact: true })).toBeVisible();
    await expect(countedRow.getByText('Unavailable', { exact: true })).toBeVisible();
    unavailable = false;
    await page.getByRole('button', { name: 'Retry project counts' }).click();
    await expect(link).toBeVisible();
    await expect(page.getByText('Project counts are unavailable.', { exact: true })).toHaveCount(0);
  } finally {
    for (const id of projects) await pb.collection('projects').delete(id);
    for (const id of artists) await pb.collection('artists').delete(id);
  }
});
