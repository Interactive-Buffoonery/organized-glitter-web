import { expect, test } from '@playwright/test';
import PocketBase from 'pocketbase';
import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';

import { assertLocalE2ETargets } from '../fixtures/local-safety';

test.use({ serviceWorkers: 'block' });

test('color references retain drafts, preserve the page, and return to empty', async ({
  page,
  baseURL,
}, testInfo) => {
  test.setTimeout(90000);
  const backend = process.env.VITE_POCKETBASE_URL!;
  assertLocalE2ETargets({
    appUrl: baseURL ?? process.env.E2E_APP_URL,
    pocketBaseUrl: backend,
    specName: 'Color references',
  });
  const pb = new PocketBase(backend);
  await pb
    .collection('users')
    .authWithPassword(process.env.E2E_TEST_EMAIL!, process.env.E2E_TEST_PASSWORD!);
  const book = await pb.collection('coloring_books').create({
    title: `Swatch browser fixture ${testInfo.project.name}`,
    user: pb.authStore.record!.id,
    total_pages: 2,
    status: 'in_stash',
  });
  try {
    const pages = await pb
      .collection('coloring_pages')
      .getFullList({ filter: `book = '${book.id}'`, sort: 'page_number' });
    const original = pages[0];
    await page.goto(`/coloring/${book.id}/pages/${original.id}`);
    await expect(page.getByRole('button', { name: 'Add note', exact: true })).toBeVisible();
    await page
      .getByRole('heading', { name: 'Color Codes & Swatches' })
      .locator('..')
      .screenshot({ path: testInfo.outputPath('swatches-empty.png') });
    await page.getByRole('button', { name: 'Add note', exact: true }).click();
    const field = page.getByRole('textbox', { name: 'Color notes' });
    const notes = '  001\nBR 709 + RY 08  ';
    await field.fill(notes);
    await field.press('Tab');
    await page.getByRole('button', { name: 'Save', exact: true }).last().click();
    await expect(field).toHaveCount(0);
    await expect(page.getByText('BR 709', { exact: false })).toBeVisible();
    const imageBytes = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 1800;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#fff';
      context.fillRect(0, 0, 1200, 1800);
      context.fillStyle = '#111';
      context.font = '48px sans-serif';
      context.fillText('001   BR 709   RY 08', 60, 100);
      context.fillStyle = '#bb4488';
      context.fillRect(60, 140, 400, 80);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.getByRole('button', { name: 'Add photo', exact: true }).click();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Choose photos', exact: true }).click();
    await (
      await chooserPromise
    ).setFiles([
      { name: 'sheet-one.png', mimeType: 'image/png', buffer: Buffer.from(imageBytes, 'base64') },
      { name: 'sheet-two.png', mimeType: 'image/png', buffer: Buffer.from(imageBytes, 'base64') },
    ]);
    await expect(page.getByAltText('Selected swatch sheet 2')).toBeVisible();
    await page.route('**/color-reference', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      // WebKit interception can omit binary multipart bytes. Keep the submitted
      // receipt while reconstructing these known fixture file parts.
      const receipt = route
        .request()
        .postData()
        ?.match(/name="requestId"\r\n\r\n([^\r]+)/)?.[1];
      expect(receipt).toBeTruthy();
      const body = new FormData();
      body.set('action', 'photos');
      body.set('requestId', receipt!);
      for (const name of ['sheet-one.png', 'sheet-two.png']) {
        body.append(
          'photos',
          new Blob([Buffer.from(imageBytes, 'base64')], { type: 'image/png' }),
          name
        );
      }
      const request = new Request(route.request().url(), { method: 'POST', body });
      const response = await route.fetch({
        headers: {
          ...route.request().headers(),
          'content-type': request.headers.get('content-type')!,
        },
        postData: Buffer.from(await request.arrayBuffer()),
      });
      expect(response.status()).toBe(200);
      await route.abort('failed');
    });
    await page.getByRole('button', { name: 'Save photos' }).click();
    await expect(
      page.getByText(
        'The upload could not be confirmed. Retry these photos before changing the selection.',
        { exact: true }
      )
    ).toBeVisible();
    const saved = await pb
      .collection('coloring_page_color_references')
      .getFirstListItem(`page = '${original.id}'`);
    expect(saved.photos).toHaveLength(2);
    await page.unroute('**/color-reference');
    await expect(page.getByAltText('Selected swatch sheet 2')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose photos', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Remove selected photo 1' })).toBeDisabled();
    await page.getByRole('button', { name: 'Retry photos' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open swatch photo 2' })).toBeVisible();
    expect(
      (await pb.collection('coloring_page_color_references').getOne(saved.id)).photos
    ).toHaveLength(2);
    await expect(page.locator('[data-sonner-toast][data-visible="true"]')).toHaveCount(0, {
      timeout: 15000,
    });
    await page.getByRole('button', { name: 'Open swatch photo 1' }).click();
    const viewer = page.getByRole('dialog');
    await viewer.getByRole('button', { name: 'Zoom in' }).click();
    await expect(viewer.getByText('150%')).toBeVisible();
    const scroll = viewer.getByRole('region', { name: 'Swatch photo, scroll to pan' });
    await scroll.focus();
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => scroll.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await expect(viewer.getByRole('button', { name: 'Zoom out' })).toHaveCSS('opacity', '1');
    expect(
      (await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations
    ).toEqual([]);
    if (testInfo.project.name.includes('iphone')) {
      for (const button of await viewer.getByRole('button').all()) {
        const bounds = await button.boundingBox();
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
        expect(bounds!.width).toBeGreaterThanOrEqual(44);
      }
    }
    await page.screenshot({ path: testInfo.outputPath('swatch-viewer.png') });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Open swatch photo 1' })).toBeFocused();
    for (const appearance of ['Dark', 'Light']) {
      if (testInfo.project.name.includes('iphone')) {
        await page.getByRole('button', { name: 'Open account menu' }).click();
        await page.getByRole('combobox', { name: 'Theme', exact: true }).click();
        await page.getByRole('option', { name: appearance, exact: true }).click();
        await page.getByRole('button', { name: 'Close account menu' }).click();
      } else {
        await page.getByRole('button', { name: 'Toggle theme' }).click();
        await page.getByRole('menuitem', { name: appearance, exact: true }).click();
      }
      await page.getByRole('heading', { name: 'Color Codes & Swatches' }).scrollIntoViewIfNeeded();
      await page
        .getByRole('heading', { name: 'Color Codes & Swatches' })
        .locator('..')
        .screenshot({ path: testInfo.outputPath(`swatches-${appearance.toLowerCase()}.png`) });
    }
    expect(await pb.collection('coloring_pages').getOne(original.id)).toEqual(original);
    expect(
      await pb
        .collection('coloring_page_progress_notes')
        .getFullList({ filter: `page = '${original.id}'` })
    ).toHaveLength(0);
    await page.getByRole('button', { name: 'Edit note', exact: true }).click();
    await field.fill('');
    await field.press('Tab');
    await page.getByRole('button', { name: 'Save', exact: true }).last().click();
    await expect(page.getByRole('button', { name: 'Add note', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open swatch photo 2' })).toBeVisible();
    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: 'Remove swatch photo 1' }).click();
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Delete', exact: true })
        .click();
      await expect(page.getByRole('button', { name: /Open swatch photo/ })).toHaveCount(1 - i);
    }
    await expect(page.getByRole('button', { name: 'Add photo', exact: true })).toBeVisible();
    expect(
      await pb
        .collection('coloring_page_color_references')
        .getFullList({ filter: `page = '${original.id}'` })
    ).toHaveLength(0);
  } finally {
    await pb.collection('coloring_books').delete(book.id);
  }
});

for (const format of ['heic', 'heif', 'orientation'] as const) {
  test(`swatch file decoding: ${format}`, async ({ page, baseURL }, testInfo) => {
    const backend = process.env.VITE_POCKETBASE_URL!;
    assertLocalE2ETargets({
      appUrl: baseURL ?? process.env.E2E_APP_URL,
      pocketBaseUrl: backend,
      specName: 'Color references',
    });
    const pb = new PocketBase(backend);
    await pb
      .collection('users')
      .authWithPassword(process.env.E2E_TEST_EMAIL!, process.env.E2E_TEST_PASSWORD!);
    const book = await pb.collection('coloring_books').create({
      title: `Swatch format ${format}`,
      user: pb.authStore.record!.id,
      total_pages: 1,
      status: 'in_stash',
    });
    try {
      const coloringPage = (
        await pb.collection('coloring_pages').getFullList({ filter: `book = '${book.id}'` })
      )[0];
      await page.goto(`/coloring/${book.id}/pages/${coloringPage.id}`);
      await page.getByRole('button', { name: 'Add photo', exact: true }).click();
      const filename = format === 'orientation' ? 'orientation-6.jpg' : 'sheet.heic';
      const bytes = fs.readFileSync(path.join('e2e/fixtures/color-references', filename));
      const mimeType = format === 'orientation' ? 'image/jpeg' : `image/${format}`;
      const canDecode = await page.evaluate(
        async ({ encoded, mimeType }) => {
          const image = new Image();
          image.src = `data:${mimeType};base64,${encoded}`;
          try {
            await image.decode();
            return true;
          } catch {
            return false;
          }
        },
        { encoded: bytes.toString('base64'), mimeType }
      );
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Choose photos' }).click();
      await (
        await chooser
      ).setFiles({ name: format === 'heif' ? 'sheet.heif' : filename, mimeType, buffer: bytes });
      if (canDecode) {
        await expect(page.getByAltText('Selected swatch sheet 1')).toBeVisible();
        await page.getByRole('button', { name: 'Save photos' }).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await page.getByRole('button', { name: 'Open swatch photo 1' }).click();
        const original = page.getByAltText('Full swatch sheet 1');
        await expect(original).toBeVisible();
        if (format === 'orientation') {
          await expect
            .poll(() =>
              original.evaluate(image => ({
                width: (image as HTMLImageElement).naturalWidth,
                height: (image as HTMLImageElement).naturalHeight,
              }))
            )
            .toEqual({ width: 180, height: 120 });
        }
        console.log(`${testInfo.project.name}: ${format} decoded and saved`);
      } else {
        await expect(
          page
            .getByRole('dialog')
            .getByText(
              'This photo could not be read. Export it as JPG or PNG and choose it again.',
              { exact: true }
            )
        ).toBeVisible();
        await expect(page.getByRole('button', { name: 'Save photos' })).toBeDisabled();
        console.log(`${testInfo.project.name}: ${format} rejected with conversion guidance`);
      }
    } finally {
      await pb.collection('coloring_books').delete(book.id);
    }
  });
}
