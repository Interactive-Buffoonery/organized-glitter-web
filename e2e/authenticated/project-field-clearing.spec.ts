/**
 * Full project edit clearing contract.
 *
 * Creates disposable related records and a populated project directly through
 * PocketBase, clears every optional full-form field through the browser, then
 * reads the record back from PocketBase. The shared fixture project is never
 * mutated.
 */

import { expect, test } from '@playwright/test';
import PocketBase from 'pocketbase';
import { randomUUID } from 'node:crypto';

import { assertLocalE2ETargets } from '../fixtures/local-safety';

type ProjectRecord = {
  id: string;
  image?: string;
  title: string;
  user: string;
  company?: string;
  artist?: string;
  source_url?: string;
  general_notes?: string;
  date_purchased?: string;
  date_received?: string;
  date_started?: string;
  date_completed?: string;
  width?: number;
  height?: number;
  total_diamonds?: number;
  color_count?: number;
};

type RelatedRecord = {
  id: string;
  name: string;
  user: string;
};

const pocketBaseUrl = process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

const createClient = async () => {
  if (!email || !password) {
    throw new Error('Missing E2E_TEST_EMAIL or E2E_TEST_PASSWORD for project clearing E2E test.');
  }

  const pb = new PocketBase(pocketBaseUrl);
  await pb.collection('users').authWithPassword(email, password);
  if (!pb.authStore.record?.id) {
    throw new Error('PocketBase did not return an authenticated E2E user.');
  }
  return pb;
};

const deleteIfPresent = async (pb: PocketBase, collection: string, recordId: string | null) => {
  if (!recordId) return;

  try {
    await pb.collection(collection).delete(recordId);
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error ? error.status : null;
    if (status !== 404) throw error;
  }
};

test.describe('Full project edit field clearing', () => {
  let pb: PocketBase;
  let projectId: string | null = null;
  let companyId: string | null = null;
  let artistId: string | null = null;

  test.beforeAll(async () => {
    assertLocalE2ETargets({
      appUrl,
      pocketBaseUrl,
      specName: 'Full project edit field clearing',
    });
    pb = await createClient();
  });

  test.beforeEach(async () => {
    const userId = pb.authStore.record!.id;
    const suffix = randomUUID().slice(0, 8);
    const company = await pb.collection('companies').create<RelatedRecord>({
      user: userId,
      name: `E2E Clear Company ${suffix}`,
    });
    companyId = company.id;

    const artist = await pb.collection('artists').create<RelatedRecord>({
      user: userId,
      name: `E2E Clear Artist ${suffix}`,
    });
    artistId = artist.id;

    const project = await pb.collection('projects').create<ProjectRecord>({
      user: userId,
      title: `E2E Project Clear ${suffix}`,
      status: 'progress',
      kit_category: 'full',
      drill_shape: 'round',
      company: company.id,
      artist: artist.id,
      source_url: 'https://example.com/original-project',
      general_notes: 'Original project note',
      date_purchased: '2026-01-02',
      date_received: '2026-01-03',
      date_started: '2026-01-04',
      date_completed: '2026-01-05',
      width: 30.5,
      height: 40.5,
      total_diamonds: 12000,
      color_count: 48,
    });
    projectId = project.id;
  });

  test.afterEach(async () => {
    await deleteIfPresent(pb, 'projects', projectId);
    await deleteIfPresent(pb, 'companies', companyId);
    await deleteIfPresent(pb, 'artists', artistId);
    projectId = null;
    companyId = null;
    artistId = null;
  });

  test('persists every optional full-form clear instruction', async ({ page }) => {
    expect(projectId).toBeTruthy();
    await page.goto(`/projects/${projectId}/edit`);

    await expect(page.getByLabel('Title *')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('combobox', { name: 'Company' }).click();
    await page.getByRole('option', { name: 'No company' }).click();
    await page.getByRole('combobox', { name: 'Artist' }).click();
    await page.getByRole('option', { name: 'No artist' }).click();

    for (const dateLabel of ['date purchased', 'date received', 'date started', 'date completed']) {
      await page.getByRole('button', { name: `Clear ${dateLabel}` }).click();
    }

    for (const inputId of ['totalDiamonds', 'colorCount', 'width', 'height']) {
      await page.locator(`#${inputId}`).fill('');
    }

    await page.getByLabel('Source URL').fill('');
    await page.getByLabel('Project notes').fill('');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect
      .poll(
        async () => {
          const record = await pb.collection('projects').getOne<ProjectRecord>(projectId!);
          return {
            company: record.company,
            artist: record.artist,
            sourceUrl: record.source_url,
            generalNotes: record.general_notes,
            datePurchased: record.date_purchased,
            dateReceived: record.date_received,
            dateStarted: record.date_started,
            dateCompleted: record.date_completed,
            width: record.width,
            height: record.height,
            totalDiamonds: record.total_diamonds,
            colorCount: record.color_count,
          };
        },
        { timeout: 15_000 }
      )
      .toEqual({
        company: '',
        artist: '',
        sourceUrl: '',
        generalNotes: '',
        datePurchased: '',
        dateReceived: '',
        dateStarted: '',
        dateCompleted: '',
        width: 0,
        height: 0,
        totalDiamonds: 0,
        colorCount: 0,
      });
  });
});
