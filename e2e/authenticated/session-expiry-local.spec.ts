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
const fixtureProjectId = process.env.E2E_FIXTURE_PROJECT_ID ?? 'localproject003';
const fixtureColoringBookId = 'localcbook00001';

test.use({ serviceWorkers: 'block' });

const expireCurrentToken = async (page: Page) => {
  await page.evaluate(() => {
    const debugWindow = window as Window & {
      pb?: { authStore: { record: unknown; save: (token: string, record: unknown) => void } };
    };
    const authStore = debugWindow.pb?.authStore;
    if (!authStore?.record) throw new Error('PocketBase auth debug hook is unavailable');
    authStore.save('expired.jwt.token', authStore.record);
  });
};

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

test('keeps a project draft when the token expires before Save', async ({ page }) => {
  await page.goto('/projects/new');
  await expect(page.getByRole('heading', { name: 'New project' })).toBeVisible();
  await page.getByLabel('Project title').fill('Draft before session expiry');

  await expireCurrentToken(page);

  await signInAgain(page);

  await expect(page).toHaveURL(/\/projects\/new$/);
  await expect(page.getByLabel('Project title')).toHaveValue('Draft before session expiry');

  await expireCurrentToken(page);
  await signInAgain(page);

  await expect(page).toHaveURL(/\/projects\/new$/);
  await expect(page.getByLabel('Project title')).toHaveValue('Draft before session expiry');
});

test('reopens the project edit drawer with its unsaved changes', async ({ page }) => {
  await page.goto(`/projects/${fixtureProjectId}`);
  await page.getByRole('button', { name: 'Edit project' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit project' });
  await expect(editor).toBeVisible();
  await editor.getByLabel('Project title').fill('Unsent drawer title');

  await expireCurrentToken(page);
  await signInAgain(page);

  await expect(page).toHaveURL(new RegExp(`/projects/${fixtureProjectId}$`));
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel('Project title')).toHaveValue('Unsent drawer title');
});

test('restores an unsaved coloring book on its original craft route', async ({ page }) => {
  await page.goto('/projects/new?craft=coloring');
  await expect(page.getByRole('heading', { name: 'New coloring book' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Title *', exact: true }).fill('Unsent coloring book');

  await expireCurrentToken(page);
  await signInAgain(page);

  await expect(page).toHaveURL(/\/projects\/new\?craft=coloring$/);
  await expect(page.getByRole('textbox', { name: 'Title *', exact: true })).toHaveValue(
    'Unsent coloring book'
  );
});

test('reopens a coloring book edit drawer with its unsaved changes', async ({ page }) => {
  await page.goto(`/coloring/${fixtureColoringBookId}`);
  await page.getByRole('button', { name: 'Edit coloring book' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit coloring book' });
  await expect(editor).toBeVisible();
  await editor.getByRole('textbox', { name: 'Title *', exact: true }).fill('Unsent drawer book');

  await expireCurrentToken(page);
  await signInAgain(page);

  await expect(page).toHaveURL(new RegExp(`/coloring/${fixtureColoringBookId}$`));
  await expect(editor).toBeVisible();
  await expect(editor.getByRole('textbox', { name: 'Title *', exact: true })).toHaveValue(
    'Unsent drawer book'
  );
});

test('restores notes that were being edited', async ({ page }) => {
  await page.goto(`/coloring/${fixtureColoringBookId}`);
  await page.getByRole('button', { name: 'Edit notes' }).click();
  await page.getByRole('textbox', { name: 'Coloring book notes' }).fill('Notes before expiry');

  await expireCurrentToken(page);
  await signInAgain(page);

  await expect(page).toHaveURL(new RegExp(`/coloring/${fixtureColoringBookId}$`));
  await expect(page.getByRole('textbox', { name: 'Coloring book notes' })).toHaveText(
    'Notes before expiry'
  );
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

test('offers a confirmed create that finishes after sign-in', async ({ page }) => {
  await page.goto('/projects/new');
  await page.getByLabel('Project title').fill('Late confirmed session create');

  let releaseCreate: () => void = () => {};
  const createGate = new Promise<void>(resolve => {
    releaseCreate = resolve;
  });
  let createStarted = false;
  await page.route('**/api/collections/projects/records*', async route => {
    if (route.request().method() === 'POST') {
      createStarted = true;
      await createGate;
      return route.continue();
    }
    return route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ status: 401, message: 'Invalid authorization token.' }),
    });
  });

  await page.getByRole('button', { name: 'Create project' }).click();
  await expect.poll(() => createStarted).toBe(true);
  await page.evaluate(async () => {
    const client = (
      window as Window & {
        pb?: {
          collection: (name: string) => {
            getList: (page: number, size: number) => Promise<unknown>;
          };
        };
      }
    ).pb;
    if (!client) throw new Error('PocketBase auth debug hook is unavailable');
    try {
      await client.collection('projects').getList(1, 1);
    } catch {
      // The mocked 401 is the expiry signal under test.
    }
  });

  await signInAgain(page);
  await keepCurrentSessionDraft(page);
  await expect(page).toHaveURL(/\/projects\/new$/);
  await page.getByLabel('Project title').fill('Edited after sign-in');
  releaseCreate();
  const createdLink = page.getByRole('alert', { name: 'Late project creation' }).getByRole('link');
  await expect(createdLink).toHaveAttribute('href', /\/projects\/[a-zA-Z0-9_-]+$/);
  await expect(page).toHaveURL(/\/projects\/new$/);
  await expect(page.getByLabel('Project title')).toHaveValue('Edited after sign-in');
});

test('closes feedback and clears contact details on a direct account switch', async ({ page }) => {
  await page.goto('/profile');
  await page.getByRole('tab', { name: 'Support' }).click();
  await page.getByRole('button', { name: 'Send feedback' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share Your Feedback' });
  await dialog.getByLabel('Name').fill('Account A');
  await dialog.getByLabel('Email').fill('account-a@example.test');

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

  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Send feedback' }).click();
  await expect(dialog.getByLabel('Name')).toHaveValue('');
  await expect(dialog.getByLabel('Email')).toHaveValue('');
});
