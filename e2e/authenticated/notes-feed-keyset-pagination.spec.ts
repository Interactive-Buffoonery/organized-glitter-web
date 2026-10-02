import { expect, test } from '@playwright/test';
import PocketBase from 'pocketbase';
import { randomUUID } from 'node:crypto';

import { assertLocalE2ETargets } from '../fixtures/local-safety';

type RecordWithId = { id: string };

type NoteRecord = {
  id: string;
  date: string;
  created: string;
};

const pocketBaseUrl = process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const NOTE_COUNT = 65;
const BATCH_SIZE = 31;
const NOTE_DATE = '2026-08-17';
const MAX_LOAD_MORE_CLICKS = 4;
const fixtureMarker = randomUUID().slice(0, 8);

const noteContent = (index: number) => `Pagination note ${index} ${fixtureMarker}`;

const createClient = async () => {
  if (!email || !password) {
    throw new Error('Missing E2E_TEST_EMAIL or E2E_TEST_PASSWORD for notes pagination test.');
  }

  const pb = new PocketBase(pocketBaseUrl);
  await pb.collection('users').authWithPassword(email, password);
  if (!pb.authStore.record?.id) {
    throw new Error('PocketBase did not return an authenticated E2E user.');
  }
  return pb;
};

test.describe('Notes feed keyset pagination', () => {
  let pb: PocketBase;
  let projectId: string | null = null;

  test.beforeAll(async () => {
    assertLocalE2ETargets({
      appUrl,
      pocketBaseUrl,
      specName: 'Notes feed keyset pagination',
    });
    pb = await createClient();

    const project = await pb.collection('projects').create<RecordWithId>({
      user: pb.authStore.record!.id,
      title: `E2E note pagination ${randomUUID().slice(0, 8)}`,
      status: 'progress',
      kit_category: 'full',
    });
    projectId = project.id;

    const noteIndexes = Array.from({ length: NOTE_COUNT }, (_, index) => index);
    for (let start = 0; start < noteIndexes.length; start += 10) {
      await Promise.all(
        noteIndexes.slice(start, start + 10).map(index =>
          pb.collection('progress_notes').create(
            {
              project: project.id,
              content: noteContent(index),
              date: NOTE_DATE,
            },
            { requestKey: null }
          )
        )
      );
    }
  });

  test.afterAll(async () => {
    if (!projectId) return;
    try {
      await pb.collection('projects').delete(projectId);
    } catch (error) {
      const status = typeof error === 'object' && error && 'status' in error ? error.status : null;
      if (status !== 404) throw error;
    }
  });

  test('returns every same-date note once across raw PocketBase cursors', async () => {
    expect(projectId).toBeTruthy();

    const ids: string[] = [];
    const rawDates: string[] = [];
    let cursor: NoteRecord | undefined;

    while (true) {
      const filter = cursor
        ? pb.filter(
            'project = {:projectId} && (date < {:cursorDate} || (date = {:cursorDate} && created < {:cursorCreated}) || (date = {:cursorDate} && created = {:cursorCreated} && id < {:cursorId}))',
            {
              projectId,
              cursorDate: cursor.date,
              cursorCreated: cursor.created,
              cursorId: cursor.id,
            }
          )
        : pb.filter('project = {:projectId}', { projectId });
      const result = await pb.collection('progress_notes').getList<NoteRecord>(1, BATCH_SIZE, {
        filter,
        sort: '-date,-created,-id',
        fields: 'id,date,created',
        requestKey: null,
      });

      ids.push(...result.items.map(note => note.id));
      rawDates.push(...result.items.map(note => note.date));
      if (result.items.length < BATCH_SIZE) break;
      cursor = result.items.at(-1);
    }

    expect(ids).toHaveLength(NOTE_COUNT);
    expect(new Set(ids).size).toBe(NOTE_COUNT);
    expect(rawDates).toHaveLength(NOTE_COUNT);
    expect(rawDates[0]).toMatch(/^2026-08-17(?:T| )00:00:00/);
    expect(rawDates[0]).not.toBe(NOTE_DATE);
    expect(new Set(rawDates).size).toBe(1);
  });

  test('renders every fixture note once through the merged notes feed', async ({ page }) => {
    await page.goto('/notes');
    await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();

    const fixtureNotes = page.getByText(new RegExp(`^Pagination note \\d+ ${fixtureMarker}$`));
    for (let clickCount = 0; clickCount < MAX_LOAD_MORE_CLICKS; clickCount += 1) {
      if ((await fixtureNotes.count()) === NOTE_COUNT) break;

      const loadMore = page.getByRole('button', { name: 'Load more notes' });
      await expect(loadMore).toBeVisible();
      const previousCount = await fixtureNotes.count();
      await loadMore.click();
      await expect.poll(() => fixtureNotes.count()).toBeGreaterThan(previousCount);
    }

    const renderedNotes = await fixtureNotes.allTextContents();
    expect(renderedNotes).toHaveLength(NOTE_COUNT);
    expect(new Set(renderedNotes).size).toBe(NOTE_COUNT);
    expect(new Set(renderedNotes)).toEqual(
      new Set(Array.from({ length: NOTE_COUNT }, (_, index) => noteContent(index)))
    );
  });
});
