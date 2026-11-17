import { expect, test, type Page, type Route } from '@playwright/test';
import PocketBase from 'pocketbase';
import { assertLocalE2ETargets, isLocalUrl } from '../fixtures/local-safety';
import { waitForScreenshotReady } from '../screen-review/assertions';

test.use({ serviceWorkers: 'block' });

const pocketBaseUrl = process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const RECORDS = '**/api/collections/*/records?*';
const HISTORY_FIELDS = new Set(['id,date', 'id,slot', 'id,day']);
const VIEWS = [
  { width: 1440, scheme: 'light' },
  { width: 1440, scheme: 'dark' },
  { width: 390, scheme: 'light' },
  { width: 390, scheme: 'dark' },
] as const;

const shiftDay = (day: string, offset: number) => {
  const cursor = new Date(`${day}T12:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + offset);
  return cursor.toISOString().slice(0, 10);
};
const fullDate = (day: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${day}T12:00:00Z`));
const streakLink = (page: Page, count: number) =>
  page.getByRole('link', { name: `${count}-day crafting streak. Opens Notes.`, exact: true });
const zeroLink = (page: Page) =>
  page.getByRole('link', { name: 'Start a crafting streak. Opens Notes.', exact: true });
const dayButton = (page: Page, day: string, state: string) =>
  page.getByRole('button', { name: `${fullDate(day)}, ${state}. Options`, exact: true });

async function selectMode(page: Page, mode: string) {
  await page.goto('/profile');
  await expect(page.getByText('Lets you track your consecutive crafting days!')).toBeVisible();
  await waitForScreenshotReady(page, 'Streak preference');
  await page.getByRole('combobox', { name: 'Crafting streak', exact: true }).press('Enter');
  await page.getByRole('option', { name: mode, exact: true }).focus();
  await page.keyboard.press('Enter');
}

/** Answers the streak history reads; returning undefined lets that read reach PocketBase. */
function historyRoute(respond: (route: Route, fields: string) => Promise<void> | undefined) {
  return async (route: Route) => {
    const fields = new URL(route.request().url()).searchParams.get('fields') ?? '';
    const handled = HISTORY_FIELDS.has(fields) ? respond(route, fields) : undefined;
    if (handled) await handled;
    else await route.continue();
  };
}

const emptyPage = (route: Route) =>
  route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ page: 1, perPage: 500, totalItems: 0, totalPages: 0, items: [] }),
  });

async function openDayMenu(page: Page, day: string, state: string, phone: boolean) {
  await dayButton(page, day, state).click();
  const surface = phone
    ? page.getByRole('dialog', { name: fullDate(day) })
    : page.getByRole('menu', { name: fullDate(day) });
  await expect(surface).toBeVisible();
  await surface.evaluate(element =>
    Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished))
  );
  return surface;
}

test('home streak week, day marks and unavailable state', async ({ page }, testInfo) => {
  test.skip(!isLocalUrl(appUrl) || !isLocalUrl(pocketBaseUrl), 'Disposable local backend only.');
  test.setTimeout(300_000);
  assertLocalE2ETargets({ appUrl, pocketBaseUrl, specName: 'Crafting streak' });
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) throw new Error('Local test identity is unavailable');
  const pb = new PocketBase(pocketBaseUrl);
  await pb.collection('users').authWithPassword(email, password);
  const user = pb.authStore.record;
  if (!user?.id || user.email !== email) throw new Error('Unexpected local test identity');
  const timezone = user.timezone || 'UTC';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  const yesterday = shiftDay(today, -1);
  const missed = shiftDay(today, -2);
  const earlier = shiftDay(today, -3);
  const deleteMarks = async () => {
    const marks = await pb
      .collection('crafting_day_marks')
      .getFullList({ filter: pb.filter('user = {:id}', { id: user.id }) });
    for (const mark of marks) await pb.collection('crafting_day_marks').delete(mark.id);
  };

  async function capture(name: string, open?: (phone: boolean) => Promise<unknown>) {
    for (const view of VIEWS) {
      await page.setViewportSize({ width: view.width, height: 900 });
      await page.emulateMedia({ colorScheme: view.scheme });
      await page.goto('/overview');
      await expect(page.getByRole('link', { name: /crafting streak/i }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: /loading/ })).toHaveCount(0);
      if (open) await open(view.width < 640);
      await waitForScreenshotReady(page, `Streak ${name}`);
      await page.screenshot({
        path: testInfo.outputPath(`${name}-${view.width}-${view.scheme}.png`),
      });
      if (open) await page.keyboard.press('Escape');
    }
  }

  await deleteMarks();
  const recentActivity = await pb.collection('crafting_activity').getList(1, 1, {
    filter: pb.filter('user = {:id} && slot >= {:since}', {
      id: user.id,
      since: new Date(Date.now() - 36 * 3_600_000).toISOString().replace('T', ' '),
    }),
  });

  let projectId: string | undefined;
  let coloringNoteId: string | undefined;
  try {
    await selectMode(page, 'Show on Home');

    await page.route(RECORDS, historyRoute(emptyPage));
    await capture('zero');
    await expect(zeroLink(page)).toBeVisible();
    await expect(zeroLink(page).locator('svg')).toHaveAttribute('fill', 'none');
    await expect(page.getByText('Start a crafting streak', { exact: true })).toBeVisible();
    await expect(page.getByRole('list', { name: 'This week' })).toHaveCount(0);
    await zeroLink(page).click();
    await expect(page).toHaveURL(/\/notes$/);
    await expect(page.getByRole('link', { name: /crafting streak/ })).toHaveCount(0);
    await page.unrouteAll();

    if (recentActivity.totalItems === 0) {
      await page.route(
        RECORDS,
        historyRoute((route, fields) => (fields === 'id,slot' ? undefined : emptyPage(route)))
      );
      await page.goto('/overview');
      await expect(zeroLink(page)).toBeVisible();
      const seeded = await pb.collection('projects').getOne('localproject003');
      await pb.collection('projects').update(seeded.id, { title: seeded.title });
      await page.reload();
      await expect(streakLink(page, 1)).toBeVisible();
      await expect(dayButton(page, today, 'crafted')).toBeVisible();
      await page.unrouteAll();
    } else {
      testInfo.annotations.push({
        type: 'skipped-step',
        description:
          'The test user already had recent activity, so the fresh edit check was skipped.',
      });
    }

    const project = await pb.collection('projects').create({
      user: user.id,
      title: 'Synthetic streak week test',
      status: 'progress',
      status_order: 4,
      kit_category: 'full',
    });
    projectId = project.id;
    await pb.collection('progress_notes').create({
      project: project.id,
      content: 'Synthetic crafting progress.',
      date: yesterday,
    });
    const coloringPage = await pb
      .collection('coloring_pages')
      .getFirstListItem("book = 'localcbook00001'");
    const coloringNote = await pb.collection('coloring_page_progress_notes').create({
      user: user.id,
      page: coloringPage.id,
      date: earlier,
      content: 'Synthetic coloring progress.',
    });
    coloringNoteId = coloringNote.id;

    await capture('missed-day');
    await expect(streakLink(page, 2)).toBeVisible();
    await expect(streakLink(page, 2).locator('svg')).toHaveAttribute('fill', 'currentColor');
    await expect(dayButton(page, today, 'crafted')).toBeVisible();
    await expect(dayButton(page, yesterday, 'crafted')).toBeVisible();
    await expect(dayButton(page, missed, 'missed')).toBeVisible();
    await expect(dayButton(page, earlier, 'crafted')).toBeVisible();

    await capture('missed-menu', async phone => {
      const menu = await openDayMenu(page, missed, 'missed', phone);
      await expect(menu.getByText('No activity this day')).toBeVisible();
    });
    await capture('activity-menu', async phone => {
      const menu = await openDayMenu(page, yesterday, 'crafted', phone);
      await expect(menu.getByText('Counted from your activity')).toBeVisible();
      await expect(menu.getByText('Mark as a crafting day')).toHaveCount(0);
    });

    for (const width of [1440, 390]) {
      const phone = width < 640;
      const action = phone ? 'button' : 'menuitem';
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/overview');
      const missedMenu = await openDayMenu(page, missed, 'missed', phone);
      await missedMenu.getByRole(action, { name: 'Mark as a crafting day' }).click();
      await expect(streakLink(page, 4)).toBeVisible();
      await expect(dayButton(page, missed, 'marked by you')).toBeVisible();
      await page.reload();
      await expect(streakLink(page, 4)).toBeVisible();

      if (!phone) {
        await capture('marked-menu', async isPhone => {
          const menu = await openDayMenu(page, missed, 'marked by you', isPhone);
          await expect(menu.getByText('Marked by you')).toBeVisible();
        });
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/overview');
      }

      const markedMenu = await openDayMenu(page, missed, 'marked by you', phone);
      await markedMenu.getByRole(action, { name: 'Unmark this day' }).click();
      await expect(streakLink(page, 2)).toBeVisible();
      await expect(dayButton(page, missed, 'missed')).toBeVisible();
    }

    await page.route(
      RECORDS,
      historyRoute(route =>
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"message":"Unavailable"}',
        })
      )
    );
    await page.reload();
    await expect(
      page.getByRole('link', { name: 'Crafting streak unavailable. Opens Notes.', exact: true })
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('list', { name: 'This week' })).toHaveCount(0);
    await page.unrouteAll();
    await selectMode(page, 'Off');
    await page.goto('/overview');
    await expect(page.getByRole('link', { name: /crafting streak/ })).toHaveCount(0);
  } finally {
    await deleteMarks();
    if (coloringNoteId) await pb.collection('coloring_page_progress_notes').delete(coloringNoteId);
    if (projectId) await pb.collection('projects').delete(projectId);
  }
});
