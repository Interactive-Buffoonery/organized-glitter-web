import { devices, expect, test, type Locator } from '@playwright/test';
import PocketBase from 'pocketbase';
import { randomUUID } from 'node:crypto';
import { assertLocalE2ETargets } from '../fixtures/local-safety';

const pocketBaseUrl = process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const browserName = process.env.E2E_TAG_BROWSER === 'webkit' ? 'webkit' : 'chromium';
test.use(
  browserName === 'webkit'
    ? { ...devices['iPhone 13'], browserName: 'webkit' }
    : { ...devices['Desktop Chrome'], browserName: 'chromium' }
);

async function expectNameError(input: Locator, message: string) {
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(input).toHaveAccessibleDescription(message);
  const errorId = await input.getAttribute('aria-describedby');
  expect(errorId).toBeTruthy();
  const error = input.page().locator(`[id="${errorId}"]`);
  await expect(error).toBeVisible();
  await expect(error).toHaveAttribute('aria-live', 'polite');
}

test('add and edit explain invalid names and save corrections through local PocketBase', async ({
  page,
}) => {
  test.setTimeout(90_000);
  assertLocalE2ETargets({ appUrl, pocketBaseUrl, specName: 'Tag name validation' });
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) throw new Error('Missing local E2E credentials.');
  const pb = new PocketBase(pocketBaseUrl);
  await pb.collection('users').authWithPassword(email, password);
  const name = `Validation ${randomUUID()}`;
  let tagId: string | undefined;

  try {
    await page.goto('/options/tags');
    await page.getByRole('button', { name: 'Add Tag', exact: true }).click();
    let dialog = page.getByRole('dialog');
    let input = dialog.getByRole('textbox', { name: /tag name/i });
    await expect(input).toHaveAttribute('required', '');
    await input.press('Enter');
    await expectNameError(input, 'Tag name cannot be empty');
    await expect(input).toBeFocused();
    await input.fill('   ');
    await dialog.getByRole('button', { name: 'Add Tag', exact: true }).click();
    await expectNameError(input, 'Tag name cannot be empty');
    await expect(input).toBeFocused();
    await input.fill('x'.repeat(101));
    await expectNameError(input, 'Tag name must be 100 characters or less');
    await input.fill(`  ${name}  `);
    await expect(input).toHaveAttribute('aria-invalid', 'false');
    await input.press('Enter');
    await expect(dialog).not.toBeVisible();
    const created = await pb
      .collection('tags')
      .getFirstListItem(pb.filter('name = {:name}', { name }));
    tagId = created.id;
    expect(created.name).toBe(name);

    const row = page.getByRole('row').filter({ hasText: name });
    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    dialog = page.getByRole('dialog');
    input = dialog.getByRole('textbox', { name: /tag name/i });
    await expect(input).toHaveAttribute('required', '');
    await input.fill('   ');
    await input.press('Enter');
    await expectNameError(input, 'Tag name cannot be empty');
    await expect(input).toBeFocused();
    await input.fill('x'.repeat(101));
    await expectNameError(input, 'Tag name must be 100 characters or less');
    await dialog.getByRole('button', { name: 'Update Tag' }).click();
    await expect(input).toBeFocused();
    const corrected = 'v'.repeat(100);
    await input.fill(`  ${corrected}  `);
    await expect(input).toHaveAttribute('aria-invalid', 'false');
    await expect(dialog.getByText('100/100')).toBeVisible();
    await input.press('Enter');
    await expect(dialog).not.toBeVisible();
    expect((await pb.collection('tags').getOne(tagId)).name).toBe(corrected);
  } finally {
    // Recover the id if a browser assertion failed immediately after creation.
    if (!tagId) {
      const records = await pb
        .collection('tags')
        .getFullList({ filter: pb.filter('name = {:name}', { name }) });
      tagId = records[0]?.id;
    }
    if (tagId) await pb.collection('tags').delete(tagId);
  }
});
