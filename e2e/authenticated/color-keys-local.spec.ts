import { devices, expect, test, type Page, type TestInfo } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import PocketBase from 'pocketbase';

import { assertLocalE2ETargets } from '../fixtures/local-safety';

// E2E_COLOR_KEYS_BROWSER=webkit runs every test as Mobile Safari on an iPhone.
const browserName = process.env.E2E_COLOR_KEYS_BROWSER === 'webkit' ? 'webkit' : 'chromium';
test.use({
  serviceWorkers: 'block',
  ...(browserName === 'webkit' ? { ...devices['iPhone 13'], browserName } : {}),
});

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
    await entry.getByRole('textbox', { name: /^Color name/ }).fill('Lilac');
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

async function seededPage(page: Page, baseURL: string | undefined, testInfo: TestInfo) {
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
  const user = pb.authStore.record!.id;
  const book = await pb.collection('coloring_books').create({
    title: `Color key flow ${testInfo.project.name} ${Date.now()}`,
    user,
    total_pages: 2,
    status: 'in_stash',
  });
  const [first, second] = await pb
    .collection('coloring_pages')
    .getFullList({ filter: pb.filter('book = {:book}', { book: book.id }), sort: 'page_number' });
  const keys = pb.collection('coloring_page_color_keys');
  // History for the Code suggestions lives on the other page.
  await keys.create({ user, page: second.id, symbol: 'u:2605', position: 0, code: 'Q650' });
  for (const [position, symbol] of ['u:2660', 'u:2663'].entries())
    await keys.create({ user, page: first.id, symbol, position });
  await page.goto(`/coloring/${book.id}/pages/${first.id}`);
  return {
    pb,
    book,
    pageId: first.id,
    cleanup: () => pb.collection('coloring_books').delete(book.id),
  };
}

test('colors used: keyboard flow keeps the sheet, focus and drafts', async ({
  page,
  baseURL,
}, testInfo) => {
  test.setTimeout(90000);
  // WebKit has no clipboard permissions to grant, so record what Copy writes.
  // The stub checks the copied text only, not real user-activation behavior.
  await page.addInitScript(() => {
    const copied: string[] = [];
    Object.assign(window, { __copied: copied });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => void copied.push(text) },
    });
  });
  const { pb, pageId, cleanup } = await seededPage(page, baseURL, testInfo);
  try {
    await page.getByRole('button', { name: /^Black spade suit,/ }).click();
    const entry = page.getByRole('dialog', { name: 'Edit color: Black spade suit' });
    const code = entry.getByRole('combobox', { name: 'Code' });
    await code.fill('Q65');
    await expect(entry.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(entry.getByRole('listbox')).toHaveCount(0);
    await expect(entry).toBeVisible();

    await code.fill('Q651');
    await entry.getByRole('textbox', { name: 'Add a code you tried' }).fill('Q649');
    await entry.getByRole('button', { name: 'Save and next: Black club suit' }).click();

    const nextEntry = page.getByRole('dialog', { name: 'Edit color: Black club suit' });
    await expect(nextEntry).toBeVisible();
    await expect(nextEntry.getByRole('combobox', { name: 'Code' })).toBeFocused();
    await page.keyboard.type('Q700');
    await nextEntry.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(nextEntry).toHaveCount(0);

    const saved = await pb.collection('coloring_page_color_keys').getFullList({
      filter: pb.filter('page = {:page}', { page: pageId }),
      sort: 'position',
    });
    expect(saved.map(row => [row.symbol, row.code, row.tried])).toEqual([
      ['u:2660', 'Q651', ['Q649']],
      ['u:2663', 'Q700', []],
    ]);

    await page.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(page.getByText('Copied the colors for this page.')).toBeVisible();
    expect(
      await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied)
    ).toEqual(['\u2660 Q651\n\u2663 Q700']);
  } finally {
    await cleanup();
  }
});

test.describe('on a phone', () => {
  if (browserName === 'chromium') {
    const { viewport, isMobile, hasTouch, userAgent } = devices['Pixel 7'];
    test.use({ viewport, isMobile, hasTouch, userAgent });
  }

  test('colors used: pick a symbol and record it in the drawer', async ({
    page,
    baseURL,
  }, testInfo) => {
    test.setTimeout(90000);
    const { pb, pageId, cleanup } = await seededPage(page, baseURL, testInfo);
    try {
      await page.getByRole('button', { name: 'Add symbol' }).tap();
      const picker = page.getByRole('dialog', { name: 'Add a symbol' });
      await picker.getByRole('searchbox', { name: 'Search symbols' }).fill('yen');
      await expect(picker.getByRole('status')).toHaveText(/^\d+ symbols?$/);
      await picker.getByRole('option', { name: 'Yen sign' }).tap();

      const entry = page.getByRole('dialog', { name: 'Add a color: Yen sign' });
      await entry.getByRole('combobox', { name: 'Code' }).fill('Q800');
      await entry.getByRole('textbox', { name: 'Swatch hex' }).fill('b79ad6');
      await entry.getByRole('textbox', { name: /^Color name/ }).tap();
      await expect(entry.getByRole('textbox', { name: 'Swatch hex' })).toHaveValue('#B79AD6');
      await entry.getByRole('button', { name: 'Save', exact: true }).tap();
      await expect(entry).toHaveCount(0);

      await expect(page.getByRole('button', { name: /^Yen sign, Q800/ })).toBeVisible();
      const saved = await pb
        .collection('coloring_page_color_keys')
        .getFirstListItem(
          pb.filter('page = {:page} && symbol = {:symbol}', { page: pageId, symbol: 'u:00A5' })
        );
      expect(saved).toMatchObject({ code: 'Q800', swatch: '#B79AD6', position: 2 });
    } finally {
      await cleanup();
    }
  });

  test('colors used: send a photo of a missing symbol and use it on the page', async ({
    page,
    baseURL,
  }, testInfo) => {
    test.setTimeout(90000);
    const { pb, book, pageId, cleanup } = await seededPage(page, baseURL, testInfo);
    try {
      await page.getByRole('button', { name: 'Add symbol' }).tap();
      await page.getByRole('button', { name: /Can't find your symbol/ }).tap();

      const request = page.getByRole('dialog', { name: 'Send us a symbol' });
      await expect(request.getByRole('textbox', { name: 'Book and page' })).toHaveValue(
        `${book.title}, page 1`
      );
      await expect(request.getByRole('textbox', { name: 'Email' })).toHaveValue(
        process.env.E2E_TEST_EMAIL!
      );
      await request
        .getByLabel('Photo of the symbol')
        .setInputFiles(fileURLToPath(new URL('../fixtures/portrait-cover.jpg', import.meta.url)));
      await expect(request.getByRole('img', { name: 'Chosen symbol' })).toBeVisible();
      await request.getByRole('textbox', { name: /^Description/ }).fill('Two w stacked');
      await request.getByRole('button', { name: 'Send', exact: true }).tap();
      await expect(request).toHaveCount(0);

      const entry = page.getByRole('dialog', { name: 'Edit color: Two w stacked' });
      await expect(entry).toBeVisible();
      // The protected thumbnail has to load with a file token, including on Mobile Safari.
      const thumbnail = entry.locator('img[alt="Two w stacked"]');
      await expect(thumbnail).toBeVisible();
      await expect
        .poll(() => thumbnail.evaluate(image => (image as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);

      const sent = await pb
        .collection('coloring_symbol_requests')
        .getFirstListItem(pb.filter('page = {:page}', { page: pageId }));
      expect(sent).toMatchObject({
        description: 'Two w stacked',
        email: process.env.E2E_TEST_EMAIL,
        status: 'open',
      });
      expect(sent.photo).toMatch(/\.(jpe?g|png|webp)$/);
      const row = await pb.collection('coloring_page_color_keys').getFirstListItem(
        pb.filter('page = {:page} && symbol = {:symbol}', {
          page: pageId,
          symbol: `r:${sent.id}`,
        })
      );
      expect(row.position).toBe(2);
    } finally {
      await cleanup();
    }
  });
});
