import { expect, test } from '@playwright/test';
import { assertLocalE2ETargets } from '../fixtures/local-safety';

test.use({ serviceWorkers: 'block', reducedMotion: 'no-preference' });

test.beforeEach(async ({ page, baseURL }) => {
  assertLocalE2ETargets({
    appUrl: baseURL,
    pocketBaseUrl: process.env.VITE_POCKETBASE_URL,
    specName: 'Randomizer interruption regression',
  });
  await page.goto('/randomizer');
  await expect(
    page.getByRole('button', { name: /^Spin the wheel to randomly select/ })
  ).toBeEnabled();
});

test('clearing and restoring the selection cancels the spin and allows a new pick', async ({
  page,
}) => {
  const spin = page.getByRole('button', { name: /^Spin the wheel to randomly select/ });
  await spin.click();
  await expect(page.getByRole('button', { name: /Spinning/ })).toBeVisible();
  await page.getByRole('button', { name: 'Deselect all', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Randomizer wheel with/ })).toHaveCount(0);
  await page
    .getByRole('region', { name: 'Choose items' })
    .getByRole('button', { name: 'Select all', exact: true })
    .click();
  await expect(spin).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Clear result', exact: true })).toHaveCount(0);
  await spin.click();
  await expect(page.getByRole('button', { name: 'Clear result', exact: true })).toBeVisible({
    timeout: 8000,
  });
  await expect(page.getByText('Selected diamond painting', { exact: true })).toBeVisible();
});

test('wheel click activation records exactly one result', async ({ page }) => {
  let writes = 0;
  page.on('request', request => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/collections/randomizer_spins/records'
    ) {
      writes += 1;
    }
  });
  const wheel = page.getByRole('button', { name: /^Randomizer wheel with \d+ items$/ });
  const savedSpin = page.waitForResponse(
    response =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/collections/randomizer_spins/records'
  );
  await wheel.click();
  await expect(page.getByRole('button', { name: /Spinning/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear result', exact: true })).toBeVisible({
    timeout: 8000,
  });
  const response = await savedSpin;
  expect(response.ok()).toBe(true);
  expect((await response.json()).id).toEqual(expect.any(String));
  await expect.poll(() => writes).toBe(1);
});

test('a keyboard page pick announces the result and moves focus from the replaced action', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Coloring books', exact: true }).click();
  const wheel = page.getByRole('button', { name: /^Randomizer wheel with \d+ items$/ });
  await expect(wheel).toHaveAttribute('aria-disabled', 'false');
  await wheel.click();
  const pagePick = page.getByRole('button', { name: 'Pick a page', exact: true });
  await expect(pagePick).toBeVisible({ timeout: 8000 });
  await pagePick.focus();
  await pagePick.press('Enter');
  await expect(page.getByText('Selected coloring page', { exact: true })).toBeVisible();
  const resultHeading = page.getByRole('heading', { name: /, page \d+$/i });
  await expect(resultHeading).toBeFocused();
  await expect(page.getByRole('status').filter({ hasText: /^Selected page:/ })).toBeVisible();
});

for (const mode of ['Diamond paintings', 'Coloring books', 'Coloring pages']) {
  test(`select none survives empty filters and reload for ${mode}`, async ({ page }) => {
    await page.getByRole('button', { name: mode, exact: true }).click();
    const deselect = page.getByRole('button', { name: 'Deselect all', exact: true });
    await expect(deselect).toBeVisible();
    await deselect.click();
    const statuses = page
      .getByRole('group', { name: /^(Project|Book|Page) status$/ })
      .getByRole('checkbox');
    const selectedStatuses: number[] = [];
    for (let index = 0; index < (await statuses.count()); index += 1) {
      if (await statuses.nth(index).isChecked()) selectedStatuses.push(index);
    }
    expect(selectedStatuses.length).toBeGreaterThan(0);
    for (const index of selectedStatuses) await statuses.nth(index).uncheck();
    await expect(page.getByText('Nothing matches these filters.', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/items=none/);
    await page.reload();
    await expect(page.getByText('Nothing matches these filters.', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/items=none/);
    for (const index of selectedStatuses) await statuses.nth(index).check();
    await expect(deselect).toBeVisible();
    await expect(page.getByRole('button', { name: /^Randomizer wheel with/ })).toHaveCount(0);
    await expect(page).toHaveURL(/items=none/);
  });
}
