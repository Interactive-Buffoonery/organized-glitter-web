import { expect, test } from '@playwright/test';
import PocketBase from 'pocketbase';

import { assertLocalE2ETargets } from '../fixtures/local-safety';

const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const pocketBaseUrl = process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090';

test.use({ serviceWorkers: 'block' });

test('clears diamond search and preserves sorting from both reset controls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const search = page.getByRole('textbox', { name: 'Search project titles' });
  const activeKit = page.getByRole('heading', { name: 'Local Active Kit', exact: true });
  const stashKit = page.getByRole('heading', { name: 'Local Stash Kit', exact: true });

  await page.goto('/dashboard?search=Local+Active+Kit&sort=kit_name&dir=asc');
  await expect(search).toHaveValue('Local Active Kit');
  await expect(activeKit).toBeVisible();
  await expect(stashKit).toBeHidden();

  await page.getByRole('button', { name: 'Reset all filters' }).click();
  await expect(search).toHaveValue('');
  await expect(stashKit).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]search=/);
  await expect(page).toHaveURL(/[?&]sort=kit_name/);

  await page.goto('/dashboard?search=No+matching+project&sort=kit_name&dir=asc');
  await page
    .getByRole('button', { name: /^Clear (all )?filters$/i })
    .last()
    .click();
  await expect(search).toHaveValue('');
  await expect(stashKit).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]search=/);
  await expect(page).toHaveURL(/[?&]sort=kit_name/);
});

for (const craft of ['diamond', 'coloring'] as const) {
  test(`clears a search with the ${craft} phone filter drawer`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const coloring = craft === 'coloring';
    const search = coloring
      ? page.getByRole('searchbox', { name: 'Search coloring books' })
      : page.getByRole('textbox', { name: 'Search project titles' });
    const param = coloring ? 'q' : 'search';
    await page.goto(`/dashboard?${coloring ? 'craft=coloring&' : ''}${param}=no+matching+title`);
    await expect(search).toHaveValue('no matching title');
    const trigger = page.getByRole('button', {
      name: coloring ? 'Filters (1 active)' : 'Open filters. 1 filter active',
      exact: true,
    });
    await trigger.click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByText(coloring ? '1 active' : '1 filter active')).toBeVisible();
    const reset = drawer.getByRole('button', { name: 'Reset', exact: true });
    await reset.click();
    await expect(drawer.getByText('No filters active')).toBeVisible();
    await expect(reset).toBeDisabled();
    await drawer.getByRole('button', { name: 'Close filters', exact: true }).last().click();
    await expect(search).toHaveValue('');
    await expect(page).not.toHaveURL(new RegExp(`[?&]${param}=`));
  });
}

for (const path of ['/dashboard', '/projects/new']) {
  test(`explains a disabled coloring tracker at ${path}`, async ({ page }) => {
    if (path === '/projects/new') await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/api/collections/user_dashboard_settings/records?*', async route => {
      const response = await route.fetch();
      const data = await response.json();
      for (const item of data.items ?? []) {
        item.vertical_enabled = { diamond_painting: true, coloring_books: false };
      }
      await route.fulfill({ response, json: data });
    });

    await page.goto(`${path}?craft=coloring`);
    await expect(page.getByText('The coloring tracker is off.')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${path}\\?craft=coloring$`));
    await page.getByRole('link', { name: 'Open tracker settings' }).click();
    const toggle = page.getByRole('switch', { name: 'Coloring books' });
    await expect(toggle).toBeEnabled();
    await expect(toggle).not.toBeChecked();
    await expect(toggle).toBeInViewport();
  });
}

test('keeps table metadata visible with a 240-character kit title', async ({ page }) => {
  assertLocalE2ETargets({ appUrl, pocketBaseUrl, specName: 'Dashboard long title' });
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) throw new Error('Missing E2E credentials for dashboard long title.');

  const pb = new PocketBase(pocketBaseUrl);
  const { record: user } = await pb.collection('users').authWithPassword(email, password);
  const title = 'A'.repeat(240);
  const project = await pb.collection('projects').create({
    user: user.id,
    title,
    company: 'localcompany001',
    status: 'stash',
    kit_category: 'full',
    drill_shape: 'square',
    width: 30,
    height: 40,
  });

  try {
    await page.addInitScript(() => localStorage.setItem('dashboard-view-type', 'table'));
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/dashboard?sort=kit_name&dir=asc');
      const projectButton = page.getByRole('button', { name: `Open project ${title}` });
      await expect(projectButton).toBeVisible();
      await projectButton.scrollIntoViewIfNeeded();
      await expect(projectButton.getByText(title, { exact: true })).toHaveAttribute('title', title);
      if (width === 1280) {
        const table = page.getByRole('table');
        const row = table.getByRole('row').filter({ has: projectButton });
        await expect(row.getByText('Local Sparkle Studio')).toBeInViewport();
        await expect(row.getByText('In Stash')).toBeInViewport();
        await expect(row.getByText(/30.*40.*Square/i)).toBeInViewport();
        expect(
          await table.evaluate(element => {
            const container = element.parentElement!;
            return container.scrollWidth <= container.clientWidth;
          })
        ).toBe(true);
      } else {
        await expect(projectButton.getByText('Local Sparkle Studio')).toBeInViewport();
        await expect(projectButton.getByText('In Stash')).toBeInViewport();
        await expect(projectButton.getByText(/30.*40.*Square/i)).toBeInViewport();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width
        );
      }
      const screenshotDir = process.env.E2E_LIBRARY_SCREENSHOTS;
      if (screenshotDir) {
        await page.screenshot({
          path: `${screenshotDir}/long-kit-title-${width}.png`,
          animations: 'disabled',
        });
      }
    }
  } finally {
    await pb.collection('projects').delete(project.id);
  }
});
