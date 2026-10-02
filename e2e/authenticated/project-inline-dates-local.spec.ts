import { expect, test } from '@playwright/test';
import PocketBase from 'pocketbase';
import { randomUUID } from 'node:crypto';

import { assertLocalE2ETargets } from '../fixtures/local-safety';

const pocketBaseUrl = process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

test('inline completion uses saved dates and updates a local project', async ({
  page,
}, testInfo) => {
  assertLocalE2ETargets({ appUrl, pocketBaseUrl, specName: 'Inline project dates' });
  if (!email || !password) throw new Error('Missing local E2E credentials.');

  const pb = new PocketBase(pocketBaseUrl);
  await pb.collection('users').authWithPassword(email, password);
  const project = await pb.collection('projects').create({
    user: pb.authStore.record!.id,
    title: `E2E Inline Dates ${randomUUID().slice(0, 8)}`,
    status: 'progress',
    kit_category: 'full',
    date_purchased: '2026-01-02',
    date_started: '2026-01-04',
  });

  try {
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole('button', { name: 'Edit Completed date' })).toBeVisible();

    await page.getByRole('button', { name: 'Edit Completed date' }).click();
    if (testInfo.project.name.includes('chromium')) {
      await page.getByRole('textbox', { name: 'Completed date' }).fill('8/31/2026');
      await expect
        .poll(async () =>
          page.getByRole('dialog').evaluate(dialog => {
            const rect = dialog.getBoundingClientRect();
            const scrollables = Array.from(dialog.querySelectorAll<HTMLElement>('*'))
              .filter(el => getComputedStyle(el).overflowY === 'auto')
              .map(el => ({ clientHeight: el.clientHeight, scrollHeight: el.scrollHeight }));
            return {
              fitsViewport: rect.top >= 0 && rect.bottom <= window.innerHeight,
              needsScroll: scrollables.some(
                region => region.scrollHeight > region.clientHeight + 1
              ),
            };
          })
        )
        .toEqual({ fitsViewport: true, needsScroll: false });

      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByRole('textbox', { name: 'Completed date' })).toHaveValue('8/31/2026');
      await page.setViewportSize({ width: 1280, height: 720 });
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Completed date' })).toHaveValue('8/31/2026');
    }
    await page.getByRole('textbox', { name: 'Completed date' }).fill('1/3/2026');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Completion date cannot be before start date')).toBeVisible();
    await expect
      .poll(async () => (await pb.collection('projects').getOne(project.id)).date_completed)
      .toBe('');

    await expect(page.getByRole('textbox', { name: 'Completed date' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Completed date' })).toHaveValue('2026-01-03');
    await page.getByRole('textbox', { name: 'Completed date' }).fill('1/5/2026');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect
      .poll(async () => {
        const saved = await pb.collection('projects').getOne(project.id);
        return { date: String(saved.date_completed).slice(0, 10), status: saved.status };
      })
      .toEqual({ date: '2026-01-05', status: 'completed' });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.getByRole('button', { name: 'Edit Completed date' }).click();
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect
      .poll(async () => {
        const saved = await pb.collection('projects').getOne(project.id);
        return { date: saved.date_completed, status: saved.status };
      })
      .toEqual({ date: '', status: 'completed' });
  } finally {
    await pb.collection('projects').delete(project.id);
  }
});
