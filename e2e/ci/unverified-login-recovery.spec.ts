import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import PocketBase from 'pocketbase';

import { assertLocalE2ETargets } from '../fixtures/local-safety';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });

test('unverified password login offers a usable verification recovery link', async ({ page }) => {
  const pocketBaseUrl = process.env.VITE_POCKETBASE_URL;
  assertLocalE2ETargets({
    appUrl: process.env.E2E_APP_URL,
    pocketBaseUrl,
    specName: 'Unverified login recovery',
  });

  const adminEmail = process.env.LOCAL_POCKETBASE_ADMIN_EMAIL;
  const adminPassword = process.env.LOCAL_POCKETBASE_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword)
    throw new Error('Missing disposable PocketBase admin credentials.');

  const admin = new PocketBase(pocketBaseUrl);
  await admin.collection('_superusers').authWithPassword(adminEmail, adminPassword);
  const suffix = randomUUID().slice(0, 8);
  const email = `unverified-${suffix}@example.test`;
  const password = 'Unverified-Test-Password-123!';
  const user = await admin.collection('users').create({
    email,
    username: `unverified${suffix}`,
    password,
    passwordConfirm: password,
    verified: false,
  });

  try {
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    const rejectedLogin = page.waitForResponse(response =>
      response.url().endsWith('/api/collections/users/auth-with-password')
    );
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    expect((await rejectedLogin).status()).toBe(403);
    await expect(page.getByRole('alert')).toContainText('must be verified');
    await page.getByRole('link', { name: 'request a new verification email' }).click();
    await expect(page).toHaveURL(/\/email-confirmation$/);
    await expect(page.getByRole('button', { name: 'Resend Confirmation Email' })).toBeEnabled();
  } finally {
    await admin.collection('users').delete(user.id);
  }
});
