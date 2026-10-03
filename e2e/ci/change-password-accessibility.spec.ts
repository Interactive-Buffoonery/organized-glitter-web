import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

import { assertLocalE2ETargets } from '../fixtures/local-safety';

test.use({ serviceWorkers: 'block', trace: 'on', video: 'on' });

test('password controls work by keyboard and expose validation errors', async ({
  page,
}, testInfo) => {
  assertLocalE2ETargets({
    appUrl: process.env.E2E_APP_URL,
    pocketBaseUrl: process.env.VITE_POCKETBASE_URL,
    specName: 'Password accessibility',
  });

  const passwordUpdates: string[] = [];
  await page.route('**/api/collections/users/records/**', async route => {
    if (route.request().method() === 'PATCH') {
      passwordUpdates.push(route.request().url());
      await route.abort();
      return;
    }
    await route.continue();
  });

  await page.goto('/change-password');

  const fields = [
    ['Current Password', 'Show current password'],
    ['New Password', 'Show new password'],
    ['Confirm New Password', 'Show confirm new password'],
  ] as const;
  let shownPasswordSnapshot = '';

  for (const [fieldName, buttonName] of fields) {
    const field = page.getByLabel(fieldName, { exact: true });
    const button = page.getByRole('button', { name: buttonName });
    await expect(field).toHaveAttribute('type', 'password');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await button.focus();
    await page.keyboard.press('Space');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(field).toHaveAttribute('type', 'text');
    if (fieldName === 'New Password') {
      shownPasswordSnapshot = await button.ariaSnapshot();
    }
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(field).toHaveAttribute('type', 'password');
  }

  await page.getByLabel('Current Password', { exact: true }).fill('CurrentPass123');
  await page.getByLabel('New Password', { exact: true }).fill('ValidPass123');
  await page.getByLabel('Confirm New Password', { exact: true }).fill('DifferentPass123');
  await page.getByRole('button', { name: 'Change Password', exact: true }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toHaveAttribute('data-reason', 'password-mismatch');
  await expect(alert).not.toBeEmpty();
  expect(passwordUpdates).toHaveLength(0);

  const snapshot = [shownPasswordSnapshot, await alert.ariaSnapshot()].join('\n');
  const snapshotPath = testInfo.outputPath('password-accessibility.aria.txt');
  await writeFile(snapshotPath, snapshot);
  await testInfo.attach('password accessibility snapshot', {
    path: snapshotPath,
    contentType: 'text/plain',
  });
});
