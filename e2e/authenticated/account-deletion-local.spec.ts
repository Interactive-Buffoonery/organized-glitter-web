import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import PocketBase, { BaseAuthStore } from 'pocketbase';
import { assertLocalE2ETargets } from '../fixtures/local-safety';

const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const backendUrl = process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
const fixturePassword = `disposable-${randomUUID()}`;
let admin: PocketBase;
let accountId: string;
let email: string;

// Deletion proofs and credentials must never enter browser traces or screenshots.
test.use({
  storageState: { cookies: [], origins: [] },
  serviceWorkers: 'block',
  trace: 'off',
  video: 'off',
  screenshot: 'off',
});

test.beforeEach(async ({ page }) => {
  assertLocalE2ETargets({ appUrl, pocketBaseUrl: backendUrl, specName: 'Account deletion' });
  const adminEmail = process.env.E2E_DELETION_ADMIN_EMAIL;
  const adminPassword = process.env.E2E_DELETION_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword)
    throw new Error(
      'Account deletion requires a disposable local backend and E2E_DELETION_ADMIN_EMAIL/PASSWORD.'
    );
  admin = new PocketBase(backendUrl, new BaseAuthStore());
  await admin.collection('_superusers').authWithPassword(adminEmail, adminPassword);
  email = `deletion-${randomUUID()}@localhost.test`;
  const account = await admin.collection('users').create({
    email,
    password: fixturePassword,
    passwordConfirm: fixturePassword,
    username: 'Deletion fixture',
    verified: true,
  });
  accountId = account.id;
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  await page.goto('/delete-account');
  await expect(
    page.getByRole('heading', { name: 'Delete your account', exact: true })
  ).toBeVisible();
});

test.afterEach(async () => {
  if (!admin || !accountId) return;
  try {
    await admin.collection('users').delete(accountId);
  } catch (error) {
    if (!(error && typeof error === 'object' && 'status' in error && error.status === 404))
      throw new Error('Disposable account cleanup failed.');
  }
});

async function verify(page: Page, password = fixturePassword) {
  await page.getByLabel('Current password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Verify password', exact: true }).click();
}
async function confirm(page: Page) {
  await page.getByLabel('I understand that this permanently deletes my account').check();
  await page.getByRole('button', { name: 'Delete my account', exact: true }).click();
}
async function forgetSession(page: Page) {
  await page.evaluate(() => {
    const debug = window as Window & { pb?: { authStore: { clear(): void } } };
    if (!debug.pb) throw new Error('Local auth fixture unavailable.');
    debug.pb.authStore.clear();
  });
}

test('requires fresh verification and blocks incorrect password without deleting', async ({
  page,
}) => {
  let posts = 0;
  page.on('request', request => {
    if (request.url().endsWith('/api/account/delete')) posts++;
  });
  await expect(page.getByRole('button', { name: 'Delete my account', exact: true })).toBeDisabled();
  await verify(page, 'incorrect-password');
  await expect(page.getByRole('alert')).toContainText('Could not verify');
  expect(posts).toBe(0);
  expect((await admin.collection('users').getOne(accountId)).id === accountId).toBe(true);
});

test('recovers a lost real backend response after tab closure without login', async ({
  page,
  context,
}) => {
  await verify(page);
  await page.route(
    '**/api/account/delete',
    async route => {
      const upstream = await route.fetch();
      expect(upstream.status()).toBe(200);
      await route.abort('failed');
    },
    { times: 1 }
  );
  await confirm(page);
  await expect(page.getByRole('status')).toContainText('not confirmed');
  await forgetSession(page);
  await page.close();
  const recovered = await context.newPage();
  await recovered.goto('/dashboard');
  await expect(recovered).toHaveURL(/\/delete-account$/);
  await recovered.getByRole('button', { name: 'Check deletion status', exact: true }).click();
  await expect(recovered.getByRole('status')).toContainText('Account deleted');
  await expect(recovered.getByRole('status')).toContainText('Additional cleanup');
  await expect(recovered).not.toHaveURL(/\/login$/);
  const exists = await admin
    .collection('users')
    .getOne(accountId)
    .then(
      () => true,
      () => false
    );
  expect(exists).toBe(false);
});

test('keeps an unknown proof uncertain after a failed initial dispatch and reload', async ({
  page,
}) => {
  await verify(page);
  await page.route('**/api/account/delete', route => route.abort('failed'), { times: 1 });
  await confirm(page);
  await expect(page.getByRole('status')).toContainText('not confirmed');
  await forgetSession(page);
  await page.reload();
  await page.getByRole('button', { name: 'Check deletion status', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('not confirmed');
  await expect(page.getByRole('status')).not.toContainText('not been deleted');
  expect((await admin.collection('users').getOne(accountId)).id === accountId).toBe(true);
});

test('blocks destructive send if IndexedDB cannot persist the proof', async ({ page }) => {
  await verify(page);
  await page.evaluate(() => {
    indexedDB.open = () => {
      throw new Error('Storage unavailable');
    };
  });
  let posts = 0;
  page.on('request', request => {
    if (request.url().endsWith('/api/account/delete')) posts++;
  });
  await confirm(page);
  await expect(page.getByRole('alert')).toContainText('browser storage');
  expect(posts).toBe(0);
});

test('locks a second tab and retains one private proof after ambiguity', async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await other.goto('/dashboard');
  await verify(page);
  await page.route('**/api/account/delete', route => route.abort('failed'));
  await confirm(page);
  await expect(page.getByRole('status')).toContainText('not confirmed');
  await expect(other).toHaveURL(/\/delete-account$/);
  await expect(
    other.getByRole('button', { name: 'Check deletion status', exact: true })
  ).toBeVisible();
  const summary = await other.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('og-account-deletion', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Storage unavailable'));
    });
    const intents = await new Promise<Array<{ proof: string }>>((resolve, reject) => {
      const request = db.transaction('intents').objectStore('intents').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Read failed'));
    });
    db.close();
    return {
      count: intents.length,
      valid: intents.every(intent => /^[A-Za-z0-9_-]{43}$/.test(intent.proof)),
      inLocalStorage: Object.values(localStorage).some(value =>
        intents.some(intent => value.includes(intent.proof))
      ),
    };
  });
  expect(summary).toEqual({ count: 1, valid: true, inLocalStorage: false });
});

test('preserves unfinished drafts if Logout is attempted during an unresolved deletion', async ({
  page,
}) => {
  await page.goto('/projects/new');
  await page.getByLabel('Project title').fill('Unfinished deletion fixture');
  await page.goto('/delete-account');
  const hadDraft = await page.evaluate(() =>
    Object.keys(localStorage).some(key => key.startsWith('og:form-draft:v1:'))
  );
  expect(hadDraft).toBe(true);
  await verify(page);
  await page.route('**/api/account/delete', route => route.abort('failed'));
  await confirm(page);
  await expect(page.getByRole('status')).toContainText('not confirmed');
  const desktopMenu = page.getByRole('button', { name: 'Account menu', exact: true });
  if (await desktopMenu.isVisible()) await desktopMenu.click();
  else await page.getByRole('button', { name: 'Open account menu', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByText('Logout', { exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  await expect(
    page.getByText('Resolve your pending account deletion before signing out.', { exact: true })
  ).toBeVisible();
  const keptDraft = await page.evaluate(() =>
    Object.keys(localStorage).some(key => key.startsWith('og:form-draft:v1:'))
  );
  expect(keptDraft).toBe(true);
});
