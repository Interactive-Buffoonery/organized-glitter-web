import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { createPacedVisit, pacedTestTimeout } from './paced-visit';
import { hostedStorageStatePath } from './storage-state';

test('sign in through the real form', async ({ page }) => {
  test.setTimeout(pacedTestTimeout(1));
  const visit = createPacedVisit(page);

  await visit('/login', page.getByLabel('Email'));
  await page.getByLabel('Email').fill(process.env.E2E_TEST_EMAIL!);
  await page.getByLabel('Password').fill(process.env.E2E_TEST_PASSWORD!);
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page).toHaveURL(/\/overview(?:\?|$)/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: /^Welcome back,/ })).toBeVisible();
  mkdirSync(path.dirname(hostedStorageStatePath), { recursive: true });
  await page.context().storageState({ path: hostedStorageStatePath });
});
