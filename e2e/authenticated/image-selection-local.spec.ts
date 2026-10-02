import { devices, expect, test } from '@playwright/test';
import PocketBase from 'pocketbase';
import { randomUUID } from 'node:crypto';

import { assertLocalE2ETargets } from '../fixtures/local-safety';

const pocketBaseUrl = process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';

const browserName = process.env.E2E_IMAGE_BROWSER === 'webkit' ? 'webkit' : 'chromium';
test.use(
  browserName === 'webkit'
    ? { ...devices['iPhone 13'], browserName: 'webkit' }
    : { ...devices['Desktop Chrome'], browserName: 'chromium' }
);

test.describe(`local image selection in ${browserName}`, () => {
  test('saves the latest image after replacing a large selection and cropping', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    assertLocalE2ETargets({ appUrl, pocketBaseUrl, specName: 'Image selection lifecycle' });
    const email = process.env.E2E_TEST_EMAIL;
    const password = process.env.E2E_TEST_PASSWORD;
    if (!email || !password) throw new Error('Missing local E2E credentials.');
    const pb = new PocketBase(pocketBaseUrl);
    await pb.collection('users').authWithPassword(email, password);
    const project = await pb.collection('projects').create({
      user: pb.authStore.record!.id,
      title: `Image lifecycle ${randomUUID()}`,
      status: 'stash',
      kit_category: 'full',
    });

    try {
      await page.goto(`/projects/${project.id}/edit`);
      await expect(page.getByLabel('Project title', { exact: true })).toBeVisible();
      const images = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 1600;
        canvas.height = 1600;
        const context = canvas.getContext('2d')!;
        const pixels = context.createImageData(1600, 1600);
        let seed = 17;
        for (let i = 0; i < pixels.data.length; i += 4) {
          for (let channel = 0; channel < 3; channel++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            pixels.data[i + channel] = seed >>> 24;
          }
          pixels.data[i + 3] = 255;
        }
        context.putImageData(pixels, 0, 0);
        const first = canvas.toDataURL('image/png').split(',')[1];
        canvas.width = 128;
        canvas.height = 128;
        context.fillStyle = '#0000ff';
        context.fillRect(0, 0, 128, 128);
        return { first, second: canvas.toDataURL('image/png').split(',')[1] };
      });
      const firstImage = Buffer.from(images.first, 'base64');
      expect(firstImage.length).toBeGreaterThan(5 * 1024 * 1024);
      const input = page.locator('input[type="file"]').first();
      await input.setInputFiles({
        name: 'first-large.png',
        mimeType: 'image/png',
        buffer: firstImage,
      });
      await page
        .locator('input[type="file"]')
        .first()
        .setInputFiles({
          name: 'second-blue.png',
          mimeType: 'image/png',
          buffer: Buffer.from(images.second, 'base64'),
        });
      const cropDialog = page.getByRole('dialog');
      await expect(cropDialog).toBeVisible();
      await expect(cropDialog.getByRole('button', { name: /use crop/i })).toBeEnabled();
      await cropDialog.getByRole('button', { name: /use crop/i }).click();
      await expect(cropDialog).not.toBeVisible();
      await page.getByRole('button', { name: 'Update project', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/projects/${project.id}$`));

      const saved = await pb.collection('projects').getOne(project.id);
      expect(saved.image).toBeTruthy();
      const imageResponse = await page.request.get(pb.files.getURL(saved, saved.image));
      expect(imageResponse.ok()).toBe(true);
      const dataUrl = `data:${imageResponse.headers()['content-type']};base64,${(await imageResponse.body()).toString('base64')}`;
      const color = await page.evaluate(async src => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0, 1, 1);
        return Array.from(context.getImageData(0, 0, 1, 1).data);
      }, dataUrl);
      expect(color[2]).toBeGreaterThan(200);
      expect(color[0]).toBeLessThan(30);
      expect(color[1]).toBeLessThan(30);
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Details' })).toBeVisible();
    } finally {
      await pb.collection('projects').delete(project.id);
    }
  });
});
