/**
 * Notes feed craft-journal timeline (#43).
 *
 * The /notes route renders the feed as a single dated timeline: month headings
 * (h2) act as chapter breaks that own the rail, each note carries a complete
 * weekday date, and an "Add a progress note" CTA is the entry point for logging
 * new notes. This spec proves the timeline actually renders real data:
 *
 *   1. A diamond-painting project and a progress note with a fixed date and a
 *      unique marker string are created via PocketBase.
 *   2. /notes shows the month heading derived from that note's date, the note's
 *      content, and a link to the owning project's detail page.
 *   3. The progress-note entry point (the "Add a progress note" button) is
 *      present.
 *
 * The project + note are created and torn down per run so the feed assertion is
 * deterministic regardless of any other notes on the E2E account. Deleting the
 * project cascades its progress note, but the note is also deleted explicitly
 * for resilience. Mirrors the create/teardown pattern in
 * e2e/authenticated/cover-image-update.spec.ts.
 */

import { expect, test } from '@playwright/test';
import PocketBase from 'pocketbase';
import { randomUUID } from 'node:crypto';

import { assertLocalE2ETargets } from '../fixtures/local-safety';

type RecordWithId = { id: string };

const pocketBaseUrl = process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

// A fixed, unambiguous date drives a deterministic month heading ("March 2024").
const NOTE_DATE = '2024-03-15';
const EXPECTED_MONTH_HEADING = 'March 2024';

const createClient = async () => {
  if (!email || !password) {
    throw new Error('Missing E2E_TEST_EMAIL or E2E_TEST_PASSWORD for notes-feed E2E test.');
  }
  const pb = new PocketBase(pocketBaseUrl);
  await pb.collection('users').authWithPassword(email, password);
  if (!pb.authStore.record?.id) {
    throw new Error('PocketBase did not return an authenticated E2E user.');
  }
  return pb;
};

test.describe('Notes feed timeline', () => {
  let pb: PocketBase;
  let projectId: string | null = null;
  let noteId: string | null = null;
  let projectTitle = '';
  let noteMarker = '';

  test.beforeAll(async () => {
    assertLocalE2ETargets({
      appUrl,
      pocketBaseUrl,
      specName: 'Notes feed timeline',
    });
    pb = await createClient();
    const runId = randomUUID().slice(0, 8);
    projectTitle = `E2E Notes Feed ${runId}`;
    noteMarker = `e2e-note-marker-${runId}`;

    const project = await pb.collection('projects').create<RecordWithId>({
      user: pb.authStore.record!.id,
      title: projectTitle,
      status: 'progress',
      kit_category: 'full',
    });
    projectId = project.id;

    const note = await pb.collection('progress_notes').create<RecordWithId>({
      project: project.id,
      content: noteMarker,
      date: NOTE_DATE,
    });
    noteId = note.id;
  });

  test.afterAll(async () => {
    const safeDelete = async (run: () => Promise<unknown>) => {
      try {
        await run();
      } catch (error) {
        const status =
          typeof error === 'object' && error && 'status' in error ? error.status : null;
        if (status !== 404) console.warn('Notes-feed teardown cleanup failed', error);
      }
    };
    if (noteId) await safeDelete(() => pb.collection('progress_notes').delete(noteId!));
    if (projectId) await safeDelete(() => pb.collection('projects').delete(projectId!));
  });

  test('renders the seeded note with its month heading, date, and project link', async ({
    page,
  }) => {
    await page.goto('/notes');

    // The timeline page heading confirms the route mounted.
    await expect(page.getByRole('heading', { name: 'Notes', exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // Progress-note entry point.
    await expect(page.getByRole('button', { name: 'Add a progress note' })).toBeVisible();

    // Month heading (h2) for the seeded note's date owns the timeline spine.
    await expect(page.getByRole('heading', { level: 2, name: EXPECTED_MONTH_HEADING })).toBeVisible(
      { timeout: 15_000 }
    );

    // The note content renders in the feed.
    await expect(page.getByText(noteMarker)).toBeVisible();

    // The entry links back to the owning project's detail page (per-note source).
    const projectLink = page.getByRole('link', { name: projectTitle });
    await expect(projectLink).toBeVisible();
    await expect(projectLink).toHaveAttribute('href', `/projects/${projectId}`);

    // Each note carries a complete weekday date label (NOTE_DATE is a Friday).
    await expect(page.getByText('Fri, Mar 15')).toBeVisible();
  });
});
