import { expect, test, type Page } from '@playwright/test';
import PocketBase from 'pocketbase';
import { assertLocalE2ETargets, isLocalUrl } from '../fixtures/local-safety';
import { waitForScreenshotReady } from '../screen-review/assertions';

test.use({ serviceWorkers: 'block' });

const pocketBaseUrl = process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';

async function selectMode(page: Page, mode: string) {
  await page.goto('/profile');
  await expect(page.getByText('Lets you track your consecutive crafting days!')).toBeVisible();
  await waitForScreenshotReady(page, 'Streak preference');
  await page.getByRole('combobox', { name: 'Crafting streak', exact: true }).press('Enter');
  await page.getByRole('option', { name: mode, exact: true }).focus();
  await page.keyboard.press('Enter');
}

for (const width of [1440, 390]) {
  test(`flame modes, zero, history and unavailable at ${width}px`, async ({ page }, testInfo) => {
    test.skip(!isLocalUrl(appUrl) || !isLocalUrl(pocketBaseUrl), 'Disposable local backend only.');
    assertLocalE2ETargets({ appUrl, pocketBaseUrl, specName: 'Crafting streak' });
    const email = process.env.E2E_TEST_EMAIL;
    const password = process.env.E2E_TEST_PASSWORD;
    if (!email || !password) throw new Error('Local test identity is unavailable');
    const pb = new PocketBase(pocketBaseUrl);
    await pb.collection('users').authWithPassword(email, password);
    const user = pb.authStore.record;
    if (!user?.id || user.email !== email) throw new Error('Unexpected local test identity');
    await page.setViewportSize({ width, height: 900 });
    const timezone = user.timezone || 'UTC';
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
    for (const [collection, id] of [
      ['progress_notes', 'localpnote00001'],
      ['coloring_page_progress_notes', 'localcpnote0001'],
    ]) {
      try {
        await pb.collection(collection).delete(id);
      } catch (error) {
        if (!(error instanceof Error && 'status' in error && error.status === 404)) throw error;
      }
    }
    await page.addInitScript(
      theme => localStorage.setItem('theme', theme),
      width === 390 ? 'dark' : 'light'
    );
    await pb
      .collection('users')
      .update(user.id, { theme_preference: width === 390 ? 'dark' : 'light' });
    let projectId: string | undefined;
    let coloringNoteId: string | undefined;
    try {
      await page.goto('/profile');
      await expect(page.getByRole('combobox', { name: 'Crafting streak', exact: true })).toHaveText(
        'Off'
      );
      await selectMode(page, 'Show on Home');
      await waitForScreenshotReady(page, 'Streak preference');
      await page
        .getByRole('combobox', { name: 'Crafting streak', exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: testInfo.outputPath(`preference-${width}.png`),
        fullPage: true,
      });
      await page.goto('/overview');
      const zero = page.getByRole('link', { name: 'No current crafting streak. Opens Notes.' });
      await expect(zero).toBeVisible();
      await expect(zero.locator('svg')).toHaveAttribute('fill', 'none');
      await waitForScreenshotReady(page, 'Home zero flame');
      await page.screenshot({
        path: testInfo.outputPath(`home-zero-${width}.png`),
        fullPage: true,
      });
      await zero.click();
      await expect(page).toHaveURL(/\/notes$/);
      await expect(page.getByRole('img', { name: /crafting streak/ })).toHaveCount(0);

      const project = await pb.collection('projects').create({
        user: user.id,
        title: 'Synthetic flame test',
        status: 'progress',
        status_order: 4,
        kit_category: 'full',
      });
      projectId = project.id;
      await pb.collection('progress_notes').create({
        project: project.id,
        content: 'Synthetic crafting progress.',
        date,
      });
      const coloringPage = await pb
        .collection('coloring_pages')
        .getFirstListItem("book = 'localcbook00001'");
      const yesterday = new Date(`${date}T12:00:00Z`);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const coloringNote = await pb.collection('coloring_page_progress_notes').create({
        user: user.id,
        page: coloringPage.id,
        date: yesterday.toISOString().slice(0, 10),
        content: 'Synthetic coloring progress.',
      });
      coloringNoteId = coloringNote.id;
      await selectMode(page, 'Show in Notes');
      await page.goto('/notes');
      const status = page.getByRole('img', { name: '2-day crafting streak', exact: true });
      await expect(status).toBeVisible();
      await expect(status.locator('svg')).toHaveAttribute('fill', 'currentColor');
      await page.reload();
      await expect(status).toBeVisible();
      await waitForScreenshotReady(page, 'Notes active flame');
      await page.screenshot({
        path: testInfo.outputPath(`notes-active-${width}.png`),
        fullPage: true,
      });
      await page.goto('/overview');
      await expect(page.getByRole('link', { name: /crafting streak/ })).toHaveCount(0);

      await page.route('**/api/collections/*/records?*', async route => {
        if (new URL(route.request().url()).searchParams.get('fields') === 'id,date') {
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: '{"message":"Unavailable"}',
          });
        } else await route.continue();
      });
      await page.goto('/notes');
      await page.reload();
      await expect(
        page.getByRole('img', { name: 'Crafting streak unavailable', exact: true })
      ).toBeVisible({ timeout: 20000 });
      await expect(page.getByRole('img', { name: 'No current crafting streak' })).toHaveCount(0);
      await selectMode(page, 'Off');
      await page.goto('/notes');
      await expect(page.getByRole('img', { name: /crafting streak/ })).toHaveCount(0);
    } finally {
      await Promise.all([
        pb
          .collection('users')
          .update(user.id, { theme_preference: user.theme_preference || 'system' }),
        coloringNoteId
          ? pb.collection('coloring_page_progress_notes').delete(coloringNoteId)
          : Promise.resolve(),
        projectId ? pb.collection('projects').delete(projectId) : Promise.resolve(),
      ]);
    }
  });
}
