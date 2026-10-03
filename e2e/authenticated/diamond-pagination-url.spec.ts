import { expect, test } from '@playwright/test';
import PocketBase from 'pocketbase';
import { randomUUID } from 'node:crypto';

import { assertLocalE2ETargets } from '../fixtures/local-safety';

const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const pocketBaseUrl = process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const fixturePrefix = `Diamond URL ${randomUUID()}`;

test.use({ serviceWorkers: 'block', trace: 'on', video: 'on' });

test.describe('diamond pagination shared URL', () => {
  test.setTimeout(180_000);

  let pb: PocketBase;
  const projectIds: string[] = [];
  const archivedTitle = `${fixturePrefix} ZZZ Archived`;

  test.beforeAll(async () => {
    assertLocalE2ETargets({ appUrl, pocketBaseUrl, specName: 'Diamond pagination URL' });
    if (!email || !password) throw new Error('Missing local E2E credentials.');

    pb = new PocketBase(pocketBaseUrl);
    await pb.collection('users').authWithPassword(email, password);
    const userId = pb.authStore.record?.id;
    if (!userId) throw new Error('Missing authenticated fixture user.');

    for (let index = 1; index <= 51; index++) {
      const title = `${fixturePrefix} ${String(index).padStart(2, '0')}`;
      const record = await pb.collection('projects').create<{ id: string }>({
        user: userId,
        title,
        title_sort: title.toLowerCase(),
        status: 'stash',
        drill_shape: 'round',
        kit_category: 'full',
      });
      projectIds.push(record.id);
    }
    const archived = await pb.collection('projects').create<{ id: string }>({
      user: userId,
      title: archivedTitle,
      title_sort: archivedTitle.toLowerCase(),
      status: 'archived',
      drill_shape: 'round',
      kit_category: 'full',
    });
    projectIds.push(archived.id);
  });

  test.afterAll(async () => {
    if (!pb) return;
    for (const id of projectIds) {
      await pb.collection('projects').delete(id);
    }
  });

  test('modified click and history preserve sort and panel filters', async ({ page, context }) => {
    await page.goto('/dashboard');
    await page.getByRole('combobox', { name: 'Drill Shape' }).click();
    await page.getByRole('option', { name: 'Round' }).click();
    await page.getByRole('checkbox', { name: 'Mini Kits' }).uncheck();
    await page.getByRole('checkbox', { name: 'Archived Kits' }).check();
    await page.getByRole('button', { name: /^Sort projects/ }).click();
    await page.getByRole('radio', { name: /Kit Name \(A → Z\)/ }).click();

    await expect(page.getByRole('link', { name: '1', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await page.getByRole('link', { name: 'Go to next page' }).click();
    await expect(page.getByRole('link', { name: '2', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(
      page.getByRole('button', { name: `Open project ${fixturePrefix} 26` })
    ).toBeVisible();

    const next = page.getByRole('link', { name: 'Go to next page' });
    const destination = new URL(await next.getAttribute('href')!, appUrl);
    expect(destination.searchParams.get('sort')).toBe('kit_name');
    expect(destination.searchParams.get('dir')).toBe('asc');
    expect(destination.searchParams.get('drillShape')).toBe('round');
    expect(destination.searchParams.get('includeMiniKits')).toBe('false');
    expect(destination.searchParams.get('includeArchived')).toBe('true');
    expect(destination.searchParams.get('page')).toBe('3');

    const newTabEvent = context.waitForEvent('page');
    await next.click({ modifiers: ['ControlOrMeta'] });
    const newTab = await newTabEvent;
    await expect(
      newTab.getByRole('button', { name: `Open project ${archivedTitle}` })
    ).toBeVisible();
    await expect(newTab.getByText('Sorted by Kit Name (A → Z)')).toBeVisible();
    await expect(newTab.getByRole('checkbox', { name: 'Archived Kits' })).toBeChecked();
    await expect(newTab.getByRole('checkbox', { name: 'Mini Kits' })).not.toBeChecked();

    await next.click();
    await expect(page.getByRole('button', { name: `Open project ${archivedTitle}` })).toBeVisible();
    const pageThreeUrl = page.url();
    await page.getByRole('button', { name: 'Diamond paintings' }).click();
    await expect(page).toHaveURL(pageThreeUrl);
    await expect(page.getByRole('button', { name: `Open project ${archivedTitle}` })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('link', { name: '2', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(
      page.getByRole('button', { name: `Open project ${fixturePrefix} 26` })
    ).toBeVisible();
    await page.goForward();
    await expect(page.getByRole('button', { name: `Open project ${archivedTitle}` })).toBeVisible();
    await expect(page.getByText('Sorted by Kit Name (A → Z)')).toBeVisible();
  });

  test('deep-search shared high page returns to the last real page', async ({ page }) => {
    const lastPageRequested = Promise.withResolvers<void>();
    const resumeLastPage = Promise.withResolvers<void>();
    await page.route('**/api/collections/projects/records?**', async route => {
      if (new URL(route.request().url()).searchParams.get('page') === '3') {
        lastPageRequested.resolve();
        await resumeLastPage.promise;
      }
      await route.continue();
    });

    const params = new URLSearchParams({
      search: fixturePrefix,
      searchAllFields: 'true',
      includeArchived: 'true',
      sort: 'kit_name',
      dir: 'asc',
      page: '999',
    });

    try {
      await page.goto(`/dashboard?${params}`);
      await lastPageRequested.promise;
      await expect(page).toHaveURL(/page=3(?:&|$)/);
      await expect(page.getByRole('region', { name: 'Project results' })).toHaveCount(0);
    } finally {
      resumeLastPage.resolve();
    }

    await expect(page.getByRole('button', { name: `Open project ${archivedTitle}` })).toBeVisible();
  });
});
