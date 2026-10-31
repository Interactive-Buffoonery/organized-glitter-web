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

test('color key: set up symbols, record a color, and keep it after reload', async ({
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
    await page.getByRole('link', { name: 'Track the colors used for this page' }).click();
    await expect(page).toHaveURL(new RegExp(`/pages/${coloringPage.id}/colors`));

    const setup = page.getByRole('group', { name: 'Symbols on this page' });
    await expect(setup).toBeVisible();
    await setup.getByRole('button', { name: 'Lowercase z' }).click();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(page.getByText('0 of 35 filled in')).toBeVisible();

    await page.getByRole('button', { name: /^One,/ }).click();
    const entry = page.getByRole('form', { name: 'Edit color: One' });
    await entry.getByRole('combobox', { name: 'Code' }).fill('654');
    await entry.getByRole('textbox', { name: /^Color name/ }).fill('Lilac');
    await entry.getByRole('textbox', { name: 'Swatch hex' }).fill('#B79AD6');
    await entry.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(entry).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('button', { name: 'One, 654, Lilac' })).toBeVisible();
    await expect(page.getByText('1 of 35 filled in')).toBeVisible();
    await page.getByRole('link', { name: 'Page 1', exact: true }).click();
    await expect(page.getByText('654')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit colors' })).toBeVisible();
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
  await page.goto(`/coloring/${book.id}/pages/${first.id}/colors`);
  return {
    pb,
    book,
    pageId: first.id,
    cleanup: () => pb.collection('coloring_books').delete(book.id),
  };
}

test('color key: keyboard flow keeps focus and drafts in place', async ({
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
    const entry = page.getByRole('form', { name: 'Edit color: Black spade suit' });
    const code = entry.getByRole('combobox', { name: 'Code' });
    await code.fill('Q65');
    await expect(entry.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(entry.getByRole('listbox')).toHaveCount(0);
    await expect(entry).toBeVisible();

    await code.fill('Q651');
    await entry.getByRole('textbox', { name: 'Add a code you tried' }).fill('Q649');
    await entry.getByRole('button', { name: 'Save and next: Black club suit' }).click();

    const nextEntry = page.getByRole('form', { name: 'Edit color: Black club suit' });
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

test('color key: sort by dragging and by keyboard, and keep the order after reload', async ({
  page,
  baseURL,
}, testInfo) => {
  test.setTimeout(90000);
  const { pb, pageId, cleanup } = await seededPage(page, baseURL, testInfo);
  try {
    await pb.collection('coloring_page_color_keys').create({
      user: pb.authStore.record!.id,
      page: pageId,
      symbol: 'u:2665',
      position: 2,
    });
    await page.reload();
    const list = page.locator('ul').filter({ has: page.getByRole('button', { name: /^Black/ }) });
    await expect(list.getByRole('button')).toHaveCount(3);

    await page.getByRole('button', { name: 'Sort', exact: true }).click();
    const panel = page.getByRole('dialog', { name: 'Sort Color Order' });
    const handle = (name: string) => panel.getByRole('button', { name: new RegExp(`^${name},`) });
    await expect(handle('Black heart suit')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Add symbol', includeHidden: true })
    ).toBeDisabled();

    // Drag the heart above the spade with the pointer.
    // hover waits for the sheet to finish sliding in before measuring.
    await handle('Black heart suit').hover();
    const to = (await handle('Black spade suit').boundingBox())!;
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + 4, { steps: 12 });
    await page.mouse.move(to.x + to.width / 2, to.y + 2, { steps: 4 });
    // WebKit can release before dnd-kit sorts, so wait for the gap to open above the spade.
    await expect(panel.locator('[data-dnd-placeholder] + li')).toContainText('♠');
    await page.mouse.up();
    const order = () =>
      panel
        .getByRole('button', { name: /^Black/ })
        .evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')));
    await expect
      .poll(order)
      .toEqual([
        'Black heart suit, no code yet',
        'Black spade suit, no code yet',
        'Black club suit, no code yet',
      ]);

    // Move the spade down one with the keyboard.
    const spade = handle('Black spade suit');
    // dnd-kit ignores a new drag, and then restores focus, until the drop animation ends.
    await expect(async () => {
      await spade.focus();
      await page.keyboard.press('Space');
      await expect(spade).toHaveAttribute('aria-pressed', 'true', { timeout: 500 });
    }).toPass();
    await page.keyboard.press('ArrowDown');
    await expect.poll(order).toContain('Black spade suit, no code yet');
    await expect
      .poll(() =>
        panel
          .getByRole('button', { name: /^Black/ })
          .last()
          .getAttribute('aria-label')
      )
      .toBe('Black spade suit, no code yet');
    await page.keyboard.press('Space');
    await expect(spade).toHaveAttribute('aria-pressed', 'false');
    await expect
      .poll(order)
      .toEqual([
        'Black heart suit, no code yet',
        'Black club suit, no code yet',
        'Black spade suit, no code yet',
      ]);

    await panel.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(panel).toHaveCount(0);
    await expect
      .poll(async () =>
        (
          await pb.collection('coloring_page_color_keys').getFullList({
            filter: pb.filter('page = {:page}', { page: pageId }),
            sort: 'position',
          })
        ).map(row => [row.symbol, row.position])
      )
      .toEqual([
        ['u:2665', 0],
        ['u:2663', 1],
        ['u:2660', 2],
      ]);

    await page.reload();
    await expect(list.getByRole('button')).toHaveCount(3);
    expect(
      await list
        .getByRole('button')
        .evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')))
    ).toEqual([
      'Black heart suit, no code yet',
      'Black club suit, no code yet',
      'Black spade suit, no code yet',
    ]);
  } finally {
    await cleanup();
  }
});

test.describe('on a phone', () => {
  if (browserName === 'chromium') {
    const { viewport, isMobile, hasTouch, userAgent } = devices['Pixel 7'];
    test.use({ viewport, isMobile, hasTouch, userAgent });
  }

  test('color key: pick a symbol and record it in place', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(90000);
    const { pb, pageId, cleanup } = await seededPage(page, baseURL, testInfo);
    try {
      await page.getByRole('button', { name: 'Add symbol' }).tap();
      const picker = page.getByRole('dialog', { name: 'Add a symbol' });
      await picker.getByRole('searchbox', { name: 'Search symbols' }).fill('yen');
      await expect(picker.getByRole('status')).toHaveText(/^\d+ symbols?$/);
      await picker.getByRole('option', { name: 'Yen sign' }).tap();

      const entry = page.getByRole('form', { name: 'Add a color: Yen sign' });
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

  test('color key: send a photo of a missing symbol and use it on the page', async ({
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
        .getByLabel('Photo', { exact: true })
        .setInputFiles(fileURLToPath(new URL('../fixtures/portrait-cover.jpg', import.meta.url)));
      await expect(request.getByRole('img', { name: 'Chosen symbol' })).toBeVisible();
      await request.getByRole('button', { name: 'Crop photo' }).tap();
      const crop = page.getByRole('dialog', { name: 'Crop the symbol' });
      // Use crop enables once the cropper has measured the loaded photo.
      await expect(crop.getByRole('button', { name: 'Use crop' })).toBeEnabled();
      await crop.getByRole('button', { name: 'Use crop' }).tap();
      await expect(crop).toHaveCount(0);
      await expect(request.getByRole('img', { name: 'Chosen symbol' })).toBeVisible();
      await request.getByRole('textbox', { name: /^Description/ }).fill('Two w stacked');
      await request.getByRole('button', { name: 'Send', exact: true }).tap();
      await expect(request).toHaveCount(0);

      const entry = page.getByRole('form', { name: 'Edit color: Two w stacked' });
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
      expect(sent.photo).toMatch(/cropped.*\.(jpe?g|png|webp)$/);
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

test('coloring detail: edit dates, reveal the subject and log progress', async ({
  page,
  baseURL,
}, testInfo) => {
  test.setTimeout(90000);
  const { pb, book, pageId, cleanup } = await seededPage(page, baseURL, testInfo);
  try {
    await pb.collection('coloring_books').update(book.id, { is_mystery: true });
    await page.goto(`/coloring/${book.id}/pages/${pageId}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page 1');
    await expect(page.getByRole('button', { name: 'Add medium', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add photos', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'add finish date', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'add start date', exact: true }).click();
    const dates = page.getByRole('dialog', { name: 'Page dates' });
    await dates.locator('#coloring-page-started-at').fill('2026-04-03');
    await dates
      .locator('div.space-y-2:has(#coloring-page-started-at)')
      .getByRole('button', { name: 'Save', exact: true })
      .click();
    await expect
      .poll(async () => (await pb.collection('coloring_pages').getOne(pageId)).started_at)
      .toContain('2026-04-03');
    await dates.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('button', { name: 'add finish date', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'add start date', exact: true })).toHaveCount(0);

    await page.getByRole('combobox', { name: 'Change page status' }).click();
    await page.getByRole('option', { name: 'Completed', exact: true }).click();
    await expect(page.getByText('Did you finish it today?')).toBeVisible();
    await page.getByRole('button', { name: 'Pick a date', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Page dates' })
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    await page.getByRole('button', { name: 'Not now', exact: true }).click();
    await expect(page.getByText('Did you finish it today?')).toHaveCount(0);
    await page.reload();
    await page.getByRole('button', { name: 'Yes, today', exact: true }).click();
    await expect(page.getByText('Did you finish it today?')).toHaveCount(0);
    await expect
      .poll(async () => (await pb.collection('coloring_pages').getOne(pageId)).completed_at)
      .not.toBe('');

    await page.getByRole('button', { name: 'Reveal', exact: true }).click();
    await page.getByRole('textbox', { name: 'Revealed subject' }).fill('A sleeping owl');
    await page.getByRole('button', { name: 'Save reveal', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('A sleeping owl');
    const composer = page.getByRole('form', { name: 'Add a progress note', exact: true });
    await composer
      .getByRole('textbox', { name: 'Progress note', exact: true })
      .fill('Finished the leaves with two greens.');
    await composer.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      page.getByText('Finished the leaves with two greens.', { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Progress · 1 entry', exact: true })
    ).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('A sleeping owl');
    await expect(
      page.getByText('Finished the leaves with two greens.', { exact: true })
    ).toBeVisible();
  } finally {
    await cleanup();
  }
});
