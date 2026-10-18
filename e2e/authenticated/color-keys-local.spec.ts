import { expect, test } from '@playwright/test';
import PocketBase from 'pocketbase';

import { assertLocalE2ETargets } from '../fixtures/local-safety';

test.use({ serviceWorkers: 'block' });

test('colors used: set up symbols, record a color, and keep it after reload', async ({
  page,
  baseURL,
}, testInfo) => {
  test.setTimeout(90000);
  const backend = process.env.VITE_POCKETBASE_URL!;
  assertLocalE2ETargets({
    appUrl: baseURL ?? process.env.E2E_APP_URL,
    pocketBaseUrl: backend,
    specName: 'Color keys',
  });
  const pb = new PocketBase(backend);
  await pb
    .collection('users')
    .authWithPassword(process.env.E2E_TEST_EMAIL!, process.env.E2E_TEST_PASSWORD!);
  const book = await pb.collection('coloring_books').create({
    title: `Color key fixture ${testInfo.project.name}`,
    user: pb.authStore.record!.id,
    total_pages: 1,
    status: 'in_stash',
  });
  try {
    const [coloringPage] = await pb
      .collection('coloring_pages')
      .getFullList({ filter: pb.filter('book = {:book}', { book: book.id }) });
    await page.goto(`/coloring/${book.id}/pages/${coloringPage.id}`);

    const setup = page.getByRole('group', { name: 'Symbols on this page' });
    await expect(setup).toBeVisible();
    await setup.getByRole('button', { name: 'Lowercase z' }).click();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(page.getByText('0 of 35 filled in')).toBeVisible();

    await page.getByRole('button', { name: /^One,/ }).click();
    const entry = page.getByRole('dialog');
    await entry.getByRole('combobox', { name: 'Code' }).fill('654');
    await entry.getByRole('textbox', { name: 'Color name' }).fill('Lilac');
    await entry.getByRole('textbox', { name: 'Swatch hex' }).fill('#B79AD6');
    await entry.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(entry).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('button', { name: 'One, 654, Lilac' })).toBeVisible();
    await expect(page.getByText('1 of 35 filled in')).toBeVisible();
    const saved = await pb.collection('coloring_page_color_keys').getFullList({
      filter: pb.filter('page = {:page}', { page: coloringPage.id }),
      sort: 'position',
    });
    expect(saved).toHaveLength(35);
    expect(saved[0]).toMatchObject({ symbol: 'u:0031', code: '654', swatch: '#B79AD6' });
  } finally {
    await pb.collection('coloring_books').delete(book.id);
  }
});
