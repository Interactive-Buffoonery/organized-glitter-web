import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { libraryPageHeading } from '../libraryPage';

test.use({ serviceWorkers: 'block' });

async function waitForDraft(page: Page, text: string) {
  await page.waitForFunction(
    expected =>
      Object.keys(localStorage).some(
        key => key.startsWith('og:form-draft:v1:') && localStorage.getItem(key)?.includes(expected)
      ),
    text
  );
}

test('restores an unfinished coloring book after refresh', async ({ page }) => {
  const title = 'Unfinished coloring book draft';
  await page.goto('/coloring/new');
  const titleField = page.getByRole('textbox', { name: 'Title *', exact: true });
  await expect(titleField).toBeVisible();
  await titleField.fill(title);
  await waitForDraft(page, title);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Restore draft' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore draft' }).click();

  await expect(titleField).toHaveValue(title);
});

test('guards Back and discards an unfinished project only when confirmed', async ({ page }) => {
  const title = 'Unfinished project draft';
  await page.goto('/projects/new');
  const titleField = page.getByRole('textbox', { name: 'Project title', exact: true });
  await expect(titleField).toBeVisible();
  await titleField.fill(title);
  await waitForDraft(page, title);

  await Promise.all([
    page.waitForEvent('dialog').then(dialog => dialog.dismiss()),
    page.getByRole('button', { name: 'Back', exact: true }).click(),
  ]);
  await expect(page).toHaveURL(/\/projects\/new$/);
  await expect(titleField).toHaveValue(title);

  await Promise.all([
    page.waitForEvent('dialog').then(dialog => dialog.accept()),
    page.getByRole('button', { name: 'Back', exact: true }).click(),
  ]);
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
  await expect(libraryPageHeading(page)).toBeVisible();
  await page.goto('/projects/new', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Restore draft' })).toHaveCount(0);
  await expect(titleField).toHaveValue('');
});

test('reopened project edit guards a new image change after confirmed discard', async ({
  page,
}) => {
  await page.goto(`/projects/${process.env.E2E_FIXTURE_PROJECT_ID ?? 'localproject003'}`);
  const editButton = page.getByRole('button', { name: 'Edit project' });
  await editButton.click();
  const editor = page.getByRole('dialog', { name: 'Edit project' });
  await expect(editor).toBeVisible();
  await editor.getByRole('textbox', { name: 'Project title', exact: true }).fill('Unsaved title');

  await Promise.all([
    page.waitForEvent('dialog').then(dialog => dialog.accept()),
    editor.getByRole('button', { name: 'Cancel' }).click(),
  ]);
  await expect(editor).toHaveCount(0);

  await editButton.click();
  await expect(editor).toBeVisible();
  await editor
    .locator('input[type="file"]')
    .setInputFiles(fileURLToPath(new URL('../fixtures/portrait-cover.jpg', import.meta.url)));
  await page
    .getByRole('dialog', { name: 'Crop project image' })
    .getByRole('button', { name: 'Skip crop' })
    .click();

  await Promise.all([
    page.waitForEvent('dialog').then(dialog => dialog.dismiss()),
    editor.getByRole('button', { name: 'Cancel' }).click(),
  ]);
  await expect(editor).toBeVisible();
  await Promise.all([
    page.waitForEvent('dialog').then(dialog => dialog.accept()),
    editor.getByRole('button', { name: 'Cancel' }).click(),
  ]);
  await expect(editor).toHaveCount(0);
});

test('keeps an unfinished project while its save is pending and after rejection', async ({
  page,
}) => {
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('menuitem', { name: 'New Diamond Painting' }).click();
  await expect(page).toHaveURL(/\/projects\/new$/);
  const titleField = page.getByRole('textbox', { name: 'Project title', exact: true });
  await expect(titleField).toBeVisible();
  await titleField.fill('Pending project save');
  await waitForDraft(page, 'Pending project save');

  let releaseSave: () => void = () => {};
  let saveStarted: () => void = () => {};
  const pendingSave = new Promise<void>(resolve => {
    releaseSave = resolve;
  });
  const started = new Promise<void>(resolve => {
    saveStarted = resolve;
  });
  await page.route(/\/api\/collections\/projects\/records\/?$/, async route => {
    if (route.request().method() !== 'POST') return route.continue();
    saveStarted();
    await pendingSave;
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ code: 400, message: 'Save rejected', data: {} }),
    });
  });

  await page.getByRole('button', { name: 'Create project' }).click();
  await started;
  await page.evaluate(() => window.history.back());
  await expect(page).toHaveURL(/\/projects\/new$/);
  await expect(titleField).toHaveValue('Pending project save');

  releaseSave();
  await expect(page.getByRole('button', { name: 'Create project' })).toBeEnabled();
  await waitForDraft(page, 'Pending project save');
  await expect(titleField).toHaveValue('Pending project save');
});

test('requires a photo choice after restoring a coloring book draft', async ({ page }) => {
  const title = 'Coloring book with an unfinished cover';
  await page.goto('/coloring/new');
  await page.getByRole('textbox', { name: 'Title *', exact: true }).fill(title);
  await page
    .locator('#coloring-cover')
    .setInputFiles(fileURLToPath(new URL('../fixtures/portrait-cover.jpg', import.meta.url)));
  const cropDialog = page.getByRole('dialog', { name: 'Frame coloring book cover' });
  await expect(cropDialog).toBeVisible();
  await cropDialog.getByRole('button', { name: 'Skip crop' }).click();
  await waitForDraft(page, title);

  await page.reload();
  await page.getByRole('button', { name: 'Restore draft' }).click();
  await expect(page.getByRole('status')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add book', exact: true })).toBeDisabled();

  await page.getByRole('button', { name: 'Continue without new photo' }).click();
  await expect(page.getByRole('button', { name: 'Add book', exact: true })).toBeEnabled();
});
