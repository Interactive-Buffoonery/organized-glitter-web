import { expect, test } from '@playwright/test';
import PocketBase from 'pocketbase';

import { assertLocalE2ETargets } from '../fixtures/local-safety';

const pocketBaseUrl = process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';
test('uploads a cropped avatar', async ({ page, browser }, testInfo) => {
  test.setTimeout(60_000);
  const expectedBrowserName = testInfo.project.name.includes('webkit') ? 'webkit' : 'chromium';
  expect(browser.browserType().name()).toBe(expectedBrowserName);
  assertLocalE2ETargets({ appUrl, pocketBaseUrl, specName: 'Avatar crop' });
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) throw new Error('Missing local E2E credentials.');

  await page.goto('/profile?tab=account');
  await page.getByRole('button', { name: 'Manage avatar' }).click();
  const manager = page.getByRole('dialog', { name: 'Manage Your Avatar' });
  await expect(manager).toBeVisible();

  const imageBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 320;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#1947d0';
    context.fillRect(0, 0, 320, 320);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await manager.locator('input[type="file"]').setInputFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: Buffer.from(imageBase64, 'base64'),
  });

  const cropDialog = page.getByRole('dialog', { name: 'Crop Your Photo' });
  await expect(cropDialog).toBeVisible();
  await expect(cropDialog.getByRole('button', { name: 'Crop & Save' })).toBeEnabled();
  await cropDialog.getByRole('button', { name: 'Crop & Save' }).click();
  await expect(cropDialog).not.toBeVisible();
  await expect
    .poll(() =>
      manager.getByRole('img', { name: 'Avatar preview' }).evaluate(image => image.naturalWidth)
    )
    .toBe(200);
  await expect(manager.getByRole('button', { name: 'Save Avatar' })).toBeEnabled();

  await page.screenshot({
    path: testInfo.outputPath(`avatar-${browser.browserType().name()}.png`),
  });
  await manager.getByRole('button', { name: 'Save Avatar' }).click();
  await expect(manager).not.toBeVisible();

  const pb = new PocketBase(pocketBaseUrl);
  await pb.collection('users').authWithPassword(email, password);
  const user = await pb.collection('users').getOne(pb.authStore.record!.id);
  expect(user.avatar).toBeTruthy();

  await page.reload();
  await page.getByRole('button', { name: 'Manage avatar' }).click();
  await expect(manager).toBeVisible();
  await expect
    .poll(() =>
      manager.getByRole('img', { name: 'Avatar preview' }).evaluate(image => image.naturalWidth)
    )
    .toBeGreaterThan(0);
});
