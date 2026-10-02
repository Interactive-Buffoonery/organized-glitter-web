import { expect, test, type Page } from '@playwright/test';

import { assertLocalE2ETargets } from '../fixtures/local-safety';

test.beforeEach(() => {
  assertLocalE2ETargets({
    appUrl: process.env.E2E_APP_URL ?? 'http://localhost:3000',
    pocketBaseUrl: process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090',
    specName: 'INT-1093 filter and validation QA',
  });
});

async function openColoringFilters(page: Page) {
  const filterButton = page.getByRole('button', { name: 'Filters (1 active)' });
  const desktopPanel = page.getByRole('region', { name: 'Coloring filters' });
  await expect(filterButton.or(desktopPanel)).toBeVisible();
  if (await filterButton.isVisible()) {
    await filterButton.click();
  }

  return page.getByRole('dialog', { name: 'Filters' }).or(desktopPanel);
}

test('project search keeps a one-character draft out of the URL', async ({ page }, testInfo) => {
  await page.goto('/dashboard');
  const search = page.getByRole('textbox', { name: 'Search project titles' });
  await expect(search).toBeVisible();

  await search.fill('a');
  await expect(
    page.getByText('Enter at least 2 characters to search.', { exact: true })
  ).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.has('search')).toBe(false);

  await search.fill('ab');
  await expect.poll(() => new URL(page.url()).searchParams.get('search')).toBe('ab');

  await search.fill('a');
  await expect.poll(() => new URL(page.url()).searchParams.has('search')).toBe(false);
  await expect(search).toHaveValue('a');
  await page.screenshot({
    path: testInfo.outputPath('project-search-minimum.png'),
    animations: 'disabled',
  });

  await search.fill('');
  await expect(
    page.getByText('Enter at least 2 characters to search.', { exact: true })
  ).toBeHidden();
});

test('a shared one-character project search normalizes before filtering', async ({ page }) => {
  await page.goto('/dashboard?search=a');
  const search = page.getByRole('textbox', { name: 'Search project titles' });
  await expect(search).toBeVisible();
  await expect(search).toHaveValue('');
  await expect.poll(() => new URL(page.url()).searchParams.has('search')).toBe(false);
});

test('a shared padded project search is trimmed in the input and URL', async ({ page }) => {
  await page.goto('/dashboard?search=%20%20Winter%20Moon%20%20');
  const search = page.getByRole('textbox', { name: 'Search project titles' });
  await expect(search).toHaveValue('Winter Moon');
  await expect.poll(() => new URL(page.url()).searchParams.get('search')).toBe('Winter Moon');
});

test('feedback uses trimmed 10 to 5,000 character boundaries', async ({ page }, testInfo) => {
  await page.goto('/profile');
  await page.getByRole('tab', { name: 'Support' }).click();
  await page.getByRole('button', { name: 'Send feedback' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share Your Feedback' });
  const message = dialog.getByRole('textbox', { name: 'Message' });
  const submit = dialog.getByRole('button', { name: 'Submit Feedback' });

  await expect(dialog.getByText('Enter 10 to 5,000 characters.')).toBeVisible();
  await message.fill('   123456789   ');
  await expect(submit).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath('feedback-short-message.png'),
    animations: 'disabled',
  });

  await message.fill('   1234567890   ');
  await expect(submit).toBeEnabled();
  await message.fill(`${'x'.repeat(5000)}   `);
  await expect(submit).toBeEnabled();
  await message.fill('x'.repeat(5001));
  await expect(submit).toBeDisabled();
});

test('explicit coloring statuses clear stale archive switches and URL flags', async ({
  page,
}, testInfo) => {
  await page.goto(
    '/dashboard?craft=coloring&status=in_progress&includeArchived=true&includeDestashed=true'
  );
  const panel = await openColoringFilters(page);
  await expect(panel).toBeVisible();
  const archived = panel.getByRole('switch', { name: 'Archived books' });
  const destashed = panel.getByRole('switch', { name: 'Destashed books' });

  await expect(archived).toBeDisabled();
  await expect(destashed).toBeDisabled();
  await expect(archived).not.toBeChecked();
  await expect(destashed).not.toBeChecked();
  await expect(
    panel.getByText(
      'Selected statuses control which books appear. Clear Status to use these switches.'
    )
  ).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.has('includeArchived')).toBe(false);
  await expect.poll(() => new URL(page.url()).searchParams.has('includeDestashed')).toBe(false);
  await archived.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('coloring-status-precedence.png') });

  await panel.getByRole('button', { name: 'Status filter. 1 statuses selected.' }).click();
  await page.getByRole('button', { name: 'Clear' }).last().click();
  await expect(archived).toBeEnabled();
  await expect(destashed).toBeEnabled();
  await expect.poll(() => new URL(page.url()).searchParams.has('status')).toBe(false);
});
