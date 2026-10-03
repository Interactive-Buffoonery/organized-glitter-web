import { expect, test } from '@playwright/test';

import { expectNoStructuralAxeViolations } from '../a11y/axe-test';

test('feedback success retains the dialog name and announces delivery', async ({
  page,
}, testInfo) => {
  await page.route('**/api/organized-glitter/feedback', async route => {
    await route.fulfill({ status: 200, json: { success: true } });
  });
  await page.goto('/profile');
  await page.getByRole('tab', { name: 'Support' }).click();
  await page.getByRole('button', { name: 'Send feedback' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share Your Feedback' });
  const status = dialog.getByRole('status');
  await expect(status).toBeEmpty();
  await dialog.getByRole('textbox', { name: 'Message' }).fill('Feedback accessibility regression.');
  await dialog.getByRole('button', { name: 'Submit Feedback' }).click();
  await expect(status).toHaveText('Thank you for your message!');
  await expect(dialog).toBeVisible();
  await expectNoStructuralAxeViolations(page);
  await page.screenshot({
    path: testInfo.outputPath('feedback-success.png'),
    animations: 'disabled',
  });
});
