import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import PocketBase, { BaseAuthStore } from 'pocketbase';
import type {} from '../../src/e2e/accountDeletionBridge';
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
  await expect.poll(() => page.evaluate(() => Boolean(window.__ogDeletionQa))).toBe(true);
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

test('reverifies the same proof and retries once with the current session', async ({ page }) => {
  await verify(page);
  await page.route('**/api/account/delete', route => route.abort('failed'), { times: 1 });
  await confirm(page);
  await expect(page.getByRole('status')).toContainText('not confirmed');
  await page.getByRole('button', { name: 'Check deletion status', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('not confirmed');
  await page.getByLabel('Current password', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'Verify password for retry' }).click();
  await page.getByLabel(/I confirm this recovery retry/).check();
  await page.getByRole('button', { name: 'Retry deletion with current session' }).click();
  await expect(page.getByRole('status')).toContainText('Account deleted');
});

test('blocks destructive send if IndexedDB cannot persist the proof', async ({ page }) => {
  await verify(page);
  await page.evaluate(() => {
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: {
        open: () => {
          throw new Error('Storage unavailable');
        },
      },
    });
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

test('serializes a two-tab sign-out claim against intent admission', async ({ page, context }) => {
  const other = await context.newPage();
  await other.goto('/delete-account');
  await expect.poll(() => other.evaluate(() => Boolean(window.__ogDeletionQa))).toBe(true);
  const makeIntent = async () =>
    page.evaluate(
      async ({ id, backend }) => {
        const { deletionIntents } = window.__ogDeletionQa!;
        try {
          await deletionIntents.create({
            version: 1,
            backendUrl: backend,
            accountId: id,
            proof: 'x'.repeat(43),
            phase: 'pending',
            cleanup: 'pending',
            localCleanupDone: false,
            dispatch: 'prepared',
          });
          return true;
        } catch {
          return false;
        }
      },
      { id: accountId, backend: backendUrl }
    );
  const claim = async () =>
    other.evaluate(
      async ({ id, backend }) => {
        const { deletionIntents } = window.__ogDeletionQa!;
        return deletionIntents.claimSignOut(backend, id, 'epoch-a');
      },
      { id: accountId, backend: backendUrl }
    );
  const [created, signedOut] = await Promise.all([makeIntent(), claim()]);
  expect(created === signedOut).toBe(false);
});

test('rejects an in-flight account switch when an intent arrives', async ({ page, context }) => {
  const otherEmail = `deletion-switch-${randomUUID()}@localhost.test`;
  const other = await admin.collection('users').create({
    email: otherEmail,
    password: fixturePassword,
    passwordConfirm: fixturePassword,
    username: 'Switch fixture',
    verified: true,
  });
  try {
    let release!: () => void;
    let intercepted!: () => void;
    const reachedRequest = new Promise<void>(resolve => {
      intercepted = resolve;
    });
    await page.route('**/api/collections/users/auth-with-password', async route => {
      if (!route.request().postData()?.includes(otherEmail)) return route.continue();
      intercepted();
      await new Promise<void>(resolve => {
        release = resolve;
      });
      await route.continue();
    });
    const login = page.evaluate(
      async ({ loginEmail, password }) => {
        const { loginWithPassword } = window.__ogDeletionQa!;
        const result = await loginWithPassword({ email: loginEmail, password });
        const app = window as Window & { pb?: { authStore: { record?: { id: string } } } };
        return { success: result.success, accountId: app.pb?.authStore.record?.id };
      },
      { loginEmail: otherEmail, password: fixturePassword }
    );
    await reachedRequest;
    const otherTab = await context.newPage();
    await otherTab.goto('/delete-account');
    await expect.poll(() => otherTab.evaluate(() => Boolean(window.__ogDeletionQa))).toBe(true);
    await otherTab.evaluate(
      async ({ id, backend }) => {
        const { deletionIntents } = window.__ogDeletionQa!;
        await deletionIntents.create({
          version: 1,
          backendUrl: backend,
          accountId: id,
          proof: 'x'.repeat(43),
          phase: 'pending',
          cleanup: 'pending',
          localCleanupDone: false,
          dispatch: 'prepared',
        });
      },
      { id: accountId, backend: backendUrl }
    );
    release();
    const result = await login;
    expect(result).toEqual({ success: false, accountId });
  } finally {
    await admin.collection('users').delete(other.id);
  }
});

test('releases a completed sign-out claim only during fresh login application', async ({
  page,
}) => {
  await page.evaluate(
    async ({ id, backend }) => {
      const { deletionIntents } = window.__ogDeletionQa!;
      await deletionIntents.claimSignOut(backend, id, 'old-session');
      const app = window as Window & { pb?: { authStore: { clear(): void } } };
      app.pb?.authStore.clear();
    },
    { id: accountId, backend: backendUrl }
  );
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  const remaining = await page.evaluate(
    async ({ id, backend }) => {
      const { deletionIntents } = window.__ogDeletionQa!;
      return deletionIntents.get(backend, id);
    },
    { id: accountId, backend: backendUrl }
  );
  expect(remaining).toBeUndefined();
});

test('keeps an interrupted sign-out claim visible and releases only its owner', async ({
  page,
}) => {
  const result = await page.evaluate(
    async ({ backend, id }) => {
      const { deletionIntents } = window.__ogDeletionQa!;
      const marker = localStorage.getItem('og:session-identity:v1:pocketbase_auth');
      if (!marker) throw new Error('Session identity unavailable');
      const { epoch } = JSON.parse(marker) as { epoch: string };
      const first = await deletionIntents.claimSignOut(backend, id, epoch, 'first-claim');
      const concurrent = await deletionIntents.claimSignOut(backend, id, epoch, 'second-claim');
      const wrongRelease = await deletionIntents.releaseSignOut(backend, id, 'second-claim');
      return { first, concurrent, wrongRelease };
    },
    { backend: backendUrl, id: accountId }
  );
  expect(result).toEqual({ first: true, concurrent: false, wrongRelease: false });
  await page.evaluate(() => localStorage.setItem('og:form-draft:v1:interrupted-signout', 'kept'));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Sign-out was interrupted');
  await expect(page.getByRole('link', { name: 'Contact support' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish signing out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.__ogDeletionQa))).toBe(true);
  const retained = await page.evaluate(
    async ({ backend, id }) => {
      const { deletionIntents } = window.__ogDeletionQa!;
      return {
        claim: await deletionIntents.get(backend, id),
        draft: localStorage.getItem('og:form-draft:v1:interrupted-signout'),
      };
    },
    { backend: backendUrl, id: accountId }
  );
  expect(retained.claim).toMatchObject({ kind: 'signed_out', accountId });
  expect(retained.claim).not.toHaveProperty('claimId', 'first-claim');
  expect(retained.draft).toBe('kept');
  expect(
    await page.evaluate(
      async ({ backend, id }) =>
        window.__ogDeletionQa!.deletionIntents.releaseSignOut(backend, id, 'first-claim'),
      { backend: backendUrl, id: accountId }
    )
  ).toBe(false);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  await page.goto('/delete-account');
  await expect(page.getByRole('heading', { name: 'Delete your account' })).toBeVisible();
  expect(
    await page.evaluate(
      async ({ backend, id }) => window.__ogDeletionQa!.deletionIntents.get(backend, id),
      { backend: backendUrl, id: accountId }
    )
  ).toBeUndefined();
});

test('keeps the session and drafts if finishing sign-out storage aborts', async ({ page }) => {
  await page.evaluate(
    async ({ backend, id }) => {
      const marker = localStorage.getItem('og:session-identity:v1:pocketbase_auth');
      if (!marker) throw new Error('Session identity unavailable');
      const { epoch } = JSON.parse(marker) as { epoch: string };
      localStorage.setItem('og:form-draft:v1:signout-storage-error', 'kept');
      await window.__ogDeletionQa!.deletionIntents.claimSignOut(backend, id, epoch);
    },
    { backend: backendUrl, id: accountId }
  );
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Sign-out was interrupted');
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = Reflect.apply(put, this, args) as IDBRequest<IDBValidKey>;
      this.transaction.abort();
      return request;
    };
  });
  await page.getByRole('button', { name: 'Finish signing out' }).click();
  await expect(page.getByRole('alert')).toContainText('Could not finish signing out');
  expect(
    await page.evaluate(() => ({
      accountId: window.pb?.authStore.record?.id,
      draft: localStorage.getItem('og:form-draft:v1:signout-storage-error'),
    }))
  ).toEqual({ accountId, draft: 'kept' });
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Sign-out was interrupted');
  expect(
    await page.evaluate(
      async ({ backend, id }) => window.__ogDeletionQa!.deletionIntents.get(backend, id),
      { backend: backendUrl, id: accountId }
    )
  ).toMatchObject({ kind: 'signed_out', accountId });
});

test('releases only the completed receipt marker after a cleanup interruption', async ({
  page,
}) => {
  const markers = await page.evaluate(
    async ({ backend, id }) => {
      const { deletionIntents, armDeletionTransportFence } = window.__ogDeletionQa!;
      const completed = armDeletionTransportFence(backend, id);
      const concurrent = armDeletionTransportFence(backend, id);
      await deletionIntents.create({
        version: 1,
        backendUrl: backend,
        accountId: id,
        proof: 'x'.repeat(43),
        phase: 'deleted',
        cleanup: 'completed',
        localCleanupDone: true,
        transportFenceId: completed,
      });
      return { completed, concurrent };
    },
    { backend: backendUrl, id: accountId }
  );
  await page.reload();
  // Startup recovery releases the marker after an async IndexedDB read.
  await expect
    .poll(() =>
      page.evaluate(
        ({ completed, concurrent }) => ({
          completed: Object.keys(localStorage).some(
            key => key.endsWith(`:${completed}`) && key.includes('analytics-fence')
          ),
          concurrent: Object.keys(localStorage).some(
            key => key.endsWith(`:${concurrent}`) && key.includes('analytics-fence')
          ),
        }),
        markers
      )
    )
    .toEqual({ completed: false, concurrent: true });
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

test('uses the account key and ignores malformed records for another backend', async ({ page }) => {
  const result = await page.evaluate(
    async ({ backend, id }) => {
      const { deletionIntents } = window.__ogDeletionQa!;
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('og-account-deletion', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const write = (backendUrl: string, accountId: string) =>
        new Promise<void>((resolve, reject) => {
          const transaction = database.transaction('intents', 'readwrite');
          transaction.objectStore('intents').put({ backendUrl, accountId, version: 2 });
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        });
      await write('http://unrelated.local', id);
      const foreignIgnored = (await deletionIntents.list(backend)).length === 0;
      await write(backend, id);
      const ownRejected = await deletionIntents.get(backend, id).then(
        () => false,
        () => true
      );
      database.close();
      return { foreignIgnored, ownRejected };
    },
    { backend: backendUrl, id: accountId }
  );
  expect(result).toEqual({ foreignIgnored: true, ownRejected: true });
});

test('admits one proof when two tabs create an intent concurrently', async ({ page, context }) => {
  const other = await context.newPage();
  await other.goto('/delete-account');
  await expect.poll(() => other.evaluate(() => Boolean(window.__ogDeletionQa))).toBe(true);
  const create = (tab: Page, proof: string) =>
    tab.evaluate(
      async ({ backend, id, value }) => {
        const { deletionIntents } = window.__ogDeletionQa!;
        const intent = await deletionIntents.create({
          version: 1,
          backendUrl: backend,
          accountId: id,
          proof: value,
          phase: 'pending',
          cleanup: 'pending',
          localCleanupDone: false,
          dispatch: 'prepared',
        });
        return intent.proof;
      },
      { backend: backendUrl, id: accountId, value: proof }
    );
  const [first, second] = await Promise.all([
    create(page, 'a'.repeat(43)),
    create(other, 'b'.repeat(43)),
  ]);
  expect(first).toBe(second);
  expect(['a'.repeat(43), 'b'.repeat(43)]).toContain(first);
});

test('shows a bounded recovery error when private storage never opens', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: { open: () => ({}) },
    });
  });
  await page.reload();
  await expect(page.getByRole('alert')).toContainText(
    'Account recovery storage could not be checked',
    {
      timeout: 8000,
    }
  );
  await expect(page.getByRole('button', { name: 'Retry recovery check' })).toBeVisible();
});
