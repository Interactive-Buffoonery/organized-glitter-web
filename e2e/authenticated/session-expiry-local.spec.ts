import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertLocalE2ETargets } from '../fixtures/local-safety';

const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const pocketBaseUrl = process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
const coverFixture = path.join(
  path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))),
  'e2e/fixtures/portrait-cover.jpg'
);

test.use({ serviceWorkers: 'block' });

const signInAgain = async (page: Page) => {
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email').fill(process.env.E2E_TEST_EMAIL!);
  await page.getByLabel('Password').fill(process.env.E2E_TEST_PASSWORD!);
  await page.getByRole('button', { name: 'Sign In' }).click();
};

const keepCurrentSessionDraft = async (page: Page) => {
  const recovery = page.getByRole('region', { name: 'Unfinished draft' });
  await expect(recovery).toBeVisible();
  await recovery.getByRole('button', { name: 'Discard draft' }).click();
  await expect(recovery).not.toBeVisible();
};

test.beforeEach(async ({ page }) => {
  assertLocalE2ETargets({ appUrl, pocketBaseUrl, specName: 'Session expiry recovery' });
  await page.goto('/overview');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const debugWindow = window as Window & { pb?: { authStore?: { record?: unknown } } };
        return Boolean(debugWindow.pb?.authStore?.record);
      })
    )
    .toBe(true);
});

test('keeps a project draft when a save discovers an expired session', async ({
  page,
}, testInfo) => {
  await page.goto('/projects/new');
  await expect(page.getByRole('heading', { name: 'New project' })).toBeVisible();
  await page.getByLabel('Project title').fill('Unsent session recovery project');
  await page.locator('#project-image-input').setInputFiles(coverFixture);
  await page
    .getByRole('dialog', { name: 'Crop project image' })
    .getByRole('button', { name: 'Skip crop' })
    .click();
  await expect(page.getByRole('img', { name: 'Project preview' })).toBeVisible();

  let createAttempts = 0;
  await page.route('**/api/collections/projects/records', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    createAttempts += 1;
    return route.fulfill({
      status: createAttempts === 1 ? 401 : 400,
      contentType: 'application/json',
      body: JSON.stringify({
        status: createAttempts === 1 ? 401 : 400,
        message: createAttempts === 1 ? 'Invalid authorization token.' : 'Test retry received.',
      }),
    });
  });

  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await testInfo.attach('expired-session-login', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  expect(createAttempts).toBe(1);

  await signInAgain(page);
  await keepCurrentSessionDraft(page);

  await expect(page).toHaveURL(/\/projects\/new$/);
  await expect(page.getByLabel('Project title')).toHaveValue('Unsent session recovery project');
  await expect(page.getByRole('img', { name: 'Project preview' })).toBeVisible();
  expect(createAttempts, 'the failed write is not replayed automatically').toBe(1);

  await page.getByRole('button', { name: 'Create project' }).click();
  await expect.poll(() => createAttempts).toBe(2);
  await expect(page).toHaveURL(/\/projects\/new$/);
});

test('clears a mounted draft when another account replaces the session', async ({ page }) => {
  await page.goto('/projects/new');
  await page.getByLabel('Project title').fill('Private account A draft');

  await page.evaluate(() => {
    const authStore = (
      window as Window & {
        pb?: {
          authStore: {
            token: string;
            record: Record<string, unknown> | null;
            save: (token: string, record: unknown) => void;
          };
        };
      }
    ).pb?.authStore;
    if (!authStore?.record) throw new Error('PocketBase auth debug hook is unavailable');
    authStore.save(authStore.token, { ...authStore.record, id: 'account-b-test' });
  });

  await expect(page.getByLabel('Project title')).toHaveValue('');
  await expect(page.getByLabel('Project title')).not.toHaveValue('Private account A draft');
});
